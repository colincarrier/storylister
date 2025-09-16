// Storylister backend core (no UI).
// - Injects page-world interceptor (injected.js)
// - Opens "Seen by" gently and auto-scrolls the modal (to let IG load viewers)
// - Parses viewer chunks (from injected.js) and stores them in IndexedDB
// - Exposes `window.StorylisterCore` for your existing UI to subscribe and drive UX
(function(){
  'use strict';

  const CONFIG = {
    HUMAN_DELAY: {min: 90, max: 650},
    MICRO_DELAY: {min: 30, max: 90},
    SCROLL_BURST_MS: 10000,
    FREE_RETENTION_MS: 24*60*60*1000,
    FREE_STORY_LIMIT: 3
  };

  // ---------- tiny helpers ----------
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
  const jitter = (min=CONFIG.HUMAN_DELAY.min, max=CONFIG.HUMAN_DELAY.max)=> Math.floor(Math.random()*(max-min+1))+min;
  const now = ()=> Date.now();

  // ---------- IndexedDB ----------
  const idb = {
    db: null,
    async open(){
      if(this.db) return this.db;
      this.db = await new Promise((resolve, reject)=>{
        const req = indexedDB.open('storylister-db', 1);
        req.onupgradeneeded = ()=>{
          const db = req.result;
          if(!db.objectStoreNames.contains('stories')){
            const st = db.createObjectStore('stories', {keyPath:'storyId'});
            st.createIndex('fetchedAt','fetchedAt');
          }
          if(!db.objectStoreNames.contains('meta')){
            db.createObjectStore('meta', {keyPath:'key'});
          }
        };
        req.onsuccess = ()=> resolve(req.result);
        req.onerror = ()=> reject(req.error);
      });
      return this.db;
    },
    async putStory(doc){
      const db = await this.open();
      await new Promise((resolve,reject)=>{
        const tx = db.transaction('stories','readwrite');
        tx.objectStore('stories').put(doc);
        tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
      });
      await this.prune();
    },
    async getStory(id){
      const db = await this.open();
      return await new Promise((resolve,reject)=>{
        const tx = db.transaction('stories','readonly');
        const req = tx.objectStore('stories').get(id);
        req.onsuccess = ()=> resolve(req.result || null);
        req.onerror   = ()=> reject(req.error);
      });
    },
    async listIdsNewest(){
      const db = await this.open();
      return await new Promise((resolve,reject)=>{
        const ids=[];
        const tx = db.transaction('stories','readonly');
        const idx = tx.objectStore('stories').index('fetchedAt');
        idx.openCursor(null, 'prev').onsuccess = (e)=>{
          const c = e.target.result; if(c){ ids.push(c.value.storyId); c.continue(); } else resolve(ids);
        };
        tx.onerror = ()=> reject(tx.error);
      });
    },
    async prune(){
      const db = await this.open();
      const nowTs = Date.now();
      const ids = await this.listIdsNewest();
      const toDelete = [];
      if(ids.length > CONFIG.FREE_STORY_LIMIT){
        toDelete.push(...ids.slice(CONFIG.FREE_STORY_LIMIT));
      }
      for(const id of ids){
        const doc = await this.getStory(id);
        if(doc && nowTs - (doc.fetchedAt||0) > CONFIG.FREE_RETENTION_MS) toDelete.push(id);
      }
      if(toDelete.length){
        await new Promise((resolve,reject)=>{
          const tx = db.transaction('stories','readwrite');
          const st = tx.objectStore('stories');
          toDelete.forEach(id=> st.delete(id));
          tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
        });
      }
    }
  };

  // ---------- state (no-UI) ----------
  const seenEver = new Set(JSON.parse(localStorage.getItem('sl_seen_ever')||'[]'));
  function persistSeen(){ localStorage.setItem('sl_seen_ever', JSON.stringify([...seenEver].slice(0,200000))); }

  let currentStoryId = null;
  const store = Object.create(null); // storyId -> {viewerMap: Map, fetchedAt: number}
  let autoScrollTimer = null;

  function ensureBucket(storyId){
    if(!store[storyId]){
      store[storyId] = { viewerMap: new Map(), fetchedAt: now() };
    }
    currentStoryId = storyId;
  }

  function normalize(u){
    return {
      id: String(u.id || u.pk),
      username: u.username || '',
      displayName: u.full_name || '',
      profilePic: u.profile_pic_url || u.profile_pic_url_hd || '',
      isVerified: !!u.is_verified,
      followsViewer: !!u.follows_viewer || !!(u.friendship_status && u.friendship_status.following),
      followedByViewer: !!u.followed_by_viewer || !!(u.friendship_status && u.friendship_status.followed_by),
      viewedAt: now()
    };
  }

  function emitUpdate(){
    const detail = getState();
    // CustomEvent for any UI to subscribe
    document.dispatchEvent(new CustomEvent('StorylisterCoreUpdate', {detail}));
  }

  function getState(){
    const bucket = store[currentStoryId];
    const viewers = bucket ? Array.from(bucket.viewerMap.values()) : [];
    const newCount = viewers.reduce((n,v)=> n + (seenEver.has(v.id)?0:1), 0);
    return {
      storyId: currentStoryId,
      total: viewers.length,
      newCount,
      viewers
    };
  }

  // ---------- page-world injection ----------
  function inject(){
    if(document.documentElement.querySelector('script[data-storylister-injected]')) return;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.setAttribute('data-storylister-injected','1');
    (document.head || document.documentElement).appendChild(s);
    s.onload = ()=> s.remove();
  }

  // ---------- open & scroll IG dialog (no direct API calls) ----------
  function findSeenByEl(){
    let el = document.querySelector('a[href*="/seen_by/"]');
    if(el) return el;
    const candidates = Array.from(document.querySelectorAll('button,a,div[role="button"],span'));
    return candidates.find(n => /^(seen by|viewers)/i.test((n.textContent||'').trim())) || null;
  }

  async function openViewersModal(){
    await sleep(jitter());
    const el = findSeenByEl();
    if(!el) return false;
    ['mouseenter','mouseover','mousedown','mouseup','click'].forEach((t,i)=>{
      setTimeout(()=>{
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:r.left+Math.random()*r.width,clientY:r.top+Math.random()*r.height}));
      }, i*CONFIG.MICRO_DELAY.min);
    });
    return true;
  }

  function getScrollable(){
    const dialog = Array.from(document.querySelectorAll('div[role="dialog"]')).find(d => /viewers/i.test(d.textContent||''));
    if(!dialog) return null;
    const nodes = dialog.querySelectorAll('*');
    for(const n of nodes){
      const cs = getComputedStyle(n);
      if((cs.overflowY==='auto' || cs.overflowY==='scroll') && n.scrollHeight>n.clientHeight) return n;
    }
    return dialog;
  }

  function startAutoScroll(ms=CONFIG.SCROLL_BURST_MS){
    const list = getScrollable();
    if(!list) return;
    if(autoScrollTimer) clearInterval(autoScrollTimer);
    const start = Date.now();
    autoScrollTimer = setInterval(()=>{
      list.scrollTop = list.scrollHeight;
      if(Date.now()-start >= ms){
        clearInterval(autoScrollTimer);
        autoScrollTimer = null;
        document.dispatchEvent(new CustomEvent('StorylisterCorePaused'));
      }
    }, 120);
  }

  function stopAutoScroll(){
    if(autoScrollTimer) clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }

  function markCurrentAsSeen(){
    const bucket = store[currentStoryId];
    if(!bucket) return;
    for(const id of bucket.viewerMap.keys()) seenEver.add(id);
    persistSeen();
  }

  // ---------- message bridge from injected.js ----------
  window.addEventListener('message', (evt)=>{
    if(evt.source !== window || !evt.data) return;
    const msg = evt.data;
    if(msg.type === 'STORYLISTER_VIEWERS_CHUNK' && msg.data){
      const { mediaId, viewers, pageInfo, totalCount } = msg.data;
      ensureBucket(mediaId || currentStoryId || 'unknown');
      const bucket = store[mediaId || currentStoryId];
      for(const u of viewers){
        const v = normalize(u);
        if(!bucket.viewerMap.has(v.id)) bucket.viewerMap.set(v.id, v);
      }
      // persist compactly
      const compact = Array.from(bucket.viewerMap.values()).map(v=>({id:v.id, username:v.username, displayName:v.displayName, profilePic:v.profilePic, isVerified:v.isVerified, viewedAt:v.viewedAt}));
      idb.putStory({storyId: mediaId || currentStoryId, viewers: compact, fetchedAt: bucket.fetchedAt}).catch(()=>{});
      emitUpdate();
    }
    if(msg.type === 'STORYLISTER_READY'){
      // no-op; useful for logs
    }
  });

  // ---------- URL change detection (no UI) ----------
  let lastPath = null;
  function onNav(){
    inject();
    const path = location.pathname;
    if(path === lastPath) return;
    lastPath = path;

    if(!/\/stories\//.test(path)){
      markCurrentAsSeen();
      currentStoryId = null;
      return;
    }
    const m = path.match(/\/stories\/[^\/]+\/(\d+)/);
    if(m){
      ensureBucket(m[1]);
      openViewersModal().then(()=> startAutoScroll(CONFIG.SCROLL_BURST_MS));
    }
  }
  const mo = new MutationObserver(()=> onNav());
  mo.observe(document.documentElement, {childList:true, subtree:true, attributes:true});
  onNav();

  // respond to popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse)=>{
    if(msg && msg.action === 'checkStoryViewer'){
      sendResponse({hasViewer: !!currentStoryId});
      return false;
    }
  });

  // expose API for existing UI to consume
  window.StorylisterCore = {
    getState,
    openViewers: openViewersModal,
    startAutoScroll,
    stopAutoScroll,
    markCurrentAsSeen,
    onUpdate(fn){
      document.addEventListener('StorylisterCoreUpdate', (e)=> fn(e.detail));
    },
    onPause(fn){
      document.addEventListener('StorylisterCorePaused', fn);
    }
  };

  // cleanup interval
  setInterval(()=> idb.prune().catch(()=>{}), 30*60*1000);

})();
