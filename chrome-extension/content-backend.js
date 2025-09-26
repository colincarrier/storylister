// --- Storylister: early inject to catch first story viewers request ---
(() => {
  try {
    if (location.pathname.startsWith('/stories/') &&
        !document.querySelector('script[data-sl-injected="1"]') &&
        chrome?.runtime?.getURL) {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      s.dataset.slInjected = '1';
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    }
  } catch {}
})();

// content-backend.js
// v15.5 - Complete surgical patches from ChatGPT
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
    idToKey: new Map(),            // Map<mediaId -> storyKey> (prevents misrouting)
    sentry: { timer: null, active: false },
    mediaForKey: new Map()         // tracks mediaId per pathname
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

  // Count sentry functions for complete viewer loading
  function stopCountSentry() {
    state.sentry.active = false;
    clearInterval(state.sentry.timer);
    state.sentry.timer = null;
  }

  function startCountSentry() {
    stopCountSentry();
    state.sentry.active = true;
    state.sentry.timer = setInterval(() => {
      const target = getSeenByCount();
      const map = state.viewerStore.get(getStorageKey());
      const loaded = map ? map.size : 0;

      if (!target || loaded >= target) {
        stopCountSentry();
        // Mark as fully loaded
        const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
        const key = getStorageKey();
        if (store[key]) {
          store[key].lastSeenAt = Date.now();
          localStorage.setItem('panel_story_store', JSON.stringify(store));
        }
        return;
      }

      // Keep trying to load more
      const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!dlg) {
        const btn = document.querySelector('a[href*="/seen_by/"]');
        if (btn) btn.click();
      } else {
        const scroller = findScrollableInDialog();
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      }
    }, 1500);
  }

  // Own story detection - simple and bulletproof
  function isOwnStory() {
    // Your own story on web always has a "Seen by" control
    return !!document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('button,span'))
             .some(el => /^Seen by\s+\d[\d,]*$/i.test((el.textContent || '').trim()));
  }

  // Stable key + "Seen by" utilities
  function getStorageKey() { return location.pathname; }   // works with and without numeric id

  // A2 - Robust mediaId resolution
  function getMediaIdFromPath() {
    return location.pathname.match(/\/stories\/[^/]+\/(\d{8,})/)?.[1] || null;
  }

  // Scrape mediaId from DOM when the URL lacks it (first story, share links, etc.)
  function getMediaIdFromDOM() {
    // 1) From the URL (share links & normal view)
    const p = location.pathname.match(/\/stories\/[^/]+\/(\d{15,25})/);
    if (p) return p[1];
    
    // 2) From "Seen by" link href when present
    const seen = document.querySelector('a[href*="/seen_by/"]');
    if (seen) {
      const m = seen.href.match(/\/stories\/[^/]+\/(\d{15,25})/);
      if (m) return m[1];
    }
    
    // 3) From <link rel="alternate" href="/stories/user/{id}/...">
    const alts = Array.from(document.querySelectorAll('link[rel="alternate"][href*="/stories/"]'));
    for (const el of alts) {
      const href = el.getAttribute('href') || '';
      const m = href.match(/\/stories\/[^/]+\/(\d{15,25})/);
      if (m) return m[1];
    }
    
    // 4) any anchor that already includes the id
    const anyA = document.querySelector('a[href^="/stories/"][href*="/"]');
    if (anyA) {
      const m = anyA.getAttribute('href').match(/\/stories\/[^/]+\/(\d{15,25})/);
      if (m) return m[1];
    }
    
    // 5) data attribute (varies by rollout)
    const el = document.querySelector('[data-media-id]');
    if (el?.dataset?.mediaId) return el.dataset.mediaId;
    
    return null;
  }

  // Canonical per‑story key (prefer mediaId for stable caching)
  function canonicalKey() {
    const mid = getMediaIdFromDOM();
    return mid ? `story_${mid}` : location.pathname;
  }

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

  // A4 - DOM fallback for reacts (hearts) when API omits it
  function mergeReactsFromDialogIntoMap(map) {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return;

    // Each row typically contains a profile link; detect a heart in the row.
    const rows = Array.from(dlg.querySelectorAll('div[role="button"], li, div[role="listitem"]'));
    rows.forEach(row => {
      const a = row.querySelector('a[href^="/"][href*="/"]');
      const username = a?.getAttribute('href')?.split('/')?.filter(Boolean)?.[0];
      if (!username) return;

      // Heart detection – keep broad; IG's SVGs vary by rollout.
      const hasHeart = !!row.querySelector(
        'svg[aria-label*="Like"], svg[aria-label*="Unlike"], use[href*="heart"], path[d*="M34.6 3.1"]'
      );

      if (hasHeart) {
        const key = username.toLowerCase();
        const item = map.get(key);
        if (item && !item.reaction) item.reaction = '❤️';
      }
    });
  }

  // Pagination (simple, bounded, stop when we've met target)
  function findScrollableInDialog() {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    return dlg.querySelector('[style*="overflow-y"]') ||
           dlg.querySelector('[style*="overflow: hidden auto"]') ||
           Array.from(dlg.querySelectorAll('div')).find(el => el.scrollHeight > el.clientHeight + 40) ||
           dlg;
  }

  function startPagination(scroller, maxMs = 15000) {
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
        startCountSentry(); // ADD THIS LINE
      }
      // Add DOM reaction fallback after dialog opens
      setTimeout(() => mergeReactsFromDialogIntoMap(state.viewerStore.get(key)), 1000);
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
      const existing = store[key] || {};
      const existingViewers = new Map(existing.viewers || []);
      
      // Preserve firstSeenAt
      const merged = Array.from(map.entries()).map(([vk, v]) => {
        const old = existingViewers.get(vk);
        return [vk, {
          ...v,
          firstSeenAt: old?.firstSeenAt || v.firstSeenAt || Date.now()
        }];
      });

      store[key] = {
        mediaId: getMediaIdFromDOM(),
        viewers: merged,
        fetchedAt: Date.now(),
        lastSeenAt: existing.lastSeenAt || 0
      };

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 250);
  }
  
  // Mark all viewers as seen for a story
  function markAllSeenForKey(key) {
    const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
    if (!store[key]) return;
    store[key].lastSeenAt = Date.now();
    localStorage.setItem('panel_story_store', JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
  }

  // Message bridge (route chunks correctly; dedupe; no async spam)
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin) return;
    const msg = evt.data;
    if (!msg || msg.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers } = msg.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;

    const key = getStorageKey();

    // Detect when a new story loads under the same pathname (back/forward navigation)
    if (!state.idToKey.has(mediaId)) {
      state.idToKey.set(mediaId, key);
    }
    const currentMediaForKey = [...state.idToKey.entries()].find(([, k]) => k === key)?.[0];
    if (currentMediaForKey && currentMediaForKey !== mediaId) {
      // New story under same pathname -> reset viewer map for this key
      state.viewerStore.set(key, new Map());
      // Remap this key to the new mediaId
      state.idToKey.delete(currentMediaForKey);
      state.idToKey.set(mediaId, key);
    }

    if (!state.viewerStore.has(key)) state.viewerStore.set(key, new Map());
    const map = state.viewerStore.get(key);

    // A3 - Fix follower/following mapping and dedupe
    viewers.forEach((raw, idx) => {
      const v = { ...raw };

      // Normalize follow flags for UI:
      // IG: friendship_status.following => YOU follow THEM (youFollow)
      //     friendship_status.followed_by => THEY follow YOU (isFollower)
      // We accept either our normalized fields or IG-shaped fields.
      const isFollower = (v.follows_viewer === true) || (v.follows_you === true) || (v.is_follower === true);
      const youFollow  = (v.followed_by_viewer === true) || (v.you_follow === true) || (v.is_following === true);

      v.isFollower = !!isFollower;  // they follow you
      v.youFollow  = !!(youFollow); // you follow them

      // Deduplicate by username (lc) or id
      const viewerKey = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || idx);

      const prev = map.get(viewerKey) || {};
      map.set(viewerKey, { ...prev, ...v });
    });

    // Apply DOM fallback for reactions
    mergeReactsFromDialogIntoMap(map);

    mirrorToLocalStorageDebounced(key);
  });

  // DOM observer (throttled), no auto-pause, first-story auto-open
  const onDOMChange = (() => {
    let lastKey = null;
    let lastMediaId = null;
    
    return () => {
      if (!location.pathname.startsWith('/stories/') || !isOwnStory()) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        stopCountSentry();
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();

      const key = getStorageKey();
      const mediaId = getMediaIdFromDOM();
      
      if (key !== lastKey || (mediaId && mediaId !== lastMediaId)) {
        if (state.stopPagination) state.stopPagination();
        
        // Clear cache if mediaId changed under same pathname
        if (key === lastKey && mediaId && lastMediaId && mediaId !== lastMediaId) {
          state.viewerStore.set(key, new Map());
          const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
          delete store[key];
          localStorage.setItem('panel_story_store', JSON.stringify(store));
        }
        
        lastKey = state.currentKey = key;
        lastMediaId = mediaId;
        
        state.openedForKey.delete(key);
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

  // When the panel opens, mark current as seen so NEW badges clear
  window.addEventListener('storylister:panel_opened', () => {
    markAllSeenForKey(location.pathname);
  });

  // Initialize
  Settings.load();
  new MutationObserver(throttled).observe(document.documentElement || document.body, { childList: true, subtree: true });
  onDOMChange();

  // Post-load nudge for first-install/first-story reliability
  setTimeout(() => {
    if (!window.__slRanOnce) {
      window.__slRanOnce = true;
      try { onDOMChange(); } catch {}
    }
  }, 1000);
})();