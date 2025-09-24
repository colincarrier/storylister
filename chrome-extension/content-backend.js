(() => {
  'use strict';

  // ==== [A] TOP OF FILE: state + Settings ====
  const DEBUG = false;

  // Add throttle function
  function throttle(fn, ms) {
    let t = 0, id = null;
    return (...args) => {
      const now = Date.now();
      if (now - t >= ms) { t = now; return fn(...args); }
      clearTimeout(id);
      id = setTimeout(() => { t = Date.now(); fn(...args); }, ms);
    };
  }

  const state = {
    injected: false,
    currentKey: null,          // stable key = location.pathname (works with and w/o numeric id)
    autoOpenInProgress: false,
    openedForKey: new Set(),   // prevent re-opening
    stopPagination: null,
    viewerStore: new Map(),    // Map<storyKey, Map<viewerKey, viewer>>
    mirrorTimer: null,
    idToKey: new Map(),        // Map<mediaId -> storyKey>
    userOverrodePauseByKey: new Set(),   // remembers you pressed play per story
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
  
  function pathIdFromURL() {
    return location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1] || null;
  }

  // Scan <link rel="alternate"> and <a href> for /stories/<owner>/<id>
  function findMediaIdInDOM(owner) {
    if (!owner) return null;
    const re = new RegExp(`/stories/${owner}/(\\d{10,})`);
    const candidates = new Set();

    document.querySelectorAll('link[rel="alternate"][href*="/stories/"], a[href*="/stories/"]').forEach(el => {
      const href = el.getAttribute('href') || el.href || '';
      const m = href.match(re);
      if (m) candidates.add(m[1]);
    });
    
    // Add fallback: extract from "Seen by" button URL
    const seenByLink = document.querySelector('a[href*="/seen_by/"]');
    if (seenByLink) {
      const href = seenByLink.getAttribute('href') || '';
      const mediaId = href.match(/\/(\d{15,20})\/seen_by/)?.[1];
      if (mediaId) candidates.add(mediaId);
    }

    // Pick a deterministic id (first unseen id, else first)
    const ids = Array.from(candidates);
    if (!ids.length) return null;
    for (const id of ids) if (!state.idToKey?.has(id)) return id;
    return ids[0];
  }

  // Always safe: pathname is our canonical key
  function pathKey() { return location.pathname; }

  // Return {pathKey, mediaKey?}
  function currentKeys() {
    const owner = getStoryOwnerFromURL();
    const urlId = pathIdFromURL();
    const domId = urlId || findMediaIdInDOM(owner);
    return { path: pathKey(), media: domId ? `/stories/${owner}/${domId}/` : null };
  }

  // Route incoming chunks to the correct story key
  function routeMediaId(mediaId) {
    const { path, media } = currentKeys();
    const key = media || path; // prefer numeric, else pathname
    if (!state.idToKey) state.idToKey = new Map();
    if (!state.idToKey.has(mediaId)) state.idToKey.set(mediaId, key);
    return state.idToKey.get(mediaId);
  }

  function findSeenByButton() {
    return document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('[role="button"],button'))
             .find(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent||'').trim())) || null;
  }

  async function waitForSeenByButton(timeout = 6000, interval = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const a = document.querySelector('a[href*="/seen_by/"]');
      if (a) return a;
      const btn = Array.from(document.querySelectorAll('[role="button"],button'))
        .find(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent || '').trim()));
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
    if (!hasSeenByUI()) return false;  // Only run on stories with "Seen by" (your own)
    const owner = getStoryOwnerFromURL();
    if (!owner) return false;
    return await canRunForOwner(owner);
  }

  // ==== [C] NATURAL PAUSE — pause only while the IG viewers dialog is open ====
  function pauseVideosWhileViewerOpen() {
    if (!Settings.cache.pauseVideos) return;
    const dlgOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlgOpen) return;
    setTimeout(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.dataset.userPlayed === '1') return; // respect manual play
        if (!v.paused && !v.dataset.slPaused) {
          try { v.pause(); v.dataset.slPaused = '1'; } catch {}
        }
      });
    }, 1000); // human-ish delay
  }

  // if the user plays a video, never auto-pause that element again
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

  // ==== [E] AUTO-OPEN — actually works for the first story ====
  async function autoOpenViewersOnceFor(key) {
    if (!Settings.cache.autoOpen || state.openedForKey.has(key)) return;
    const btn = await waitForSeenByButton(5000);
    if (!btn) return;
    state.openedForKey.add(key);
    try { btn.click(); } catch {}

    setTimeout(() => {
      const scroller = findScrollableInDialog();
      if (!scroller) return;

      // bounded, stall-aware scrolling
      let lastH = -1, stable = 0, stop = false;
      state.stopPagination = () => { stop = true; };

      (function tick() {
        if (stop || !document.contains(scroller)) return;

        const target = getSeenByCount();
        const loaded = state.viewerStore.get(getStorageKey())?.size || 0;
        if (target && loaded >= target - 1) return;  // ±1 tolerance

        const h = scroller.scrollHeight;
        if (h === lastH) {
          if (++stable >= 8) return;                 // ~8 * 150ms ≈ 1.2s stall -> stop
        } else {
          stable = 0;
          lastH = h;
        }

        scroller.scrollTop = scroller.scrollHeight;
        setTimeout(tick, 150);
      })();
    }, 350);
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

      // also persist mediaId → key aliases (so reload routes correctly)
      store.__aliases = store.__aliases || {};
      for (const [mid, k] of (state.idToKey || new Map()).entries()) {
        if (k === key) store.__aliases[mid] = key;
      }

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 250);
  }

  // ==== [G] MESSAGE BRIDGE — correct routing + dedupe ====
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin) return;
    const msg = evt.data;
    if (!msg || msg.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers } = msg.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;

    // Route to the correct key even if you navigated mid-request
    const key = routeMediaId(mediaId);

    if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
    const map = state.viewerStore.get(key);

    // Dedup by username (lowercased) or id, merge reactions and timestamps
    viewers.forEach((v, i) => {
      const k = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || i);
      const prev = map.get(k) || {};
      map.set(k, {
        ...prev,
        ...v,
        reaction: v.reaction || prev.reaction || null,
        viewedAt: v.viewedAt || prev.viewedAt || Date.now()
      });
    });

    mirrorToLocalStorageDebounced(key);
    window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: key } }));
  });


  // ==== [H] INJECT EXTERNAL SCRIPT (CSP-SAFE) ====
  function ensureInjected() {
    if (state.injected) return;
    try {
      if (document.querySelector('script[data-sl-injected="1"]')) {
        state.injected = true;
        return;
      }
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js'); // external URL is allowed by IG CSP
      s.async = false;
      s.dataset.slInjected = '1';
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
      state.injected = true;
    } catch (e) {
      console.warn('[Storylister] injection failed', e);
    }
  }

  // ==== [I] STORY CHANGE HANDLER ====
  function onStoryChanged(newKey) {
    if (state.stopPagination) { state.stopPagination(); state.stopPagination = null; }
    state.currentKey = newKey;
    state.userOverrodePauseByKey.delete(newKey);
    autoOpenViewersOnceFor(newKey);
    window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: newKey } }));
  }

  // ==== [J] MAIN OBSERVER — throttled with RAF, first story safe ====
  const onDOMChange = (() => {
    let raf = 0, lastKey = null;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(async () => {
        const onStories = location.pathname.startsWith('/stories/');
        const seenByPresent = !!document.querySelector('a[href*="/seen_by/"]') ||
                              Array.from(document.querySelectorAll('[role="button"],button'))
                                .some(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent || '').trim()));

        if (!onStories || !seenByPresent) {
          window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
          return;
        }

        window.dispatchEvent(new CustomEvent('storylister:show_panel'));
        ensureInjected();               // CSP-safe
        pauseVideosWhileViewerOpen();   // only while dialog is open

        const keyNow = pathKey();
        if (keyNow !== lastKey) {
          if (state.stopPagination) state.stopPagination();
          lastKey = state.currentKey = keyNow;
          autoOpenViewersOnceFor(keyNow);
        }
      });
    };
  })();

  // Set up MutationObserver
  new MutationObserver(onDOMChange)
    .observe(document.documentElement || document.body, { childList: true, subtree: true });
  
  onDOMChange(); // initial pass

  // Initialize settings
  (async function init() {
    await Settings.load();
  })();
})();