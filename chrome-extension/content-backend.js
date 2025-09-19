(() => {
  'use strict';

  const DEBUG = false;

  const state = {
    injected: false,
    currentStoryId: null,
    autoOpenInProgress: false,
    viewerStore: new Map(),       // Map<mediaId, Map<viewerId, viewer>>
    mirrorTimer: null
  };

  const Settings = {
    cache: { pro: false, autoOpen: true, accountHandle: null, pauseVideos: true },
    async load() {
      try {
        const data = await new Promise(r => chrome.storage.sync.get(null, r));
        this.cache.pro = !!data.pro;
        this.cache.autoOpen = data.autoOpen !== false;
        this.cache.accountHandle = data.accountHandle || null;
        this.cache.pauseVideos = data.pauseVideos !== false;
      } catch (e) {
        console.warn('[Storylister] Settings load failed:', e);
      }
    },
    async save(patch) {
      Object.assign(this.cache, patch);
      try {
        await new Promise(r => chrome.storage.sync.set(patch, r));
      } catch (e) {
        console.warn('[Storylister] Settings save failed:', e);
      }
    }
  };

  // --- Utilities ---
  function throttle(fn, ms) {
    let last = 0, timer = null;
    return (...args) => {
      const now = Date.now();
      clearTimeout(timer);
      if (now - last >= ms) {
        last = now;
        return fn(...args);
      }
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, ms - (now - last));
    };
  }

  function getStoryOwnerFromURL() {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getCurrentStoryIdFromURL() {
    const m = location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
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

  function ensureInjected() {
    if (state.injected) return;
    try {
      if (document.querySelector('script[data-storylister-injected="1"]')) {
        state.injected = true;
        return;
      }
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      s.dataset.storylisterInjected = '1';
      s.onload = () => s.remove();
      s.onerror = () => console.error('[Storylister] Failed to inject script');
      (document.head || document.documentElement).appendChild(s);
      state.injected = true;
      if (DEBUG) console.log('[Storylister] injected.js loaded');
    } catch (e) {
      console.error('[Storylister] Injection failed:', e);
    }
  }

  function mirrorToLocalStorageDebounced() {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      const store = {};
      for (const [mediaId, viewersMap] of state.viewerStore) {
        store[mediaId] = {
          viewers: Array.from(viewersMap.entries()),
          fetchedAt: Date.now(),
          generation: 1
        };
      }
      try {
        localStorage.setItem('panel_story_store', JSON.stringify(store));
        window.dispatchEvent(new CustomEvent('storylister:data_updated', {
          detail: { storyId: state.currentStoryId }
        }));
      } catch (e) {
        console.error('[Storylister] Storage error:', e);
      }
    }, 120);
  }

  // --- Secure bridge from page to extension context ---
  window.addEventListener('message', (evt) => {
    // Security hardening
    if (evt.source !== window) return;
    if (evt.origin !== window.location.origin) return;

    const msg = evt.data;
    if (!msg || msg.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers, totalCount } = msg.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;

    if (!state.viewerStore.has(mediaId)) {
      state.viewerStore.set(mediaId, new Map());
    }
    const m = state.viewerStore.get(mediaId);

    viewers.forEach((v, idx) => {
      const id = String(v.id || v.pk || v.username || idx);
      m.set(id, {
        id,
        username: v.username || '',
        full_name: v.full_name || '',
        profile_pic_url: v.profile_pic_url || '',
        is_verified: !!v.is_verified,
        followed_by_viewer: !!v.followed_by_viewer,
        follows_viewer: !!v.follows_viewer,
        viewedAt: v.viewedAt || v.timestamp || Date.now(),
        originalIndex: typeof v.originalIndex === 'number' ? v.originalIndex : idx
      });
    });

    if (DEBUG) console.log(`[Storylister] Received ${viewers.length} viewers for ${mediaId}`, { totalCount });
    mirrorToLocalStorageDebounced();
  });

  // --- Auto-open + pagination ---
  function findSeenByButton() {
    const link = document.querySelector('a[href*="/seen_by/"]');
    if (link) return link;
    const buttons = document.querySelectorAll('[role="button"],button');
    return Array.from(buttons).find(el =>
      /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent || '').trim())
    ) || null;
  }

  function findScrollableInDialog() {
    // The dialog may be the viewers list; otherwise find the largest scrollable region.
    const dialog = document.querySelector('[role="dialog"]') || document;
    const styled = dialog.querySelector('[style*="overflow-y"]') ||
                   dialog.querySelector('[style*="overflow: hidden auto"]');
    if (styled) return styled;
    return Array.from(dialog.querySelectorAll('div'))
      .find(el => el.scrollHeight > el.clientHeight + 40) || dialog;
  }

  function startFastPagination(scroller, maxMs = 8000) {
    let lastHeight = 0, stable = 0, running = true;
    const started = Date.now();

    const tick = () => {
      if (!running || !document.contains(scroller)) return;
      if (Date.now() - started > maxMs) return;

      const height = scroller.scrollHeight;
      if (height === lastHeight) {
        if (++stable > 2) return; // done
      } else {
        stable = 0;
        lastHeight = height;
      }

      // Simulate End key + force scroll
      const ev = new KeyboardEvent('keydown', {
        key: 'End', code: 'End', keyCode: 35, which: 35, bubbles: true
      });
      scroller.dispatchEvent(ev);
      scroller.scrollTop = scroller.scrollHeight;

      setTimeout(tick, 120);
    };
    tick();
    return () => { running = false; };
  }

  function autoOpenViewers() {
    if (!Settings.cache.autoOpen) return;
    if (state.autoOpenInProgress) return;

    const btn = findSeenByButton();
    if (!btn) return;

    state.autoOpenInProgress = true;
    try { btn.click(); } catch (e) { console.warn('[Storylister] Click failed:', e); }

    setTimeout(() => {
      const scroller = findScrollableInDialog();
      if (scroller) startFastPagination(scroller);
      setTimeout(() => { state.autoOpenInProgress = false; }, 1000);
    }, 500);
  }

  function cleanupOldStories(max = 10) {
    if (state.viewerStore.size <= max) return;
    const keys = Array.from(state.viewerStore.keys());
    const toRemove = keys.slice(0, keys.length - max);
    toRemove.forEach(k => state.viewerStore.delete(k));
  }

  // Handle video pausing if needed
  const pauseVideosIfNeeded = () => {
    if (!Settings.cache.pauseVideos) return;
    document.querySelectorAll('video').forEach(v => {
      if (v.readyState >= 2 && !v.paused && !v.dataset.slPaused) {
        v.pause().catch(() => {}); // Ignore pause errors
        v.dataset.slPaused = '1';
      }
    });
  };

  const resumeVideos = () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      v.play().catch(() => {});
      delete v.dataset.slPaused;
    });
  };

  // --- DOM observer -> gate + inject + open ---
  const onDOMChange = throttle(async () => {
    const storyId = getCurrentStoryIdFromURL();

    if (await isOnOwnStory()) {
      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();

      if (storyId && storyId !== state.currentStoryId) {
        state.currentStoryId = storyId;
        if (DEBUG) console.log('[Storylister] Story changed:', storyId);
        autoOpenViewers();
        cleanupOldStories(10);
      }
    } else {
      window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
    }
  }, 200);

  // Handle panel pause/resume requests
  window.addEventListener('storylister:panel_opened', () => {
    pauseVideosIfNeeded();
  });

  window.addEventListener('storylister:panel_closed', () => {
    resumeVideos();
  });

  (async function init() {
    await Settings.load();
    const mo = new MutationObserver(onDOMChange);
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    onDOMChange(); // initial pass
  })();
  
  // Clean up old stories periodically to prevent memory bloat
  function cleanupOldStoriesPeriodic() {
    const MAX_STORIES = 10;
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    
    // Remove old stories
    for (const [id, viewers] of state.viewerStore) {
      const firstViewer = viewers.values().next().value;
      if (firstViewer && (now - firstViewer.viewedAt) > MAX_AGE_MS) {
        state.viewerStore.delete(id);
      }
    }
    
    // Keep only recent stories if over limit
    if (state.viewerStore.size > MAX_STORIES) {
      const entries = Array.from(state.viewerStore.entries());
      const toDelete = entries.slice(0, entries.length - MAX_STORIES);
      toDelete.forEach(([id]) => state.viewerStore.delete(id));
    }
  }

  // Call periodically
  setInterval(cleanupOldStoriesPeriodic, 60000); // Every minute
})();