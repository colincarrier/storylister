(() => {
  'use strict';

  const DEBUG = false;

  const state = {
    injected: false,
    currentStoryId: null,
    autoOpenInProgress: false,
    userClosedViewers: false,      // NEW: respect user close
    stopPaginate: null,            // NEW: cancel pagination function
    viewerStore: new Map(),       // Map<mediaId, Map<viewerId, viewer>>
    mirrorTimer: null,
    lastAutoOpenedStoryId: null,  // Prevents re-opening
    cancelPaginator: null          // Stops old paginators
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

  // Normalize viewers from any Instagram payload shape
  function normalizeViewer(v, idx) {
    const u = v?.user || v?.node?.user || v?.node || v;
    return {
      id: String(u?.id || u?.pk || u?.username || idx),
      username: u?.username || '',
      full_name: u?.full_name || u?.fullname || '',
      profile_pic_url: u?.profile_pic_url || u?.profile_picture_url || u?.profile_pic_url_hd || '',
      is_verified: !!(u?.is_verified || u?.verified || u?.is_verified_badge),
      followed_by_viewer: !!u?.followed_by_viewer,
      follows_viewer: !!u?.follows_viewer,
      viewedAt: v?.viewed_at || v?.timestamp || u?.latest_reel_media || (Date.now() - idx * 1000),
      originalIndex: typeof v?.originalIndex === 'number' ? v.originalIndex : idx
    };
  }

  function mirrorToLocalStorageDebounced() {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      
      // Compute NEW viewers by diffing against last seen set
      if (state.currentStoryId) {
        const lastSeenKey = `sl:last_seen:${state.currentStoryId}`;
        const currentViewers = state.viewerStore.get(state.currentStoryId);
        if (currentViewers) {
          const currentSet = new Set(Array.from(currentViewers.values()).map(v => v.username));
          const prevSet = new Set(JSON.parse(localStorage.getItem(lastSeenKey) || '[]'));
          
          // Mark new viewers
          for (const [id, viewer] of currentViewers.entries()) {
            viewer.isNew = !prevSet.has(viewer.username);
          }
          
          // Save current set for next comparison
          localStorage.setItem(lastSeenKey, JSON.stringify([...currentSet]));
        }
      }
      
      const store = {};
      for (const [mediaId, viewersMap] of state.viewerStore) {
        store[mediaId] = {
          viewers: Array.from(viewersMap.entries()),
          fetchedAt: Date.now(),
          generation: 1
        };
      }
      
      try {
        // Only update if data actually changed (prevents UI rerenders)
        const hash = JSON.stringify({ sid: state.currentStoryId, sizes: [...state.viewerStore].map(([k, v]) => [k, v.size]) });
        if (localStorage.getItem('panel_story_store_hash') === hash) return;  // unchanged
        
        localStorage.setItem('panel_story_store', JSON.stringify(store));
        localStorage.setItem('panel_story_store_hash', hash);
        window.dispatchEvent(new CustomEvent('storylister:data_updated', {
          detail: { storyId: state.currentStoryId }
        }));
      } catch (e) {
        console.error('[Storylister] Storage error:', e);
      }
    }, 250);  // Increased delay to reduce UI thrashing
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

    viewers.forEach((raw, idx) => {
      const v = normalizeViewer(raw, idx);
      m.set(v.id, v);  // dedupe by id
    });

    // Broadcast active mediaId when we actually receive it
    state.currentStoryId = String(mediaId); // trust network value
    window.dispatchEvent(new CustomEvent('storylister:active_media', {
      detail: { storyId: state.currentStoryId }
    }));

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

  // Helper to know if our search input is focused
  function searchIsActive() {
    const el = document.querySelector('#sl-search, input#sl-search');
    return el && document.activeElement === el;
  }

  function startFastPagination(scroller, maxMs = 6000) {
    let lastHeight = 0, stable = 0, running = true;
    const started = Date.now();

    const stop = () => { running = false; };
    const userStop = () => stop();

    // Stop when user interacts with the dialog in any way
    const dlg = scroller.closest('[role="dialog"]') || document;
    ['wheel','mousedown','keydown','touchstart'].forEach(evt =>
      dlg.addEventListener(evt, userStop, { once: true, capture: true })
    );

    const tick = () => {
      if (!running || !document.contains(scroller)) return;
      
      // Stop quickly if user is interacting with the panel
      if (searchIsActive()) return;
      
      // hard stop after maxMs
      if (Date.now() - started > maxMs) return;

      const h = scroller.scrollHeight;
      if (h === lastHeight) {
        if (++stable > 2) return;
      } else {
        stable = 0;
        lastHeight = h;
      }

      // Simulate End key with non-bubbling event
      const ev = new KeyboardEvent('keydown', { 
        key: 'End', 
        code: 'End', 
        keyCode: 35, 
        which: 35, 
        bubbles: false,  // Don't bubble to prevent interference
        cancelable: true
      });
      scroller.dispatchEvent(ev);
      scroller.scrollTop = scroller.scrollHeight;
      
      // Pace requests to avoid duplicates
      setTimeout(tick, 180);  // Reduced from 360ms for faster loading
    };
    
    tick();
    return stop;
  }

  function autoOpenViewers() {
    if (!Settings.cache.autoOpen) return;
    if (state.autoOpenInProgress) return;
    if (state.userClosedViewers) return;  // Respect user action

    // Open only once per story to avoid re-open loop
    if (state.currentStoryId && state.lastAutoOpenedStoryId === state.currentStoryId) return;

    const btn = findSeenByButton();
    if (!btn) return;

    state.autoOpenInProgress = true;
    try { btn.click(); } catch (e) { /* ignore */ }

    setTimeout(() => {
      const scroller = findScrollableInDialog();
      if (scroller) {
        // Cancel any previous paginator
        if (state.stopPaginate) { state.stopPaginate(); state.stopPaginate = null; }
        state.stopPaginate = startFastPagination(scroller);
      }
      
      // Stop when dialog closes or user presses Escape / clicks X
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const markClosed = () => {
          state.userClosedViewers = true;
          if (state.stopPaginate) { state.stopPaginate(); state.stopPaginate = null; }
        };
        
        dlg.addEventListener('keydown', (e) => { 
          if (e.key === 'Escape') markClosed(); 
        }, { once: true, capture: true });
        
        const xBtn = dlg.querySelector('[aria-label="Close"], [role="button"] svg[aria-label="Close"]')?.closest('[role="button"],button');
        if (xBtn) xBtn.addEventListener('click', markClosed, { once: true, capture: true });
        
        const mo = new MutationObserver(() => { 
          if (!document.contains(dlg)) { 
            markClosed(); 
            mo.disconnect(); 
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
      }
      
      state.lastAutoOpenedStoryId = state.currentStoryId || state.lastAutoOpenedStoryId;
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
      try {
        if (!v.paused && !v.dataset.slPaused) {
          v.pause(); // pause() returns void, not a Promise
          v.dataset.slPaused = '1';
        }
      } catch (e) {
        // ignore
      }
    });
  };

  const resumeVideos = () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch(e) {}
      delete v.dataset.slPaused;
    });
  };

  // --- DOM observer -> gate + inject + open ---
  const onDOMChange = throttle(async () => {
    const storyId = getCurrentStoryIdFromURL();

    if (await isOnOwnStory()) {
      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();
      pauseVideosIfNeeded();

      if (storyId && storyId !== state.currentStoryId) {
        state.currentStoryId = storyId;
        state.lastAutoOpenedStoryId = null;      // allow one open for this story
        state.userClosedViewers = false;         // reset user close state for new story
        if (state.stopPaginate) { state.stopPaginate(); state.stopPaginate = null; }
        if (DEBUG) console.log('[Storylister] Story changed:', storyId);
        autoOpenViewers();
        cleanupOldStories(10);
      } else if (!storyId) {
        // No id in URL (first story view) — still open Seen by
        state.lastAutoOpenedStoryId = null;
        state.userClosedViewers = false;
        if (state.stopPaginate) { state.stopPaginate(); state.stopPaginate = null; }
        autoOpenViewers();
      }
    } else {
      window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
      if (state.stopPaginate) { state.stopPaginate(); state.stopPaginate = null; }
    }
  }, 200);

  // Handle panel pause/resume requests
  window.addEventListener('storylister:panel_opened', () => {
    pauseVideosIfNeeded();
  });

  window.addEventListener('storylister:panel_closed', () => {
    resumeVideos();
  });

  // OPTIONAL: resume when panel hides
  window.addEventListener('storylister:hide_panel', () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch(e) {}
      delete v.dataset.slPaused;
    });
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