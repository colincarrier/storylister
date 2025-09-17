// content-backend.js
(() => {
  'use strict';

  // ---------------- Settings (storage) ----------------
  const Settings = {
    cache: { accountHandle: null, pro: false, autoOpen: true, pauseVideos: true },
    async load() {
      try {
        const s = await chrome.storage.sync.get(['accountHandle','pro','autoOpen','pauseVideos']);
        this.cache.accountHandle = s.accountHandle || null;
        this.cache.pro = !!s.pro;
        this.cache.autoOpen = s.autoOpen !== false;
        this.cache.pauseVideos = s.pauseVideos !== false;
      } catch {}
    },
    async save(patch) {
      Object.assign(this.cache, patch);
      try { await chrome.storage.sync.set(patch); } catch {}
    }
  };

  // ---------------- Helpers ----------------
  const state = { currentStoryId: null, injected: false };

  const getOwnerFromPath = () => {
    const m = location.pathname.match(/\/stories\/([^\/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  const hasSeenByUI = () => (
    !!document.querySelector('a[href*="/seen_by/"]') ||
    Array.from(document.querySelectorAll('span,div'))
      .some(el => /^seen by( \d+)?$/i.test((el.textContent || '').trim()))
  );

  const isOnStories = () => location.pathname.includes('/stories/');

  // Only our own story: (1) we're in /stories/, (2) the "Seen by" UI exists,
  // (3) if a primary account is set and not Pro, it must match the handle in the URL.
  const isOwnStory = () => {
    if (!isOnStories()) return false;
    if (!hasSeenByUI()) return false;
    const owner = getOwnerFromPath();
    if (!owner) return false;

    // First detection → set as primary if none saved
    if (!Settings.cache.accountHandle) {
      Settings.save({ accountHandle: owner });
      return true;
    }

    // Free users work on one account; Pro users bypass this
    if (!Settings.cache.pro && Settings.cache.accountHandle !== owner) return false;
    return true;
  };

  // Inject page-level script once (fetch interceptor & fast pagination)
  const ensureInjected = () => {
    if (state.injected) return;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.dataset.storylisterInjected = '1';
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
    state.injected = true;
  };

  // Find the clickable "Seen by" element
  const findSeenByClickable = () => {
    const a = document.querySelector('a[href*="/seen_by/"]');
    if (a) return a;
    const candidate = Array.from(document.querySelectorAll('span,div'))
      .find(el => /^seen by( \d+)?$/i.test((el.textContent || '').trim()));
    return candidate
      ? (candidate.closest('[role="button"],[tabindex],button,a') || candidate)
      : null;
  };

  // Pause videos if needed
  const pauseVideosIfNeeded = () => {
    if (!Settings.cache.pauseVideos) return;
    if (!isOwnStory()) return;
    
    document.querySelectorAll('video').forEach(v => {
      if (!v.paused && !v.dataset.slPaused) {
        v.pause();
        v.dataset.slPaused = '1';
      }
    });
  };

  // Resume videos
  const resumeVideos = () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      v.play();
      delete v.dataset.slPaused;
    });
  };

  // Auto-open viewers (no random timers; frame-aligned)
  const autoOpenViewers = () => {
    if (!Settings.cache.autoOpen) return;
    if (!isOwnStory()) return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

    const t = findSeenByClickable();
    if (!t) return;
    
    console.log('[Storylister] Auto-opening viewer dialog');
    requestAnimationFrame(() => t.click());
  };

  // Receive viewer chunks from injected.js and mirror to localStorage
  window.addEventListener('message', (evt) => {
    if (evt.source !== window) return;
    if (evt.data?.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers, totalCount } = evt.data.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;

    const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
    if (!store[mediaId]) store[mediaId] = { viewers: [], fetchedAt: Date.now() };

    const present = new Set(store[mediaId].viewers.map(([k]) => k));
    viewers.forEach((v) => {
      const key = v.username || String(v.id || v.pk);
      if (present.has(key)) return;
      store[mediaId].viewers.push([key, {
        id: String(v.id || v.pk || key),
        username: v.username || key,
        full_name: v.full_name || '',
        profile_pic_url: v.profile_pic_url || '',
        is_verified: !!v.is_verified,
        followed_by_viewer: !!v.followed_by_viewer,
        follows_viewer: !!v.follows_viewer,
        originalIndex: typeof v.originalIndex === 'number'
          ? v.originalIndex
          : store[mediaId].viewers.length,
        capturedAt: v.capturedAt || Date.now()
      }]);
      present.add(key);
    });

    store[mediaId].totalCount = totalCount ?? store[mediaId].totalCount;

    try {
      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', {
        detail: { storyId: mediaId, viewerCount: store[mediaId].viewers.length }
      }));
    } catch (e) {
      console.error('[Storylister] Failed to save viewers:', e);
    }
  });

  // Handle panel opened/closed events from content.js
  window.addEventListener('storylister:panel_opened', () => {
    pauseVideosIfNeeded();
  });

  window.addEventListener('storylister:panel_closed', () => {
    resumeVideos();
  });

  // ---------------- Boot ----------------
  const start = async () => {
    await Settings.load();
    console.log('[Storylister] Backend started with settings:', Settings.cache);

    const mo = new MutationObserver(() => {
      const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
      const sid = m ? m[1] : null;
      if (!sid) return;

      if (sid !== state.currentStoryId) {
        state.currentStoryId = sid;
        if (isOwnStory()) {
          console.log('[Storylister] Own story detected, injecting and auto-opening');
          ensureInjected();
          setTimeout(() => autoOpenViewers(), 500); // Small delay for Instagram UI
          pauseVideosIfNeeded();
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Initial try
    if (isOnStories() && isOwnStory()) {
      ensureInjected();
      setTimeout(() => autoOpenViewers(), 1000);
      pauseVideosIfNeeded();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();