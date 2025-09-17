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

  // Get logged-in user from Instagram UI
  const getLoggedInUser = () => {
    // Method 1: From profile picture alt text
    const profileImgs = document.querySelectorAll('img[alt*="profile picture"]');
    for (const img of profileImgs) {
      const match = img.alt.match(/^(.+?)'s profile picture/);
      if (match) {
        console.log('[Storylister] Detected logged-in user from profile pic:', match[1]);
        return match[1];
      }
    }
    
    // Method 2: From profile link in nav
    const profileLink = document.querySelector('a[href^="/"][role="link"] span')?.parentElement?.parentElement;
    if (profileLink?.getAttribute('href')) {
      const username = profileLink.getAttribute('href').replace(/\//g, '');
      if (username && username !== 'direct' && username !== 'explore') {
        console.log('[Storylister] Detected logged-in user from nav:', username);
        return username;
      }
    }
    
    console.log('[Storylister] Could not detect logged-in user');
    return null;
  };

  // Check if "Seen by" exists ONLY in story area
  const hasSeenByUI = () => {
    // Look for the story viewer container
    const storyContainer = document.querySelector('[aria-label*="Story"], section > div > div[style*="height"]');
    if (!storyContainer) {
      console.log('[Storylister] No story container found');
      return false;
    }
    
    // Look for actual "Seen by" link (most reliable)
    const seenByLink = document.querySelector('a[href*="/seen_by/"]');
    if (seenByLink) {
      console.log('[Storylister] Found "Seen by" link');
      return true;
    }
    
    // Backup: Look for viewer count in story area only
    const viewerElements = storyContainer.querySelectorAll('span, div');
    for (const el of viewerElements) {
      const text = (el.textContent || '').trim();
      if (/^Seen by \d+$|^\d+ viewer/i.test(text)) {
        console.log('[Storylister] Found viewer count text:', text);
        return true;
      }
    }
    
    return false;
  };

  const isOnStories = () => location.pathname.includes('/stories/');

  // Strict own-story detection
  const isOwnStory = () => {
    if (!isOnStories()) return false;
    
    const storyOwner = getOwnerFromPath();
    const loggedInUser = getLoggedInUser();
    
    console.log('[Storylister] Story owner:', storyOwner, 'Logged-in user:', loggedInUser);
    
    // Must have both usernames
    if (!storyOwner || !loggedInUser) return false;
    
    // Must match (case-insensitive)
    if (storyOwner.toLowerCase() !== loggedInUser.toLowerCase()) {
      console.log('[Storylister] Not own story - owner:', storyOwner, 'user:', loggedInUser);
      return false;
    }
    
    // Must have viewer UI
    const hasViewerUI = hasSeenByUI();
    console.log('[Storylister] Has viewer UI:', hasViewerUI);
    
    return hasViewerUI;
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
    console.log('[Storylister] Injected script loaded');
  };

  // Find the clickable "Seen by" element
  const findSeenByClickable = () => {
    // Primary: Look for the actual link
    const link = document.querySelector('a[href*="/seen_by/"]');
    if (link) {
      console.log('[Storylister] Found "Seen by" link');
      return link;
    }
    
    // Backup: Look for viewer count that might be clickable
    const candidates = Array.from(document.querySelectorAll('span, div'))
      .filter(el => /^Seen by \d+$|^\d+ viewer/i.test((el.textContent || '').trim()));
    
    for (const candidate of candidates) {
      const clickable = candidate.closest('[role="button"], [tabindex], button, a') || candidate;
      if (clickable) {
        console.log('[Storylister] Found clickable viewer element:', clickable.textContent);
        return clickable;
      }
    }
    
    console.log('[Storylister] No clickable "Seen by" element found');
    return null;
  };

  // Pause videos ONLY when called by panel
  const pauseVideosIfNeeded = () => {
    if (!Settings.cache.pauseVideos) return;
    // Don't check isOwnStory here - let the panel control this
    
    console.log('[Storylister] Pausing videos');
    document.querySelectorAll('video').forEach(v => {
      if (!v.paused && !v.dataset.slPaused) {
        v.pause();
        v.dataset.slPaused = '1';
      }
    });
  };

  // Resume videos
  const resumeVideos = () => {
    console.log('[Storylister] Resuming videos');
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      v.play();
      delete v.dataset.slPaused;
    });
  };

  // Auto-open viewers with retry logic
  const autoOpenViewers = async () => {
    if (!Settings.cache.autoOpen) return;
    if (!isOwnStory()) {
      console.log('[Storylister] Not own story, skipping auto-open');
      return;
    }
    
    // Don't open if dialog already exists
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
      console.log('[Storylister] Dialog already open');
      return;
    }

    console.log('[Storylister] Waiting for "Seen by" element...');
    
    // Try to find and click "Seen by" (up to 3 seconds)
    let attempts = 0;
    while (attempts < 10) {
      const seenBy = findSeenByClickable();
      if (seenBy) {
        console.log('[Storylister] Clicking "Seen by" element');
        seenBy.click();
        
        // Wait a bit to see if dialog opened
        await new Promise(r => setTimeout(r, 500));
        
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
          console.log('[Storylister] Dialog opened successfully');
          return;
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
      attempts++;
    }
    
    console.log('[Storylister] Could not auto-open viewers after', attempts, 'attempts');
  };

  // Receive viewer chunks from injected.js and mirror to localStorage
  window.addEventListener('message', (evt) => {
    if (evt.source !== window) return;
    if (evt.data?.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, viewers, totalCount } = evt.data.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;
    
    console.log('[Storylister] Received viewer chunk:', viewers.length, 'viewers for story', mediaId);

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
      console.log('[Storylister] Saved', store[mediaId].viewers.length, 'viewers to storage');
    } catch (e) {
      console.error('[Storylister] Failed to save viewers:', e);
    }
  });

  // Handle panel opened/closed events from content.js
  window.addEventListener('storylister:panel_opened', () => {
    console.log('[Storylister] Panel opened event received');
    pauseVideosIfNeeded();
  });

  window.addEventListener('storylister:panel_closed', () => {
    console.log('[Storylister] Panel closed event received');
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
        console.log('[Storylister] Story changed to:', sid);
        
        if (isOwnStory()) {
          console.log('[Storylister] Own story detected, preparing...');
          ensureInjected();
          // Don't pause videos here! Let the panel control that
          setTimeout(() => autoOpenViewers(), 1000);
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Initial check
    if (isOnStories()) {
      console.log('[Storylister] On stories page, checking if own story...');
      if (isOwnStory()) {
        console.log('[Storylister] Initial own story detected');
        ensureInjected();
        // Don't pause videos here! Let the panel control that
        setTimeout(() => autoOpenViewers(), 1500);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();