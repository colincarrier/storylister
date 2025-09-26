(() => {
  'use strict';
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  // B - Unified normalize function with correct fields
  function normalizeViewer(v, idx) {
    const u = v?.user || v?.node?.user || v?.node || v;

    // Profile pic: allow http(s) only
    let pic = u?.profile_pic_url || u?.profile_pic_url_hd || u?.profile_picture_url || '';
    if (typeof pic !== 'string' || !/^https?:\/\//i.test(pic)) pic = '';

    // Follow flags (IG semantics)
    const fs = v?.friendship_status || u?.friendship_status || {};
    const youFollow  = !!(fs.following ?? u?.is_following ?? v?.is_following); // YOU -> THEM
    const isFollower = !!(fs.followed_by ?? u?.is_follower  ?? v?.is_follower); // THEM -> YOU

    // Reactions on web: heart/like; newer shapes also carry latest_reaction.reaction_emoji
    const reaction =
      v?.latest_reaction?.reaction_emoji ||
      v?.latest_reaction?.emoji ||
      v?.reaction?.emoji ||
      v?.story_reaction?.emoji ||
      (v?.has_liked ? '❤️' : null);

    return {
      id: String(u?.id || u?.pk || u?.pk_id || u?.username || idx),
      username: u?.username || '',
      full_name: u?.full_name || u?.fullname || u?.name || '',
      profile_pic_url: pic,
      is_verified: !!(u?.is_verified || u?.verified || u?.blue_verified),

      // Keep both our UI-friendly flags and IG-like names for compatibility
      youFollow,                   // you follow them
      isFollower,                  // they follow you
      followed_by_viewer: youFollow,
      follows_viewer: isFollower,

      reaction: reaction || null,
      originalIndex: idx,
      viewedAt: v?.timestamp || v?.viewed_at || Date.now()
    };
  }

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    try {
      const ct = res.headers?.get('content-type') || '';
      if (!/json/i.test(ct)) return res;

      const url = String(args?.[0] || '');
      const relevant = url.includes('/api/') || url.includes('/graphql') || /viewer|viewers|story|reel|seen/i.test(url);
      if (!relevant) return res;

      res.clone().json().then(data => {
        if (!data) return;

        let viewers = null;
        if (Array.isArray(data.users)) viewers = data.users;
        else if (Array.isArray(data.viewers)) viewers = data.viewers;
        else if (data?.data?.xdt_api__v1__media__story_viewers?.viewers) viewers = data.data.xdt_api__v1__media__story_viewers.viewers;
        else if (data?.data?.media?.story_viewers?.edges) viewers = data.data.media.story_viewers.edges.map(e => e.node || e.user || e);
        else if (data?.data?.xdt_api__v1__stories__viewers__connection__edge?.edges) viewers = data.data.xdt_api__v1__stories__viewers__connection__edge.edges.map(e => e.node || e);

        if (!viewers || viewers.length === 0) return;

        const pathId = location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1];
        const graphId = data?.media_id || data?.data?.media?.id || data?.data?.reel?.id;
        const mediaId = String(graphId || pathId || Date.now());

        const normalized = viewers.map(normalizeViewer);

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

  // XHR backup (optional)
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

            const normalized = users.map(normalizeViewer);

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
  // Dispatch ready signal so backend knows injection is complete
  try { document.dispatchEvent(new CustomEvent('storylister:injected_ready')); } catch {}
})();