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

  // ---- StoryIdResolver: pull a stable numeric id even when URL has none
  const StoryIdResolver = (() => {
    let last = null;

    function fromURL() {
      const m = location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
      return m ? m[1] : null;
    }

    function fromAlternateLink() {
      const link = [...document.querySelectorAll('link[rel="alternate"]')]
        .find(l => /\/stories\/[^/]+\/\d+/.test(l.href));
      if (!link) return null;
      const m = link.href.match(/\/stories\/[^/]+\/(\d+)/);
      return m ? m[1] : null;
    }

    function fromLdJson() {
      const blobs = [...document.querySelectorAll('script[type="application/ld+json"],script[data-scope]')]
        .map(n => n.textContent || '')
        .join('\n');
      const m =
        blobs.match(/"media_id"\s*:\s*"(\d{10,})"/) ||
        blobs.match(/"id"\s*:\s*"(\d{10,})"/);
      return m ? m[1] : null;
    }

    function resolve() {
      return fromURL() || fromAlternateLink() || fromLdJson() || last;
    }
    function remember(id) { if (id) last = id; }
    return { resolve, remember, last: () => last };
  })();

  // ==== [B] UTILITIES ====
  function storyKey() {
    const id = StoryIdResolver.resolve();
    // Distinguish slides even when the URL lacks the numeric id
    return `${location.pathname}#${id || 'first'}`;
  }

  function findSeenByButton() {
    return document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('[role="button"],button'))
             .find(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent||'').trim())) || null;
  }

  async function waitForSeenByButton(timeout = 5000, interval = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const a = document.querySelector('a[href*="/seen_by/"]');
      if (a) return a;
      const btn = [...document.querySelectorAll('[role="button"],button')]
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
  function pauseWhileViewerDialogOpen() {
    if (!Settings.cache.pauseVideos) return;
    const dlgOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlgOpen) return; // no dialog, no pause

    // Human-like delay; and respect manual play
    setTimeout(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.dataset.userPlayed === '1') return;
        if (!v.paused && !v.dataset.slPaused) {
          try { v.pause(); v.dataset.slPaused = '1'; } catch {}
        }
      });
    }, 1200);
  }

  document.addEventListener('play', (e) => {
    if (e.target?.tagName === 'VIDEO') e.target.dataset.userPlayed = '1';
  }, true);

  function resumeAnyPausedVideos() {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch {}
      delete v.dataset.slPaused;
    });
  }

  // ==== [D] PAGINATION — simple + bounded ====
  function startPagination(scroller, maxMs = 6000) {
    const t0 = Date.now();
    let stop = false;
    const tick = () => {
      if (stop || !document.contains(scroller)) return;
      if (Date.now() - t0 > maxMs) return;

      // Stop when we've loaded (SeenBy - 1) or more (IG off-by-1 is common)
      const target = getSeenByCount();
      const map = state.viewerStore.get(storyKey());
      const loaded = map ? map.size : 0;
      if (target && loaded >= target - 1) return;

      scroller.scrollTop = scroller.scrollHeight;
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 12;
      setTimeout(tick, nearBottom ? 450 : 250);
    };
    tick();
    return () => { stop = true; };
  }

  // ==== [E] AUTO-OPEN — actually works for the first story ====
  async function autoOpenViewersOnceFor(key) {
    if (!Settings.cache.autoOpen) return;
    if (state.openedForKey.has(key)) return;
    const btn = await waitForSeenByButton(5000);
    if (!btn) return;
    state.openedForKey.add(key);
    try { btn.click(); } catch {}
    setTimeout(() => {
      const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
      const scroller = dlg && (
        dlg.querySelector('[style*="overflow-y"]') ||
        dlg.querySelector('[style*="overflow: hidden auto"]') ||
        [...dlg.querySelectorAll('div')].find(el => el.scrollHeight > el.clientHeight + 40) ||
        dlg
      );
      if (scroller) {
        if (state.stopPagination) state.stopPagination();
        state.stopPagination = startPagination(scroller);
      }
    }, 350);
  }

  // ==== [F] MIRROR TO CACHE — key = composite; write debounced ====
  function mirrorToLocalStorageDebounced(key) {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      const map = state.viewerStore.get(key);
      if (!map || map.size === 0) return;

      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      store[key] = { viewers: [...map.entries()], fetchedAt: Date.now() };

      // Also alias by every mediaId that maps to this key
      const aliases = {};
      for (const [mid, k] of state.idToKey.entries()) if (k === key) aliases[mid] = key;
      store.__aliases = Object.assign(store.__aliases || {}, aliases);

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

    const active = storyKey();

    // First time we see this mediaId, bind it to the active key
    if (!state.idToKey.has(mediaId)) state.idToKey.set(mediaId, active);
    StoryIdResolver.remember(mediaId);

    const key = state.idToKey.get(mediaId) || active;
    if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
    const map = state.viewerStore.get(key);

    viewers.forEach((v, i) => {
      // dedupe by username (case-insens) or id
      const k = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || i);
      const prev = map.get(k) || {};
      map.set(k, { ...prev, ...v });
    });

    mirrorToLocalStorageDebounced(key);
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
      if (!location.pathname.startsWith('/stories/')) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();

      // Compute a fresh composite key and auto-open once per slide
      const key = storyKey();
      if (key !== lastKey) {
        if (state.stopPagination) state.stopPagination();
        lastKey = state.currentKey = key;
        state.openedForKey.add(key); // prevent thrash if IG re-renders quickly
        state.openedForKey.delete(key); // allow one open per new key
        autoOpenViewersOnceFor(key);
      }

      // Only pause while the dialog is open
      pauseWhileViewerDialogOpen();
    };
  })();
  new MutationObserver(() => onDOMChange())
    .observe(document.documentElement || document.body, { childList: true, subtree: true });
  onDOMChange();

  // Initialize settings
  (async function init() {
    await Settings.load();
  })();
})();