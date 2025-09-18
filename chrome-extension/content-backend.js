// content-backend.js  — OWN STORY detection + auto-open + panel events
(() => {
  'use strict';

  // ---------- Settings ----------
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

  const state = { currentStoryId: null, injected: false };

  const getOwnerFromPath = () => {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  // Robust logged‑in username detection (no saved handle required)
  const getLoggedInUser = () => {
    // 1) nav avatar alt='X's profile picture'
    const navAvatar = document.querySelector('nav a[href^="/"] img[alt$="profile picture"]');
    if (navAvatar) return navAvatar.alt.replace("'s profile picture", "");

    // 2) any nav profile link
    const links = document.querySelectorAll('nav a[href^="/"]:not([href="/"])');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (href.includes('/direct') || href.includes('/explore')) continue;
      const user = href.replace(/\//g, '').split('?')[0];
      if (user) return user;
    }

    // 3) fallback legacy alt
    const img = Array.from(document.querySelectorAll('img[alt*="profile picture"]'))
      .find(el => el.alt.includes("'s profile picture"));
    if (img) return img.alt.split("'s profile picture")[0];

    return null;
  };

  // "Seen by" presence (strict but resilient)
  const hasSeenByUI = () => {
    if (document.querySelector('a[href*="/seen_by/"]')) return true;

    // text 'Seen by <number>' anywhere in the story surface
    const el = Array.from(document.querySelectorAll('span, div'))
      .find(e => /^Seen by \d+$/i.test((e.textContent || '').trim()));
    if (el) return true;

    // some builds put the count directly inside a role=button wrapper
    for (const btn of document.querySelectorAll('button,[role="button"]')) {
      const t = (btn.textContent || '').trim();
      if (/^Seen by|^\d+ viewer/i.test(t)) return true;
    }
    return false;
  };

  const isOnStories = () => location.pathname.includes('/stories/');

  // Strict own‑story check: owner == logged‑in user AND viewer UI exists
  const isOwnStory = () => {
    if (!isOnStories()) return false;
    const owner = getOwnerFromPath();
    const logged = getLoggedInUser();
    if (!owner || !logged) return false;
    if (owner.toLowerCase() !== logged.toLowerCase()) return false;
    return hasSeenByUI();
  };

  // ---- Inject the page script once (listeners + fast pagination) ----
  const ensureInjected = () => {
    if (state.injected) return;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.dataset.storylisterInjected = '1';
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
    state.injected = true;
  };

  // Find clickable "Seen by …"
  const findSeenByClickable = () => {
    const link = document.querySelector('a[href*="/seen_by/"]');
    if (link) return link;

    const candidates = Array.from(document.querySelectorAll('span,div'))
      .filter(e => /^Seen by \d+$|^\d+ viewer/i.test((e.textContent || '').trim()));
    for (const c of candidates) {
      const clicky = c.closest('[role="button"],[tabindex],button,a') || c;
      if (clicky) return clicky;
    }
    return null;
  };

  // Only pause when panel says to (prevents "frozen" stories)
  const pauseVideosIfNeeded = () => {
    if (!Settings.cache.pauseVideos) return;
    document.querySelectorAll('video').forEach(v => {
      if (!v.paused && !v.dataset.slPaused) {
        v.pause();
        v.dataset.slPaused = '1';
      }
    });
  };
  const resumeVideos = () => {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      v.play();
      delete v.dataset.slPaused;
    });
  };

  // Auto‑open dialog (simple setTimeout/RAF – no requestIdleCallback)
  const autoOpenViewers = async () => {
    if (!Settings.cache.autoOpen || !isOwnStory()) return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

    let tries = 0;
    while (tries < 10) {
      const target = findSeenByClickable();
      if (target) {
        target.click();
        await new Promise(r => setTimeout(r, 400));
        if (document.querySelector('[role="dialog"] h2')?.textContent?.trim() === 'Viewers') {
          return;
        }
      }
      await new Promise(r => setTimeout(r, 250));
      tries++;
    }
  };

  // --- Observe SPA changes; decide when to show/hide/paginate ---
  const observe = () => {
    const mo = new MutationObserver(() => {
      const urlMatch = location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
      const storyId = urlMatch ? urlMatch[1] : null;

      if (!isOwnStory()) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        return;
      }

      // Own story: show panel and ensure inject + open dialog
      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();
      if (storyId && storyId !== state.currentStoryId) {
        state.currentStoryId = storyId;
        // slight delay helps with UI stability
        setTimeout(() => autoOpenViewers(), 300);
      }
    });

    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  };

  // Bridge for chunks coming from injected.js -> localStorage (UI reads it)
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const msg = e.data;
    if (msg?.type === 'STORYLISTER_VIEWERS_CHUNK') {
      const { mediaId, viewers, totalCount } = msg.data || {};
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
          capturedAt: v.capturedAt || Date.now(),
          viewedAt: v.viewedAt || null
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
    }
  });

  // Handle panel pause/resume requests
  window.addEventListener('storylister:panel_opened', () => {
    pauseVideosIfNeeded();
  });

  window.addEventListener('storylister:panel_closed', () => {
    resumeVideos();
  });

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { Settings.load(); observe(); });
  } else {
    Settings.load(); observe();
  }
})();