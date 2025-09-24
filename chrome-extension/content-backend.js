// content-backend.js
// v15.3 - Surgical patches applied for stability
(() => {
  'use strict';
  
  const DEBUG = false;

  const state = {
    injected: false,
    currentKey: null,              // stable: location.pathname
    openedForKey: new Set(),       // auto-open once per key
    stopPagination: null,          // cancel paginator
    viewerStore: new Map(),        // Map<storyKey, Map<viewerKey, viewer>>
    mirrorTimer: null,
    idToKey: new Map()             // Map<mediaId -> storyKey> (prevents misrouting)
  };

  const Settings = {
    cache: { pro: false, autoOpen: true, pauseVideos: false, accountHandle: null },

    async load() {
      try {
        const data = await new Promise(r => chrome?.storage?.sync?.get?.(null, r));
        if (data) Object.assign(this.cache, data);
      } catch (e) {
        try {
          const raw = localStorage.getItem('sl_settings');
          if (raw) Object.assign(this.cache, JSON.parse(raw));
        } catch {}
      }
    },

    async save(patch) {
      Object.assign(this.cache, patch);
      try {
        await new Promise(r => chrome?.storage?.sync?.set?.(patch, r));
      } catch (e) {
        try { localStorage.setItem('sl_settings', JSON.stringify(this.cache)); } catch {}
      }
    }
  };

  // Stable key + "Seen by" utilities
  function getStorageKey() { return location.pathname; }   // works with and without numeric id

  function findSeenByButton() {
    return document.querySelector('a[href*="/seen_by/"]') ||
      Array.from(document.querySelectorAll('[role="button"],button'))
        .find(el => /^Seen by(\s+[\d,]+)?$/i.test((el.textContent || '').trim())) || null;
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

  function getSeenByCount() {
    const a = document.querySelector('a[href*="/seen_by/"]');
    const txt = (a?.textContent || '').trim();
    const m = txt.match(/(\d[\d,]*)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  // Injection (no inline, guard runtime)
  function ensureInjected() {
    if (state.injected) return;
    if (!chrome?.runtime?.id) return; // extension reloaded; skip until tab reload
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      s.dataset.storylisterInjected = '1';
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
      state.injected = true;
    } catch (e) {
      if (DEBUG) console.warn('[Storylister] inject failed', e);
    }
  }

  // No programmatic pausing (delete your previous pause code).
  // We only keep this to respect user playback and avoid re-pausing:
  document.addEventListener('play', (e) => {
    if (e.target?.tagName === 'VIDEO') e.target.dataset.userPlayed = '1';
  }, true);

  // Pagination (simple, bounded, stop when we've met target)
  function findScrollableInDialog() {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    return dlg.querySelector('[style*="overflow-y"]') ||
           dlg.querySelector('[style*="overflow: hidden auto"]') ||
           Array.from(dlg.querySelectorAll('div')).find(el => el.scrollHeight > el.clientHeight + 40) ||
           dlg;
  }

  function startPagination(scroller, maxMs = 6000) {
    const t0 = Date.now();
    let stopped = false;
    const tick = () => {
      if (stopped || !document.contains(scroller)) return;
      if (Date.now() - t0 > maxMs) return;

      const target = getSeenByCount();
      const map = state.viewerStore.get(getStorageKey());
      const loaded = map ? map.size : 0;
      if (target && loaded >= target - 1) return; // allow ±1

      scroller.scrollTop = scroller.scrollHeight;
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
      setTimeout(tick, nearBottom ? 450 : 250);
    };
    tick();
    return () => { stopped = true; };
  }

  // Auto-open viewers — first story safe
  async function autoOpenViewersOnceFor(key) {
    if (!Settings.cache.autoOpen) return;
    if (state.openedForKey.has(key)) return;

    const btn = await waitForSeenByButton(5000);
    if (!btn) return;

    state.openedForKey.add(key);
    try { btn.click(); } catch {}
    setTimeout(() => {
      const scroller = findScrollableInDialog();
      if (scroller) {
        if (state.stopPagination) state.stopPagination();
        state.stopPagination = startPagination(scroller);
      }
    }, 350);
  }

  // Mirror (debounced), per pathname + mediaId aliases
  function mirrorToLocalStorageDebounced(key) {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      const map = state.viewerStore.get(key);
      if (!map || map.size === 0) return;

      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      store[key] = { viewers: Array.from(map.entries()), fetchedAt: Date.now() };

      // Alias mediaIds to our key (prevents misrouting after refresh)
      const aliases = {};
      for (const [mid, k] of state.idToKey.entries()) if (k === key) aliases[mid] = k;
      store.__aliases = Object.assign(store.__aliases || {}, aliases);

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 250);
  }

  // Message bridge (route chunks correctly; dedupe; no async spam)
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

    viewers.forEach((v, idx) => {
      const k = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || idx);
      const prev = map.get(k) || {};
      map.set(k, { ...prev, ...v });
    });

    mirrorToLocalStorageDebounced(key);
  });

  // DOM observer (throttled), no auto-pause, first-story auto-open
  const onDOMChange = (() => {
    let lastKey = null;
    return () => {
      if (!location.pathname.startsWith('/stories/')) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();

      const key = getStorageKey();
      if (key !== lastKey) {
        if (state.stopPagination) state.stopPagination();
        lastKey = state.currentKey = key;
        autoOpenViewersOnceFor(key);
      }
    };
  })();

  const throttled = (() => {
    let t = 0, h;
    return () => {
      const now = Date.now();
      clearTimeout(h);
      if (now - t > 200) {
        t = now;
        onDOMChange();
      } else {
        h = setTimeout(() => { t = Date.now(); onDOMChange(); }, 200 - (now - t));
      }
    };
  })();

  // Initialize
  Settings.load();
  new MutationObserver(throttled).observe(document.documentElement || document.body, { childList: true, subtree: true });
  onDOMChange();
})();