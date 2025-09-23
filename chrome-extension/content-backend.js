(() => {
  'use strict';

  // ==== [A] TOP OF FILE: state + Settings ====
  const DEBUG = false;

  const state = {
    injected: false,
    currentKey: null,          // stable key = location.pathname (works with and w/o numeric id)
    autoOpenInProgress: false,
    openedForKey: new Set(),   // prevent re-opening
    stopPagination: null,
    viewerStore: new Map(),    // Map<storyKey, Map<viewerKey, viewer>>
    mirrorTimer: null,
    idToKey: new Map(),        // Map<mediaId -> storyKey>
  };

  const Settings = {
    // Defaults that should "just work"
    cache: { pro: false, autoOpen: true, pauseVideos: true, accountHandle: null },

    async load() {
      try {
        const data = await new Promise(r => chrome.storage?.sync?.get?.(null, r));
        if (data) Object.assign(this.cache, data);
      } catch (e) {
        // Fallback when extension context gets invalidated
        try {
          const raw = localStorage.getItem('sl_settings');
          if (raw) Object.assign(this.cache, JSON.parse(raw));
        } catch {}
      }
    },

    async save(patch) {
      Object.assign(this.cache, patch);
      try {
        await new Promise(r => chrome.storage?.sync?.set?.(patch, r));
      } catch (e) {
        // Persist anyway
        try { localStorage.setItem('sl_settings', JSON.stringify(this.cache)); } catch {}
      }
    }
  };

  // ==== [B] UTILITIES ====
  function getStorageKey() { return location.pathname; }  // first-story safe

  function findSeenByButton() {
    return document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('[role="button"],button'))
             .find(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent||'').trim())) || null;
  }

  async function waitForSeenByButton(timeout = 5000, interval = 150) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const btn = findSeenByButton();
      if (btn) return btn;
      await new Promise(r => setTimeout(r, interval));
    }
    return null;
  }

  function findScrollableInDialog() {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    return dlg.querySelector('[style*="overflow-y"]') ||
           dlg.querySelector('[style*="overflow: hidden auto"]') ||
           Array.from(dlg.querySelectorAll('div')).find(el => el.scrollHeight > el.clientHeight + 40) ||
           dlg;
  }

  function getSeenByCount() {
    const link = document.querySelector('a[href*="/seen_by/"]');
    const txt = (link?.textContent || '').trim();
    const m = txt.match(/(\d[\d,]*)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  function getStoryOwnerFromURL() {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? m[1] : null;
  }

  function hasSeenByUI() {
    // "Seen by" only appears on your own stories.
    const scope = document; // keep broad—button often lives in main story surface
    if (scope.querySelector('a[href*="/seen_by/"]')) return true;
    const els = scope.querySelectorAll('button,[role="button"],span,div');
    return Array.from(els).some(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent || '').trim()));
  }

  async function canRunForOwner(owner) {
    const s = Settings.cache;
    if (s.pro) return true;
    if (!s.accountHandle && owner) {
      await Settings.save({ accountHandle: owner });
      return true;
    }
    return s.accountHandle?.toLowerCase() === owner?.toLowerCase();
  }

  async function isOnOwnStory() {
    if (!location.pathname.startsWith('/stories/')) return false;
    if (!hasSeenByUI()) return false; // bulletproof indicator
    const owner = getStoryOwnerFromURL();
    if (!owner) return false;
    return await canRunForOwner(owner);
  }

  // ==== [C] NATURAL PAUSE — pause only while dialog is open, resume when closed ====
  let dialogCheckInterval = null;
  
  function pauseVideosWhileViewerOpen() {
    if (!Settings.cache.pauseVideos) return;
    
    // Clear any existing interval
    if (dialogCheckInterval) {
      clearInterval(dialogCheckInterval);
      dialogCheckInterval = null;
    }
    
    // Check for dialog state
    dialogCheckInterval = setInterval(() => {
      const dlgOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
      
      if (dlgOpen) {
        // Pause videos when dialog is open
        document.querySelectorAll('video').forEach(v => {
          if (v.dataset.userPlayed === '1') return; // respect manual play
          if (!v.paused && !v.dataset.slPaused) {
            try { 
              v.pause(); 
              v.dataset.slPaused = '1';
              console.log('[SL] Paused video while dialog open');
            } catch {}
          }
        });
      } else {
        // Resume videos when dialog is closed
        document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
          try { 
            v.play();
            delete v.dataset.slPaused;
            console.log('[SL] Resumed video after dialog closed');
          } catch {}
        });
      }
    }, 500); // Check every 500ms
  }

  function resumeAnyPausedVideos() {
    // Clear interval when leaving stories
    if (dialogCheckInterval) {
      clearInterval(dialogCheckInterval);
      dialogCheckInterval = null;
    }
    
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch {}
      delete v.dataset.slPaused;
    });
  }

  document.addEventListener('play', (e) => {
    if (e.target?.tagName === 'VIDEO') e.target.dataset.userPlayed = '1';
  }, true);

  // ==== [D] PAGINATION — simple + bounded ====
  function startPagination(scroller, maxMs = 6000) {
    const t0 = Date.now();
    let stopped = false;
    const tick = () => {
      if (stopped || !document.contains(scroller)) return;
      if (Date.now() - t0 > maxMs) return;

      const target = getSeenByCount();
      const currentMap = state.viewerStore.get(getStorageKey());
      const loaded = currentMap ? currentMap.size : 0;
      if (target && loaded >= target - 1) return; // allow ±1

      scroller.scrollTop = scroller.scrollHeight;
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
      setTimeout(tick, nearBottom ? 450 : 250);
    };
    tick();
    return () => { stopped = true; };
  }

  // ==== [E] AUTO-OPEN — DISABLED to prevent popup issues ====
  async function autoOpenViewersOnceFor(key) {
    // Disabled auto-opening to prevent viewer list popup issues
    // Users should manually click the "Seen by" button
    return;
  }

  // ==== [F] MIRROR TO CACHE — key = pathname; write debounced ====
  function mirrorToLocalStorageDebounced(key) {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      const map = state.viewerStore.get(key);
      if (!map || map.size === 0) return;

      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      store[key] = { viewers: Array.from(map.entries()), fetchedAt: Date.now() };

      // Also store aliases for mediaIds that map to this key (prevents mis-routing on refresh)
      const aliases = {};
      for (const [mid, k] of state.idToKey.entries()) if (k === key) aliases[mid] = k;
      store.__aliases = Object.assign(store.__aliases || {}, aliases);

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 300);
  }

  // ==== [G] MESSAGE BRIDGE — handle both old and new message formats ====
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin) return;
    const msg = evt.data;
    if (!msg) return;
    
    // Handle new format from injected.js
    if (msg.type === 'sl_viewer_chunk') {
      const { mediaId, viewers, hasNext } = msg;
      if (!mediaId || !Array.isArray(viewers)) return;
      
      const activeKey = state.currentKey || getStorageKey();
      if (!state.idToKey.has(mediaId)) state.idToKey.set(mediaId, activeKey);
      const key = state.idToKey.get(mediaId);
      
      if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
      const map = state.viewerStore.get(key);
      
      viewers.forEach((v, idx) => {
        // dedupe by username (lowercased) or id
        const viewerKey = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || idx);
        const prev = map.get(viewerKey) || {};
        map.set(viewerKey, { ...prev, ...v });
      });
      
      mirrorToLocalStorageDebounced(key);
      console.log(`[SL] Received ${viewers.length} viewers for story ${key}, hasNext: ${hasNext}`);
    }
    // Handle old format (fallback)
    else if (msg.type === 'STORYLISTER_VIEWERS_CHUNK') {
      const { mediaId, viewers } = msg.data || {};
      if (!mediaId || !Array.isArray(viewers)) return;

      const activeKey = state.currentKey || getStorageKey();
      if (!state.idToKey.has(mediaId)) state.idToKey.set(mediaId, activeKey);
      const key = state.idToKey.get(mediaId);

      if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
      const map = state.viewerStore.get(key);

      viewers.forEach((v, idx) => {
        // dedupe by username (lowercased) or id
        const viewerKey = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || idx);
        const prev = map.get(viewerKey) || {};
        map.set(viewerKey, { ...prev, ...v });
      });

      mirrorToLocalStorageDebounced(key);
    }
  });


  // ==== [H] INJECT EXTERNAL SCRIPT ====
  function injectExternalScript() {
    if (state.injected) return;
    
    try {
      const s = document.createElement('script');
      // Try chrome.runtime.getURL first
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        s.src = chrome.runtime.getURL('injected.js');
        s.onload = () => {
          console.log('[SL] External script loaded successfully');
          state.injected = true;
        };
        s.onerror = () => {
          console.warn('[SL] Failed to load external script - extension may need reload');
          // Don't try inline injection as it will be blocked by CSP
        };
        (document.head || document.documentElement).appendChild(s);
      } else {
        console.warn('[SL] Chrome runtime not available - extension may need reload');
      }
    } catch (e) {
      console.error('[SL] Script injection failed:', e);
    }
  }

  // ==== [I] MAIN OBSERVER — first story, inject, pause only when dialog open ====
  const onDOMChange = (() => {
    let lastKey = null;
    return async () => {
      // gate: only on your own story (Seen by must eventually exist)
      const onStories = location.pathname.startsWith('/stories/');
      if (!onStories) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        resumeAnyPausedVideos();
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      
      // Try to inject the script
      injectExternalScript();

      const key = getStorageKey();
      if (key !== lastKey) {
        // story changed
        if (state.stopPagination) state.stopPagination();
        lastKey = state.currentKey = key;
        autoOpenViewersOnceFor(key);
      }

      // pause only while viewers dialog is open
      pauseVideosWhileViewerOpen();
    };
  })();

  new MutationObserver(() => onDOMChange()).observe(document.documentElement || document.body, { childList: true, subtree: true });
  onDOMChange();

  // Initialize settings
  (async function init() {
    await Settings.load();
  })();
})();