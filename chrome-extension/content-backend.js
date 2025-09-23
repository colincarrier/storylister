(() => {
  'use strict';

  // ==== [A] TOP OF FILE: state + Settings ====
  const DEBUG = false;

  const state = {
    injected: false,
    currentKey: null,          // stable key = location.pathname (works with and w/o numeric id)
    autoOpenInProgress: false,
    openedForKey: new Set(),   // prevent re-opening
    stopPagination: null,
    viewerStore: new Map(),    // Map<storyKey, Map<viewerKey, viewer>>
    mirrorTimer: null,
    idToKey: new Map(),        // Map<mediaId -> storyKey>
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

  // ==== [B] UTILITIES ====
  function getStorageKey() { return location.pathname; }  // first-story safe

  function findSeenByButton() {
    return document.querySelector('a[href*="/seen_by/"]') ||
           Array.from(document.querySelectorAll('[role="button"],button'))
             .find(el => /^Seen by(\s+[0-9,]+)?$/i.test((el.textContent||'').trim())) || null;
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
    if (!hasSeenByUI()) return false; // bulletproof indicator
    const owner = getStoryOwnerFromURL();
    if (!owner) return false;
    return await canRunForOwner(owner);
  }

  // ==== [C] NATURAL PAUSE — pause only while the IG viewers dialog is open ====
  function pauseVideosWhileViewerOpen() {
    if (!Settings.cache.pauseVideos) return;
    const dlgOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlgOpen) return; // don't auto-pause when the dialog isn't open

    setTimeout(() => {
      document.querySelectorAll('video').forEach(v => {
        if (v.dataset.userPlayed === '1') return; // respect manual play
        if (!v.paused && !v.dataset.slPaused) {
          try { v.pause(); v.dataset.slPaused = '1'; } catch {}
        }
      });
    }, 1200); // breaths like a human
  }

  function resumeAnyPausedVideos() {
    document.querySelectorAll('video[data-sl-paused="1"]').forEach(v => {
      try { v.play(); } catch {}
      delete v.dataset.slPaused;
    });
  }

  document.addEventListener('play', (e) => {
    if (e.target?.tagName === 'VIDEO') e.target.dataset.userPlayed = '1';
  }, true);

  // ==== [D] PAGINATION — simple + bounded ====
  function startPagination(scroller, maxMs = 6000) {
    const t0 = Date.now();
    let stopped = false;
    const tick = () => {
      if (stopped || !document.contains(scroller)) return;
      if (Date.now() - t0 > maxMs) return;

      const target = getSeenByCount();
      const currentMap = state.viewerStore.get(getStorageKey());
      const loaded = currentMap ? currentMap.size : 0;
      if (target && loaded >= target - 1) return; // allow ±1

      scroller.scrollTop = scroller.scrollHeight;
      const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 10;
      setTimeout(tick, nearBottom ? 450 : 250);
    };
    tick();
    return () => { stopped = true; };
  }

  // ==== [E] AUTO-OPEN — first story safe ====
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

  // ==== [F] MIRROR TO CACHE — key = pathname; write debounced ====
  function mirrorToLocalStorageDebounced(key) {
    if (state.mirrorTimer) return;
    state.mirrorTimer = setTimeout(() => {
      state.mirrorTimer = null;
      const map = state.viewerStore.get(key);
      if (!map || map.size === 0) return;

      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      store[key] = { viewers: Array.from(map.entries()), fetchedAt: Date.now() };

      // Also store aliases for mediaIds that map to this key (prevents mis-routing on refresh)
      const aliases = {};
      for (const [mid, k] of state.idToKey.entries()) if (k === key) aliases[mid] = k;
      store.__aliases = Object.assign(store.__aliases || {}, aliases);

      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: key } }));
    }, 300);
  }

  // ==== [G] MESSAGE BRIDGE — correct routing + dedupe ====
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
      // dedupe by username (lowercased) or id
      const viewerKey = (v.username ? String(v.username).toLowerCase() : null) || String(v.id || idx);
      const prev = map.get(viewerKey) || {};
      map.set(viewerKey, { ...prev, ...v });
    });

    mirrorToLocalStorageDebounced(key);
  });

  // Define the injected function that will be inlined
  function injectedFunction() {
    'use strict';
    if (window.__storylisterInjected__) return;
    window.__storylisterInjected__ = true;

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await origFetch.apply(this, args);

      try {
        const url = String(args?.[0] || '');
        // Only JSON
        const ct = res.headers?.get('content-type') || '';
        if (!/json/i.test(ct)) return res;

        const relevant = url.includes('/api/') || url.includes('/graphql') || /viewer|viewers|story|reel|seen/i.test(url);
        if (!relevant) return res;

        const clone = res.clone();
        clone.json().then(data => {
          if (!data) return;

          // Collect viewers from known shapes
          let viewers = null;
          if (Array.isArray(data.users)) viewers = data.users;
          else if (Array.isArray(data.viewers)) viewers = data.viewers;
          else if (data?.data?.xdt_api__v1__media__story_viewers?.viewers) viewers = data.data.xdt_api__v1__media__story_viewers.viewers;
          else if (data?.data?.media?.story_viewers?.edges) viewers = data.data.media.story_viewers.edges.map(e => e.node || e.user || e);
          else if (data?.data?.xdt_api__v1__stories__viewers__connection__edge?.edges) viewers = data.data.xdt_api__v1__stories__viewers__connection__edge.edges.map(e => e.node || e);

          if (!viewers || viewers.length === 0) return;

          // Media id: prefer payload, then URL id
          const pathId = location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1];
          const graphId = data?.media_id || data?.data?.media?.id || data?.data?.reel?.id;
          const mediaId = String(graphId || pathId || Date.now());

          const normalized = viewers.map((v, idx) => normalizeViewer(v, idx));

          window.postMessage({
            type: 'STORYLISTER_VIEWERS_CHUNK',
            data: {
              mediaId,
              viewers: normalized,
              totalCount: data.user_count || data.total_viewer_count || normalized.length
            }
          }, '*');
        }).catch(() => {});
      } catch {}
      return res;
    };

    // (Optional) XHR backup for older endpoints
    const XHR = window.XMLHttpRequest;
    if (XHR) {
      const P = XHR.prototype, _open = P.open, _send = P.send;
      P.open = function(method, url, ...rest) { this.__slUrl = url; return _open.call(this, method, url, ...rest); };
      P.send = function(...args) {
        const url = this.__slUrl || '';
        if (/story_viewers|list_reel_media_viewer|api\/v1\//.test(url)) {
          this.addEventListener('load', function() {
            try {
              const data = JSON.parse(this.responseText);
              const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data?.viewers) ? data.viewers : null);
              if (!users) return;

              const pathId = location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1];
              const mediaId = String(data.media_id || pathId || Date.now());
              const normalized = users.map((u, idx) => normalizeViewer(u, idx));

              window.postMessage({
                type: 'STORYLISTER_VIEWERS_CHUNK',
                data: { mediaId, viewers: normalized, totalCount: data.user_count || normalized.length }
              }, '*');
            } catch {}
          });
        }
        return _send.apply(this, args);
      };
    }

    function normalizeViewer(v, idx) {
      const u = v?.user || v?.node?.user || v?.node || v;

      // Robust profile pic: accept only absolute http(s) URLs
      let pic = u?.profile_pic_url || u?.profile_pic_url_hd || u?.profile_picture_url || '';
      if (typeof pic !== 'string' || !/^https?:\/\//i.test(pic)) pic = '';

      // Reactions from known shapes; likes -> ❤️
      const reaction =
        v?.reaction?.emoji ||
        v?.story_reaction?.emoji ||
        v?.latest_reaction?.emoji ||
        (v?.has_liked ? '❤️' : null);

      return {
        id: String(u?.id || u?.pk || u?.pk_id || u?.username || idx),
        username: u?.username || '',
        full_name: u?.full_name || u?.fullname || u?.name || '',
        profile_pic_url: pic,
        is_verified: !!(u?.is_verified || u?.blue_verified || u?.is_verified_badge || u?.verified),
        followed_by_viewer: !!(u?.followed_by_viewer || u?.is_following),
        follows_viewer: !!(u?.follows_viewer || u?.is_follower),
        reaction: reaction || null,
        originalIndex: idx,
        viewedAt: v?.timestamp || v?.viewed_at || Date.now()
      };
    }
  }

  // ==== [H] MAIN OBSERVER — first story, inject, pause only when dialog open ====
  const onDOMChange = (() => {
    let lastKey = null;
    return async () => {
      // gate: only on your own story (Seen by must eventually exist)
      const onStories = location.pathname.startsWith('/stories/');
      if (!onStories) {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
        resumeAnyPausedVideos();
        return;
      }

      window.dispatchEvent(new CustomEvent('storylister:show_panel'));
      // if injection fails because context reloaded, we still keep running
      if (!state.injected) {
        try {
          const s = document.createElement('script');
          // inline the payload to avoid getURL() errors on context reload
          s.textContent = `(${injectedFunction.toString()})();`;
          document.documentElement.appendChild(s);
          s.remove();
          state.injected = true;
        } catch {}
      }

      const key = getStorageKey();
      if (key !== lastKey) {
        // story changed
        if (state.stopPagination) state.stopPagination();
        lastKey = state.currentKey = key;
        autoOpenViewersOnceFor(key);
      }

      // pause only while viewers dialog is open
      pauseVideosWhileViewerOpen();
    };
  })();

  new MutationObserver(() => onDOMChange()).observe(document.documentElement || document.body, { childList: true, subtree: true });
  onDOMChange();

  // Initialize settings
  (async function init() {
    await Settings.load();
  })();
})();