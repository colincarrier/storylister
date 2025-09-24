(() => {
  'use strict';
  
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  // Normalizer function for viewer data
  function normalizeViewer(v, idx) {
    const u = v?.user || v?.node?.user || v?.node || v;

    // Accept only absolute http(s) profile pics
    let pic = u?.profile_pic_url || u?.profile_pic_url_hd || u?.profile_picture_url || '';
    if (typeof pic !== 'string' || !/^https?:\/\//i.test(pic)) pic = '';

    const reaction =
      v?.reaction?.emoji ||
      v?.story_reaction?.emoji ||
      v?.latest_reaction?.emoji ||
      (v?.has_liked ? '❤️' : null);

    return {
      id: String(u?.id || u?.pk || u?.username || idx),
      username: u?.username || '',
      full_name: u?.full_name || u?.fullname || '',
      profile_pic_url: pic,
      is_verified: !!(u?.is_verified || u?.verified || u?.blue_verified),
      followed_by_viewer: !!(u?.followed_by_viewer || u?.is_following),
      follows_viewer: !!(u?.follows_viewer || u?.is_follower),
      reaction: reaction || null,
      originalIndex: idx,
      viewedAt: v?.timestamp || v?.viewed_at || Date.now()
    };
  }

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);

    try {
      const url = String(args?.[0] || '');
      const ct = res.headers?.get('content-type') || '';
      if (!/json/i.test(ct)) return res; // ignore CSS/HTML/images

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

        if (!viewers || !viewers.length) return;

        // Media id: prefer payload, then URL id
        const pathId = location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1];
        const graphId = data.media_id || data?.data?.media?.id || data?.data?.reel?.id;
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

  console.log('[SL-INJECT] Intercepts installed with reaction support');
})();