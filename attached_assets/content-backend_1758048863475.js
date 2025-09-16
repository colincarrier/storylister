// content-backend.js
// Backend-only layer that injects injected.js, persists viewers to IndexedDB, and exposes a small API.
// It makes ZERO changes to your UI/DOM. Your existing content.js continues to render the panel.
//
// Load order (manifest): this file must load BEFORE your existing content.js.
(function(){
  'use strict';

  const CONFIG = {
    FREE_RETENTION_MS: 24*60*60*1000,    // keep stories for 24h (free tier)
    FREE_STORY_LIMIT: 3,                 // keep newest 3 stories
    DEBUG: false
  };

  // ---- simple logger ----
  const log = (...a)=> CONFIG.DEBUG && console.log('[SL:backend]', ...a);
  const warn = (...a)=> CONFIG.DEBUG && console.warn('[SL:backend]', ...a);
  const err = (...a)=> console.error('[SL:backend]', ...a);

  // ---- IndexedDB schema ----
  // stories: { storyId:string, fetchedAt:number, viewers: Array<Viewer> }
  // people:  { id:string, username:string, displayName:string, firstSeenAt:number, lastSeenAt:number, verified?:boolean, tags?:string[] }
  const idb = {
    db: null,
    async open() {
      if (this.db) return this.db;
      this.db = await new Promise((resolve, reject)=>{
        const req = indexedDB.open('storylister-db', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('stories')) {
            const st = db.createObjectStore('stories', { keyPath: 'storyId' });
            st.createIndex('fetchedAt', 'fetchedAt');
          }
          if (!db.objectStoreNames.contains('people')) {
            const ppl = db.createObjectStore('people', { keyPath: 'id' });
            ppl.createIndex('username', 'username', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this.db;
    },
    async putStory(doc){
      const db = await this.open();
      await new Promise((resolve, reject)=>{
        const tx = db.transaction('stories','readwrite');
        tx.objectStore('stories').put(doc);
        tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
      });
      await this.prune();
    },
    async getStory(storyId){
      const db = await this.open();
      return await new Promise((resolve, reject)=>{
        const tx = db.transaction('stories','readonly');
        const req = tx.objectStore('stories').get(storyId);
        req.onsuccess = ()=> resolve(req.result || null);
        req.onerror = ()=> reject(req.error);
      });
    },
    async listStoryIdsNewest(){
      const db = await this.open();
      return await new Promise((resolve, reject)=>{
        const tx = db.transaction('stories','readonly');
        const idx = tx.objectStore('stories').index('fetchedAt');
        const ids = [];
        idx.openCursor(null, 'prev').onsuccess = (e)=>{
          const c = e.target.result;
          if (c) { ids.push(c.value.storyId); c.continue(); }
          else resolve(ids);
        };
        tx.onerror = ()=> reject(tx.error);
      });
    },
    async upsertPerson(p){
      const db = await this.open();
      await new Promise((resolve,reject)=>{
        const tx = db.transaction('people', 'readwrite');
        const store = tx.objectStore('people');
        const getReq = store.get(p.id);
        getReq.onsuccess = ()=>{
          const existing = getReq.result;
          const merged = existing ? {
            ...existing,
            username: p.username || existing.username,
            displayName: p.displayName || existing.displayName,
            verified: (p.verified!==undefined ? p.verified : existing.verified),
            lastSeenAt: Math.max(existing.lastSeenAt||0, p.lastSeenAt||0),
            firstSeenAt: Math.min(existing.firstSeenAt||p.firstSeenAt||Date.now(), existing.firstSeenAt||Date.now()),
          } : {
            id: p.id,
            username: p.username||'',
            displayName: p.displayName||'',
            verified: !!p.verified,
            firstSeenAt: p.firstSeenAt || Date.now(),
            lastSeenAt: p.lastSeenAt || Date.now(),
            tags: []
          };
          store.put(merged);
        };
        tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
      });
    },
    async prune(){
      // apply 24h TTL and keep only newest N stories
      const now = Date.now();
      const ids = await this.listStoryIdsNewest();
      const toDelete = [];
      // delete older than TTL
      for (const id of ids){
        const doc = await this.getStory(id);
        if (doc && now - (doc.fetchedAt||0) > CONFIG.FREE_RETENTION_MS) toDelete.push(id);
      }
      // keep only newest N
      if (ids.length > CONFIG.FREE_STORY_LIMIT){
        toDelete.push(...ids.slice(CONFIG.FREE_STORY_LIMIT));
      }
      if (toDelete.length){
        const db = await this.open();
        await new Promise((resolve,reject)=>{
          const tx = db.transaction('stories','readwrite');
          const st = tx.objectStore('stories');
          toDelete.forEach(id => st.delete(id));
          tx.oncomplete = resolve; tx.onerror = ()=>reject(tx.error);
        });
      }
    }
  };

  // ---- backend state (does not touch UI DOM) ----
  const state = {
    currentStoryId: null,
    stories: new Map(),  // storyId -> Map(viewerId -> viewer)
    seenEver: new Set(JSON.parse(localStorage.getItem('sl_seen_ever')||'[]')),
    listeners: new Set(),   // subscribers for updates
    pauseListeners: new Set()
  };

  function persistSeenEver(){
    // keep it because legacy UI may rely on it
    localStorage.setItem('sl_seen_ever', JSON.stringify([...state.seenEver].slice(0,200000)));
  }

  function normalizeViewer(u){
    return {
      id: String(u.id || u.pk),
      username: u.username || '',
      displayName: u.full_name || '',
      profilePic: u.profile_pic_url || u.profile_pic_url_hd || '',
      isVerified: !!u.is_verified,
      isPrivate: !!u.is_private,
      followsViewer: !!u.follows_viewer,
      followedByViewer: !!u.followed_by_viewer,
      viewedAt: Date.now()
    };
  }

  function ensureBucket(storyId){
    if (!state.stories.has(storyId)){
      state.stories.set(storyId, new Map());
    }
    state.currentStoryId = storyId;
  }

  function publish(){
    const storyId = state.currentStoryId;
    const viewers = storyId ? Array.from(state.stories.get(storyId)?.values()||[]) : [];
    const payload = {
      storyId,
      total: viewers.length,
      newCount: viewers.filter(v => !state.seenEver.has(v.id)).length,
      viewers
    };
    state.listeners.forEach(fn=>{ try{ fn(payload); }catch(e){ err('listener error', e);} });
  }

  // ---- page-world injector for network interception ----
  function inject(){
    if (document.documentElement.querySelector('script[data-storylister-injected]')) return;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.setAttribute('data-storylister-injected','1');
    s.onload = ()=> s.remove();
    (document.head || document.documentElement).appendChild(s);
    log('injected.js appended');
  }

  // ---- message bridge from injected.js ----
  window.addEventListener('message', (evt)=>{
    if (evt.source !== window || !evt.data) return;
    const msg = evt.data;
    if (msg.type === 'STORYLISTER_VIEWERS_CHUNK' && msg.data){
      const { mediaId, viewers } = msg.data;
      const sid = mediaId || state.currentStoryId || 'unknown';
      ensureBucket(sid);
      const bucket = state.stories.get(sid);
      for (const u of viewers){
        const v = normalizeViewer(u);
        if (!bucket.has(v.id)) {
          bucket.set(v.id, v);
        } else {
          // update last seen time
          const prev = bucket.get(v.id);
          if (v.viewedAt > (prev.viewedAt||0)) bucket.set(v.id, {...prev, viewedAt: v.viewedAt});
        }
        // people index
        idb.upsertPerson({
          id: v.id, username: v.username, displayName: v.displayName,
          verified: v.isVerified, lastSeenAt: v.viewedAt, firstSeenAt: v.viewedAt
        }).catch(()=>{});
      }
      // persist story snapshot
      idb.putStory({
        storyId: sid,
        fetchedAt: Date.now(),
        viewers: Array.from(bucket.values())
      }).catch(()=>{});

      publish();
    }
  });

  // ---- public API for future UI (non-breaking for your current UI) ----
  const api = {
    onUpdate(fn){ state.listeners.add(fn); return ()=>state.listeners.delete(fn); },
    onPause(fn){ state.pauseListeners.add(fn); return ()=>state.pauseListeners.delete(fn); },
    getState(){
      const sid = state.currentStoryId;
      return {
        storyId: sid,
        viewers: sid ? Array.from(state.stories.get(sid)?.values()||[]) : [],
        seenEverSize: state.seenEver.size
      };
    },
    markCurrentAsSeen(){
      const sid = state.currentStoryId;
      if (!sid) return;
      const bucket = state.stories.get(sid);
      if (!bucket) return;
      for (const id of bucket.keys()) state.seenEver.add(id);
      persistSeenEver();
    },
    // simple helper for unit tests / console
    __debug(){ return {state}; }
  };
  window.StorylisterCore = api;

  // ---- navigation watcher: track current storyId (does not touch UI) ----
  function onNav(){
    const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    if (m){
      ensureBucket(m[1]);
    }
  }
  const mo = new MutationObserver(onNav);
  mo.observe(document.documentElement, {subtree:true, childList:true, attributes:true});
  onNav();

  // ---- boot ----
  inject();
  log('backend ready');
})();