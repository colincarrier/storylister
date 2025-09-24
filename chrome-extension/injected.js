(function () {
  'use strict';
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const ct = res.headers?.get('content-type') || '';
      if (!/json/i.test(ct)) return res;

      const url = String(args?.[0] || '');
      const relevant = /\/api\/|\/graphql|xdt_api|viewer|viewers|story|reel|seen/i.test(url);
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

        // Prefer payload ids; fallback to path id
        const pathId = location.pathname.match(/\/stories\/[^/]+\/(\d+)/)?.[1];
        const graphId = data.media_id || data?.data?.media?.id || data?.data?.reel?.id;
        const mediaId = String(graphId || pathId || Date.now());

        const normalized = viewers.map((v, idx) => {
          const u = v?.user || v?.node?.user || v?.node || v;
          let pic = u?.profile_pic_url || u?.profile_pic_url_hd || u?.profile_picture_url || '';
          if (!/^https?:\/\//i.test(pic || '')) pic = '';

          const reaction =
            v?.reaction?.emoji ||
            v?.story_reaction?.emoji ||
            v?.latest_reaction?.emoji ||
            (v?.has_liked ? '❤️' : null);

          return {
            id: String(u?.id || u?.pk || u?.username || idx),
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
        });

        window.postMessage({
          type: 'STORYLISTER_VIEWERS_CHUNK',
          data: { mediaId, viewers: normalized, totalCount: data.user_count || normalized.length }
        }, '*');
      }).catch(() => {});
    } catch {}
    return res;
  };

  // XHR back‑up identical logic omitted for brevity…
})();