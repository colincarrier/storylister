// content-backend.js
// v16.3 - Key unification fix
(() => {
  'use strict';

  // --- Emergency cleanup of oversized legacy keys (prevents QuotaExceededError) ---
  try {
    ['panel_story_store', 'panel_stories_cache', 'panel_story_index'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v && v.length > 500000) { // ~500 KB
        console.warn(`[Storylister] Removing oversized ${k} (${v.length} bytes)`);
        localStorage.removeItem(k);
      }
    });
  } catch {}

  const DEBUG = false;

  const state = {
    injected: false,
    currentKey: null,              // last active unique key (stories:owner:mediaId)
    openedForKey: new Set(),       // auto-open once per key
    stopPagination: null,          // cancel paginator
    viewerStore: new Map(),        // Map<storyKey, Map<viewerKey, viewer>>
    mirrorTimer: null,
    idToKey: new Map(),            // Map<mediaId -> storyKey> (prevents misrouting)
    sentry: { timer: null, active: false, userClosed: false },
    mediaForKey: new Map(),        // tracks mediaId per story
    lastStoryKey: null             // track last unique story key
  };

  // --- Minimal IDB helper for viewer rows ---
  // Helpers you can keep in this file:
  function getSeenByCount(root = document) {
    const dlg = root.querySelector('div[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;

    // Look for "Seen by 1,234" or "Viewed by 1.234" (locale tolerant).
    const candidates = Array.from(dlg.querySelectorAll('button,[role="button"],span,div'))
      .map(el => el.textContent || '')
      .filter(t => /\b(Seen|Viewed)\s+by\b/i.test(t));
    if (!candidates.length) return null;

    const digits = candidates.join(' ').replace(/[^\d]/g, '');
    const num = digits ? parseInt(digits, 10) : NaN;
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function findScrollableInDialog() {
    const dlg = document.querySelector('div[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    // Prefer an element with overflow-y and real scrollable content.
    const all = dlg.querySelectorAll('*');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 4) {
        return el;
      }
    }
    return null;
  }

  /**
   * Paginate viewers until we loaded them all (or hit a guard).
   * @param {Element} scroller - the scrollable container inside the IG dialog
   * @param {Object} opts
   * @param {number} opts.maxMs - hard timeout
   * @param {boolean} opts.freezeTarget - snapshot the "Seen by" count
   */
  function startPagination(scroller, { maxMs = 30000, freezeTarget = true } = {}) {
    const t0 = performance.now();
    let stopped = false;
    let lastHeight = 0;
    let lastLoaded = 0;
    let stallTicks = 0;

    // Optional: freeze the target so "new views" don't extend the runway.
    const capturedTarget = freezeTarget ? getSeenByCount() : null;

    function stop(reason) {
      stopped = true;
      console.log(`[Storylister] pagination stop: ${reason}`);
    }

    function tick() {
      if (stopped) return;
      if (!document.contains(scroller)) return stop('scroller removed');
      if (performance.now() - t0 > maxMs) return stop('timeout');

      const currentKey = state.lastStoryKey || state.currentKey;
      const map = currentKey ? state.viewerStore.get(currentKey) : null;
      const loaded = map ? map.size : 0;

      const dynamicTarget = freezeTarget ? capturedTarget : getSeenByCount();
      const target = dynamicTarget || null;

      if (target && loaded >= target) {
        return stop(`loaded ${loaded}/${target}`);
      }

      // Stall detection: no new viewers for a while *or* no height change.
      if (loaded === lastLoaded && scroller.scrollHeight === lastHeight) {
        stallTicks += 1;
        if (stallTicks > 6) {
          // Nudge twice to re-trigger IG's lazy loader
          scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight - 120);
          setTimeout(() => { scroller.scrollTop = scroller.scrollHeight; }, 120);
        }
        if (stallTicks > 20) {
          return stop('stall');
        }
      } else {
        stallTicks = 0;
      }

      lastLoaded = loaded;
      lastHeight = scroller.scrollHeight;

      // Normal advance to bottom
      scroller.scrollTop = scroller.scrollHeight;

      setTimeout(tick, 300);
    }

    tick();
    return () => { stopped = true; };
  }

  // Call from your window.addEventListener('message', ...) handler
  function normalizeViewer(raw, idx) {
    const v = { ...raw };
    v.username = (v.username || '').trim();
    v.displayName = v.displayName || v.username;
    v.isVerified = Boolean(v.isVerified);
    v.isFollower = Boolean(v.isFollower);
    v.youFollow = Boolean(v.youFollow);
    v.reaction = v.reaction || null;

    // If IG gives you a timestamp, prefer it. Otherwise leave undefined here.
    if (v.viewedAt && typeof v.viewedAt !== 'number') {
      // normalize if it's a string/relative
      v.viewedAt = Number(v.viewedAt) || undefined;
    }
    return v;
  }

  function upsertViewersForStory(storyKey, viewers) {
    let map = state.viewerStore.get(storyKey);
    if (!map) {
      map = new Map();
      state.viewerStore.set(storyKey, map);
    }

    viewers.forEach((raw, idx) => {
      const v = normalizeViewer(raw, idx);
      const viewerKey = (v.username ? v.username.toLowerCase() : null) || String(v.id || idx);
      const prev = map.get(viewerKey);

      if (!prev) {
        const now = Date.now();
        map.set(viewerKey, {
          ...v,
          firstSeenAt: v.firstSeenAt || now,
          viewedAt: v.viewedAt || now,
          isNew: true,
        });
      } else {
        map.set(viewerKey, {
          ...prev,          // preserve our local state
          ...v,             // overlay fresh IG fields
          isNew: prev.isNew === true, // never re-flip to true
          firstSeenAt: prev.firstSeenAt,
          viewedAt: Number.isFinite(prev.viewedAt) ? prev.viewedAt : (v.viewedAt || prev.firstSeenAt),
        });
      }
    });
  }

  const IDB = {
    db: null,
    initPromise: null,
    init() {
      if (this.initPromise) return this.initPromise;
      this.initPromise = new Promise(resolve => {
        const req = indexedDB.open('storylister_data', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('viewers')) {
            const st = db.createObjectStore('viewers', { keyPath: 'compositeId' });
            st.createIndex('storyId', 'storyId', { unique: false });
            st.createIndex('username', 'username', { unique: false });
          }
        };
        req.onsuccess = () => { this.db = req.result; resolve(); };
        req.onerror  = () => { console.warn('[Storylister] IDB unavailable:', req.error); resolve(); };
      });
      return this.initPromise;
    },
    async clearStory(storyId) {
      await this.init();
      if (!this.db) return;
      return new Promise(resolve => {
        const tx = this.db.transaction(['viewers'], 'readwrite');
        const store = tx.objectStore('viewers');
        const idx = store.index('storyId');
        const req = idx.getAllKeys(storyId);
        req.onsuccess = () => {
          const keys = req.result || [];
          keys.forEach(k => { try { store.delete(k); } catch {} });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    },
    async putViewers(storyId, entriesMap) {
      await this.init();
      if (!this.db) return;
      return new Promise(resolve => {
        const tx = this.db.transaction(['viewers'], 'readwrite');
        const store = tx.objectStore('viewers');
        // Batch writes inside a single transaction (no per-row await)
        for (const [vk, v] of entriesMap.entries()) {
          const username = (v?.username || v?.id || vk || '').toString();
          if (!username) continue;
          try {
            store.put({
              ...v,
              compositeId: `${storyId}_${username}`,
              storyId,
              username,
              timestamp: v?.viewedAt || Date.now()
            });
          } catch {}
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => { console.warn('[Storylister] IDB put failed:', tx.error); resolve(); };
      });
    }
  };
  // Kick IDB init immediately; don't block the page
  IDB.init().catch(()=>{});

  // v16.3: Unique story key generation
  function storyKey(ownerUsername, mediaId){
    const owner = (ownerUsername || '').toLowerCase() || 'unknown';
    const mid = String(mediaId || 'unknown');
    return `stories:${owner}:${mid}`;
  }
  
  function basePrefix(ownerUsername){
    const owner = (ownerUsername || '').toLowerCase() || 'unknown';
    return `stories:${owner}:`;
  }

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
    state.sentry.userClosed = false;  // Reset on new start
    state.sentry.timer = setInterval(() => {
      if (!state.sentry.active) return;
      if (state.sentry.userClosed) {
        stopCountSentry();
        return;
      }
      
      const target = getSeenByCount();
      const currentKey = state.lastStoryKey || state.currentKey;
      const map = currentKey ? state.viewerStore.get(currentKey) : null;
      const loaded = map ? map.size : 0;

      // v16.3: CRITICAL - Never allow loaded > target
      if (target && loaded >= target) {
        // If we somehow have MORE viewers than Instagram reports, clear and reload
        if (loaded > target) {
          console.error(`[Storylister] Count overflow detected: ${loaded} > ${target}, clearing...`);
          if (currentKey) state.viewerStore.set(currentKey, new Map());
          // Don't auto-reopen, just stop
          stopCountSentry();
          return;
        }
        stopCountSentry(); 
        return; 
      }

      const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!dlg) {
        // v16.3: Don't reopen if we've loaded enough (>80% of target)
        if (loaded > 0 && target && loaded >= target * 0.8) {
          stopCountSentry();
        }
        // Don't auto-click to reopen - prevents auto-pause
        return;
      }
      const scroller = findScrollableInDialog();
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 1200);
  }

  // Own story detection - simple and bulletproof
  function isOwnStory() {
    // Your own story on web always has a "Seen by" control
    return !!document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('button,span'))
             .some(el => /^Seen by\s+\d[\d,]*$/i.test((el.textContent || '').trim()));
  }

  // Legacy key function - DEPRECATED, kept for backwards compatibility only
  function getStorageKey() { 
    console.warn('[Storylister] getStorageKey() is deprecated, use unique story keys instead');
    return location.pathname; 
  }

  // A2 - Robust mediaId resolution
  function getMediaIdFromPath() {
    return location.pathname.match(/\/stories\/[^/]+\/(\d{8,})/)?.[1] || null;
  }

  function getStoryOwnerFromURL() {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? m[1] : null;
  }

  function matchIdFromText(text, owner) {
    if (!text) return null;

    // Prefer matches scoped to the owner (if we know it)
    if (owner) {
      const scoped = text.match(new RegExp(`/stories/${owner}/(\\d{15,20})`));
      if (scoped) return scoped[1];
    }

    // Generic ID in JSON
    const generic = text.match(/"id"\s*:\s*"(\d{15,20})"/);
    if (generic) return generic[1];

    // Generic path form
    const path = text.match(/\/stories\/[^/]+\/(\d{15,20})/);
    return path ? path[1] : null;
  }

  // Comprehensive mediaId extraction from DOM
  function getMediaIdFromDOM() {
    const owner = getStoryOwnerFromURL();

    // 0) First-story fallback: sometimes the first story path has no id; scan anchors
    if (owner && !/\/stories\/[^/]+\/\d{8,}/.test(location.pathname)) {
      const anchors = document.querySelectorAll(`a[href*="/stories/${owner}/"]`);
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/stories\/[^/]+\/(\d{8,})/);
        if (m) return m[1];
      }
    }

    // 1) URL path (fastest)
    {
      const m = location.pathname.match(/\/stories\/[^/]+\/(\d{15,20})/);
      if (m) return m[1];
    }

    // 2) "Seen by" link (your own stories)
    {
      const seen = document.querySelector('a[href*="/seen_by/"]');
      if (seen?.href) {
        const m = seen.href.match(/\/stories\/[^/]+\/(\d{15,20})/);
        if (m) return m[1];
      }
    }

    // 3) <link rel="alternate"> variants
    {
      const links = document.querySelectorAll('link[rel="alternate"][href*="/stories/"]');
      for (const l of links) {
        const href = l.getAttribute('href') || '';
        if (owner && !href.includes(`/stories/${owner}/`)) continue;
        const m = href.match(/\/stories\/[^/]+\/(\d{15,20})/);
        if (m) return m[1];
      }
    }

    // 4) App deep links
    {
      const metas = document.querySelectorAll('meta[property^="al:"][content*="/stories/"]');
      for (const meta of metas) {
        const c = meta.getAttribute('content') || '';
        const m = c.match(/\/stories\/[^/]+\/(\d{15,20})/);
        if (m) return m[1];
      }
    }

    // 5) Base64 bootstrap script (data: URL)
    {
      const scripts = document.querySelectorAll('script[src^="data:text/javascript;base64,"]');
      for (const s of scripts) {
        const src = s.getAttribute('src') || '';
        const idx = src.indexOf(',');
        if (idx === -1) continue;
        try {
          const txt = atob(src.slice(idx + 1));
          const id = matchIdFromText(txt, owner);
          if (id) return id;
        } catch (_) {}
      }
    }

    // 6) Any JSON script payloads (defensive)
    {
      const jsonScripts = document.querySelectorAll(
        'script[type="application/json"],script[type="application/ld+json"]'
      );
      for (const s of jsonScripts) {
        const txt = s.textContent || '';
        const id = matchIdFromText(txt, owner);
        if (id) return id;
      }
    }

    return null; // unknown (we'll fall back to pathname as key)
  }

  // Canonical per‑story key - DEPRECATED, use storyKey() instead
  function canonicalKey() {
    console.warn('[Storylister] canonicalKey() is deprecated, use storyKey() instead');
    const owner = getStoryOwnerFromURL() || 'unknown';
    const mid = getMediaIdFromDOM();
    return mid ? `/stories/${owner}/${mid}/` : location.pathname;
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

  // Wait for injection to be ready before clicking
  function waitForInjectedReady(timeout = 1500) {
    return new Promise(resolve => {
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeout);
      function onReady() {
        if (!done) {
          done = true;
          clearTimeout(to);
          document.removeEventListener('storylister:injected_ready', onReady, true);
          resolve(true);
        }
      }
      document.addEventListener('storylister:injected_ready', onReady, true);
    });
  }

  // Injection (no inline, guard runtime)
  async function ensureInjected() {
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
  function mergeReactsFromDialogIntoMap(key) {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return;
    const map = state.viewerStore.get(key);
    if (!map) return;

    const rows = dlg.querySelectorAll('[role="button"], [role="link"], a[href^="/"]');
    rows.forEach(row => {
      // Exact IG heart signature + variants you provided
      const hasHeart = !!(
        row.querySelector('svg[aria-label="Liked"] path[d^="M34.6 3.1"]') ||
        row.querySelector('svg[aria-label*="Liked"] path[d^="M34.6"]') ||
        row.querySelector('svg[aria-label*="Like"] path[d^="M34.6 3.1"]') ||
        row.querySelector('svg path[d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6"]')
      );
      if (!hasHeart) return;

      // Resolve username strictly from profile link element in the row
      const link = row.querySelector('a[href^="/"][href$="/"]:not([href="/"])');
      const username = link?.getAttribute('href')?.replace(/^\/|\/$/g,'') || '';
      if (!username) return;

      const k = username.toLowerCase();
      const prev = map.get(k);
      if (prev && !prev.reaction) {
        map.set(k, { ...prev, reaction: '❤️' });
      }
    });
    mirrorToLocalStorageDebounced(key);
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
      const currentKey = state.lastStoryKey || state.currentKey;
      const map = currentKey ? state.viewerStore.get(currentKey) : null;
      const loaded = map ? map.size : 0;
      if (target && loaded >= target) return;

      scroller.scrollTop = scroller.scrollHeight;
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
      setTimeout(tick, nearBottom ? 450 : 250);
    };
    tick();
    return () => { stopped = true; };
  }

  // Auto-open viewers — first story safe
  async function autoOpenViewersOnceFor(ukey) {
    if (!Settings.cache.autoOpen) return;
    if (state.openedForKey.has(ukey)) return;

    await ensureInjected();
    await waitForInjectedReady();  // Critical: wait for hooks before clicking

    const btn = await waitForSeenByButton(5000);
    if (!btn) return;

    state.openedForKey.add(ukey);
    try { btn.click(); } catch {}
    
    setTimeout(() => {
      const scroller = findScrollableInDialog();
      if (scroller) {
        if (state.stopPagination) state.stopPagination();
        state.stopPagination = startPagination(scroller, { maxMs: 30000, freezeTarget: true });
        startCountSentry(); // keep nudging until target reached
      }
      // Add DOM reaction fallback after dialog opens (pass story key, not Map)
      setTimeout(() => mergeReactsFromDialogIntoMap(ukey), 600);
      setTimeout(() => mergeReactsFromDialogIntoMap(ukey), 2000);
    }, 300);
  }

  // Mirror (debounced), per pathname + mediaId aliases
  function mirrorToLocalStorageDebounced(key) {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(async () => {
      state.mirrorTimer = null;

      const map = state.viewerStore.get(key);
      if (!map || map.size === 0) return;

      // 1) Persist bulk rows to IndexedDB
      try { await IDB.putViewers(key, map); } catch {}

      // 2) Keep a tiny per‑story index in localStorage
      try {
        const index = JSON.parse(localStorage.getItem('panel_story_index') || '{}');
        const prev  = index[key] || {};
        index[key] = {
          mediaId: getMediaIdFromDOM() || prev.mediaId || null,
          count: map.size,
          fetchedAt: Date.now(),
          lastSeenAt: prev.lastSeenAt || 0
        };
        localStorage.setItem('panel_story_index', JSON.stringify(index));
      } catch (e) {
        try { localStorage.removeItem('panel_story_index'); } catch {}
      }

      // 3) Maintain a tiny legacy shell to avoid old code crashing (no viewer arrays)
      try {
        const shell = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
        const existing = shell[key] || {};
        shell[key] = {
          mediaId: getMediaIdFromDOM() || existing.mediaId || null,
          viewers: [],                 // keep empty to stay tiny
          fetchedAt: Date.now(),
          lastSeenAt: existing.lastSeenAt || 0
        };
        localStorage.setItem('panel_story_store', JSON.stringify(shell));
      } catch {}

      // 4) Let UI refresh
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 250);
  }
  
  // Mark all viewers as seen for a story
  function markAllSeenForKey(key) {
    try {
      const idx = JSON.parse(localStorage.getItem('panel_story_index') || '{}');
      if (!idx[key]) idx[key] = {};
      idx[key].lastSeenAt = Date.now();
      localStorage.setItem('panel_story_index', JSON.stringify(idx));
    } catch {}
    // legacy shell (best effort)
    try {
      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      if (store[key]) {
        store[key].lastSeenAt = Date.now();
        localStorage.setItem('panel_story_store', JSON.stringify(store));
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
  }

  // Call from your window.addEventListener('message', ...) handler
  function normalizeViewer(raw, idx) {
    const v = { ...raw };
    v.username = (v.username || '').trim();
    v.displayName = v.displayName || v.username;
    v.isVerified = Boolean(v.isVerified);
    
    // Keep existing normalized follow flags if present, otherwise convert from IG API
    if (!('isFollower' in v)) {
      // IG API naming is backwards:
      //     follows_viewer => THEY follow YOU (isFollower)
      //     followed_by_viewer => YOU follow THEM (youFollow)
      v.isFollower = Boolean(v.follows_viewer || v.follows_you || v.is_follower);
    } else {
      v.isFollower = Boolean(v.isFollower);
    }
    
    if (!('youFollow' in v)) {
      v.youFollow = Boolean(v.followed_by_viewer || v.you_follow || v.is_following);
    } else {
      v.youFollow = Boolean(v.youFollow);
    }
    
    v.reaction = v.reaction || null;

    // If IG gives you a timestamp, prefer it. Otherwise leave undefined here.
    if (v.viewedAt && typeof v.viewedAt !== 'number') {
      // normalize if it's a string/relative
      v.viewedAt = Number(v.viewedAt) || undefined;
    }
    return v;
  }

  function upsertViewersForStory(storyKey, viewers) {
    let map = state.viewerStore.get(storyKey);
    if (!map) {
      map = new Map();
      state.viewerStore.set(storyKey, map);
    }

    viewers.forEach((raw, idx) => {
      const v = normalizeViewer(raw, idx);
      const viewerKey = (v.username ? v.username.toLowerCase() : null) || String(v.id || idx);
      const prev = map.get(viewerKey);

      if (!prev) {
        const now = Date.now();
        map.set(viewerKey, {
          ...v,
          firstSeenAt: v.firstSeenAt || now,
          viewedAt: v.viewedAt || now,
          isNew: true,
        });
      } else {
        map.set(viewerKey, {
          ...prev,          // preserve our local state
          ...v,             // overlay fresh IG fields
          isNew: prev.isNew === true, // never re-flip to true
          firstSeenAt: prev.firstSeenAt,
          viewedAt: Number.isFinite(prev.viewedAt) ? prev.viewedAt : (v.viewedAt || prev.firstSeenAt),
        });
      }
    });
  }

  // Message bridge (route chunks correctly; dedupe; no async spam)
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || evt.origin !== location.origin) return;
    const msg = evt.data;
    if (!msg || msg.source !== 'STORYLISTER' || msg.type !== 'STORYLISTER_VIEWERS_CHUNK') return;

    const { mediaId, ownerUsername, viewers, totalCount, debug } = msg.data || {};
    if (!mediaId || !Array.isArray(viewers)) return;
    
    // v16.3: Use unique story keys to prevent cross-story contamination
    const ukey = storyKey(ownerUsername, mediaId);
    
    // On story change, clear any other keys with the same owner prefix
    if (state.lastStoryKey && state.lastStoryKey !== ukey) {
      const prefix = basePrefix(ownerUsername);
      for (const k of [...state.viewerStore.keys()]) {
        if (k.startsWith(prefix) && k !== ukey) {
          state.viewerStore.delete(k);
        }
      }
    }
    state.lastStoryKey = ukey;
    state.idToKey.set(mediaId, ukey);
    
    // Get or create map for this story
    let map = state.viewerStore.get(ukey);
    if (!map) {
      map = new Map();
      state.viewerStore.set(ukey, map);
    }
    
    // v16.3: Count overflow protection
    const loaded = map.size;
    if (typeof totalCount === 'number' && loaded > totalCount) {
      console.error(`[Storylister] Critical overflow: ${loaded} > ${totalCount}; resetting ${ukey}`);
      map.clear();
      stopCountSentry();
      return;
    }
    
    // Debug logging if available
    if (debug && DEBUG) {
      console.log('[Storylister Debug]', {
        mediaId,
        ownerUsername,
        viewersReceived: debug.rawCount,
        totalCount,
        currentStoryViewers: map.size,
        uniqueKey: ukey
      });
    }

    // Use the new upsert function to process and store viewers
    upsertViewersForStory(ukey, viewers);

    // Re-check overflow after insert (get map again after upsert)
    map = state.viewerStore.get(ukey);
    const loadedAfter = map ? map.size : 0;
    if (typeof totalCount === 'number' && loadedAfter > totalCount) {
      console.error(`[Storylister] Critical overflow after insert: ${loadedAfter} > ${totalCount}; resetting ${ukey}`);
      map.clear();
      stopCountSentry();
      return;
    }

    // Apply DOM fallback for reactions (correct argument = story key)
    mergeReactsFromDialogIntoMap(ukey);

    mirrorToLocalStorageDebounced(ukey);

    // Announce active story key to the UI so it reads the same store key
    state.currentKey = state.lastStoryKey = ukey;
    window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: ukey } }));
  });

  // v16.3: Detect when user manually closes the viewer dialog
  document.addEventListener('click', (e) => {
    // Check if click is outside dialog (backdrop) or on close button
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return;
    
    const isCloseBtn = e.target.closest('[aria-label*="Close"]');
    const isBackdrop = e.target === dlg.parentElement;
    const isOutside = !dlg.contains(e.target) && dlg.parentElement.contains(e.target);
    
    if (isCloseBtn || isBackdrop || isOutside) {
      if (state.sentry.active) {
        state.sentry.userClosed = true;
        stopCountSentry();
        if (DEBUG) console.log('[Storylister] User closed dialog, stopping auto-reopen');
      }
    }
  }, true);

  // DOM observer (throttled), no auto-pause, first-story auto-open
  const onDOMChange = (() => {
    let lastKey = null;
    let lastMediaId = null;
    
    return () => {
      if (!location.pathname.startsWith('/stories/') || !isOwnStory()) {
        stopCountSentry();
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      ensureInjected();

      const mediaId = getMediaIdFromDOM();              // media id if present
      const owner = getStoryOwnerFromURL() || 'unknown';
      const ukey = storyKey(owner, mediaId || 'unknown');

      if (ukey !== lastKey || (mediaId && mediaId !== lastMediaId)) {
        // story changed
        if (state.stopPagination) state.stopPagination();

        // Clear viewer map for this unique story to avoid carryover
        state.viewerStore.set(ukey, new Map());
        // Best effort: clear any old persisted rows for this story key
        try { IDB.clearStory(ukey); } catch {}

        lastKey = state.currentKey = state.lastStoryKey = ukey;
        lastMediaId = mediaId;

        // When story changes, allow re-open once
        state.openedForKey.delete(ukey);
        autoOpenViewersOnceFor(ukey);

        // Announce active key so UI reads the correct bucket
        window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: ukey } }));
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

  // Mark "seen" only when panel is CLOSED so "NEW since last check"
  // actually means since the last time you reviewed the list.
  window.addEventListener('storylister:panel_closed', () => {
    if (state.lastStoryKey) markAllSeenForKey(state.lastStoryKey);
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