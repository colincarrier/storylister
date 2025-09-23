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
    // Do NOT require the "Seen by" UI here; it often appears late on the first story.
    const owner = getStoryOwnerFromURL();
    if (!owner) return false;
    return await canRunForOwner(owner);
  }

  // ==== [C] NATURAL PAUSE — pause only while the IG viewers dialog is open ====
  function pauseVideosWhileViewerOpen() {
    if (!Settings.cache.pauseVideos) return;
    const key = getStorageKey();
    if (state.userOverrodePauseByKey.has(key)) return; // respect user action

    const dlgOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlgOpen) return;

    setTimeout(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.dataset.userPlayed === '1') return;
        if (!v.paused && !v.dataset.slPaused) {
          try { v.pause(); v.dataset.slPaused = '1'; } catch {}
        }
      });
    }, 1200);
  }

  function resumeAnyPausedVideos() {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch {}
      delete v.dataset.slPaused;
    });
  }

  document.addEventListener('play', (e) => {
    const el = e.target;
    if (el && el.tagName === 'VIDEO') {
      el.dataset.userPlayed = '1';
      state.userOverrodePauseByKey.add(getStorageKey());
    }
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

      // also remember mediaId aliasing to survive refresh
      store.__aliases = store.__aliases || {};
      for (const [mid, k] of state.idToKey.entries()) if (k === key) store.__aliases[mid] = k;

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 300);
  }

  // ==== [G] MESSAGE BRIDGE — correct routing + dedupe ====
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin) return;
    const msg = evt.data;
    if (!msg || msg.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers } = msg.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;

    const activeKey = state.currentKey || getStorageKey();
    if (!state.idToKey.has(mediaId)) state.idToKey.set(mediaId, activeKey);
    const key = state.idToKey.get(mediaId);

    if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
    const map = state.viewerStore.get(key);

    viewers.forEach((v, i) => {
      const k = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || i);
      const prev = map.get(k) || {};
      map.set(k, { ...prev, ...v });                        // merge to avoid losing flags
    });

    mirrorToLocalStorageDebounced(key);
    window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: key } }));
  });


  // ==== [H] INJECT EXTERNAL SCRIPT ====
  function ensureInjected() {
    if (state.injected) return;
    try {
      const src = chrome?.runtime?.getURL?.('injected.js');
      if (!src) return;                // happens only while reloading the unpacked extension
      const s = document.createElement('script');
      s.src = src;
      s.dataset.storylisterInjected = '1';
      s.onload = () => { s.remove(); state.injected = true; };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      console.warn('[Storylister] inject failed', e);
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

  // ==== [J] MAIN OBSERVER — first story, inject, pause only when dialog open ====
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
      ensureInjected();

      const key = getStorageKey();
      if (key !== lastKey) {
        // story changed
        lastKey = key;
        onStoryChanged(key);
      }

      // pause only while viewers dialog is open
      pauseVideosWhileViewerOpen();
    };
  })();

  // Throttle the MutationObserver callback
  const onNav = throttle(onDOMChange, 250);
  const mo = new MutationObserver(onNav);
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  onNav(); // initial pass

  // Initialize settings
  (async function init() {
    await Settings.load();
  })();
})();