(() => {
  'use strict';

  const DEBUG = false;

  const state = {
    injected: false,
    currentKey: null,             // Track by path instead of ID
    autoOpenInProgress: false,
    userClosedForStory: null,     // Which story ID the user closed
    stopPagination: null,         // Holds cancel function for running paginator
    viewerStore: new Map(),       // Map<mediaId, Map<viewerId, viewer>>
    mirrorTimer: null,
    sessionId: Date.now().toString(36),  // Session ID for data scoping
    openedForKey: new Set()      // Track which stories we've auto-opened
  };

  function resetStoryState() {
    state.autoOpenInProgress = false;
    state.userClosedForStory = null;
    if (state.stopPagination) {
      state.stopPagination();
      state.stopPagination = null;
    }
  }

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

  // Extract "Seen by N" count from Instagram UI
  function getSeenByCount() {
    // Look for the "Seen by N" button or link
    const seenByLink = document.querySelector('a[href*="/seen_by/"]');
    if (seenByLink) {
      const text = seenByLink.textContent || '';
      const match = text.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }
    
    // Fallback: check all buttons for "Seen by N" pattern
    const buttons = Array.from(document.querySelectorAll('[role="button"],button,span,div'));
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (/^Seen by\s+(\d[\d,]*)/i.test(text)) {
        const match = text.match(/(\d[\d,]*)/);
        if (match) {
          return parseInt(match[1].replace(/,/g, ''), 10);
        }
      }
    }
    return null;
  }

  function getStoryOwnerFromURL() {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? m[1] : null;
  }

  function getCurrentStoryIdFromURL() {
    const m = location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function getStorageKey() {
    // Works for /stories/<user>/ (first story) and /stories/<user>/<id>/
    return location.pathname;
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

      // Use the current pathname as key
      const key = getStorageKey();
      const currentViewers = state.viewerStore.get(key);
      
      if (!currentViewers || currentViewers.size === 0) {
        // Don't write empty data
        return;
      }

      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      store[key] = {
        viewers: Array.from(currentViewers.entries()),
        fetchedAt: Date.now(),
        sessionId: state.sessionId  // Add session ID for scoping
      };
      localStorage.setItem('panel_story_store', JSON.stringify(store));

      window.dispatchEvent(new CustomEvent('storylister:data_updated', {
        detail: { storyId: key, sessionId: state.sessionId }
      }));
    }, 200);
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

    // Store viewers under the current pathname key
    const key = getStorageKey();
    if (!state.viewerStore.has(key)) {
      state.viewerStore.set(key, new Map());
    }
    const m = state.viewerStore.get(key);

    viewers.forEach((raw, idx) => {
      const v = normalizeViewer(raw, idx);
      // Deduplicate by username (lower-cased) or id
      const viewerKey = 
        (v.username ? String(v.username).toLowerCase() : null) ||
        String(v.id || v.pk || idx);
      m.set(viewerKey, v);
    });

    // Broadcast active media with pathname key
    window.dispatchEvent(new CustomEvent('storylister:active_media', {
      detail: { storyId: key }
    }));

    if (DEBUG) console.log(`[Storylister] Received ${viewers.length} viewers for ${key}`, { totalCount });
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
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    return dlg.querySelector('[style*="overflow-y"]')
        || dlg.querySelector('[style*="overflow: hidden auto"]')
        || Array.from(dlg.querySelectorAll('div')).find(el => el.scrollHeight > el.clientHeight + 40)
        || dlg;
  }

  function watchDialogCloseOnce() {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg || !dlg.parentElement) return;
    const mo = new MutationObserver(() => {
      if (!document.contains(dlg)) {
        state.userClosedForStory = state.currentKey; // respect the user's intent
        mo.disconnect();
      }
    });
    mo.observe(dlg.parentElement, { childList: true });
  }

  function startPagination(scroller, maxMs = 6000) {
    const start = Date.now();
    let stopped = false;

    const tick = () => {
      if (stopped || !document.contains(scroller)) return;
      if (Date.now() - start > maxMs) return;

      // Stop when we've captured at least "Seen by N" viewers
      const target = getSeenByCount();
      const currentViewers = state.viewerStore.get(getStorageKey());
      const loaded = currentViewers ? currentViewers.size : 0;
      
      if (target && loaded >= target) {
        if (DEBUG) console.log(`[Storylister] Stopping pagination: loaded ${loaded} >= target ${target}`);
        return; // We have enough viewers
      }

      // Just scroll to bottom; Instagram will load more
      scroller.scrollTop = scroller.scrollHeight;

      // Slow down when near bottom
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
      setTimeout(tick, nearBottom ? 450 : 250);
    };

    tick();
    return () => { stopped = true; };
  }

  function autoOpenViewers() {
    if (!Settings.cache.autoOpen) return;
    if (state.autoOpenInProgress) return;
    
    const storyKey = getStorageKey();
    
    // Don't re-open if user closed this story
    if (state.userClosedForStory === storyKey) return;
    
    // Only auto-open once per story key
    if (state.openedForKey.has(storyKey)) return;
    
    const btn = findSeenByButton();
    if (!btn) return;

    state.openedForKey.add(storyKey);
    state.autoOpenInProgress = true;
    
    setTimeout(() => {
      try { btn.click(); } catch (_) {}
      setTimeout(() => {
        const scroller = findScrollableInDialog();
        if (scroller) {
          // Cancel any previous pagination
          if (state.stopPagination) state.stopPagination();
          state.stopPagination = startPagination(scroller);
          watchDialogCloseOnce();
        }
        state.autoOpenInProgress = false;
      }, 400);
    }, 300);  // Slightly longer delay for first story
  }

  function cleanupOldStories(max = 10) {
    if (state.viewerStore.size <= max) return;
    const keys = Array.from(state.viewerStore.keys());
    const toRemove = keys.slice(0, keys.length - max);
    toRemove.forEach(k => state.viewerStore.delete(k));
  }

  // Natural video pause with delay
  function pauseVideosIfNeeded() {
    if (!Settings.cache.pauseVideos) return;

    // Natural feel, avoid "botty" pauses
    setTimeout(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.dataset.userPlayed === '1') return; // respect manual play
        if (!v.paused && !v.dataset.slPaused) {
          try { v.pause(); v.dataset.slPaused = '1'; } catch (_) {}
        }
      });
    }, 800);
  }

  const resumeVideos = () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch(e) {}
      delete v.dataset.slPaused;
    });
  };

  // --- DOM observer -> gate + inject + open ---
  const onDOMChange = throttle(async () => {
    const storyKey = getStorageKey();

    // Only attach on your own story
    if (!(await isOnOwnStory())) {
      window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
      resetStoryState();
      return;
    }

    window.dispatchEvent(new CustomEvent('storylister:show_panel'));
    ensureInjected();
    pauseVideosIfNeeded();

    // Run auto-open once per story-view using pathname key
    if (storyKey !== state.currentKey) {
      resetStoryState();
      state.currentKey = storyKey;
      autoOpenViewers();
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

  // Mark when user plays a video so we never re-pause it
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (v && v.tagName === 'VIDEO') v.dataset.userPlayed = '1';
  }, true);

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