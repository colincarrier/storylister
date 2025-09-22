(() => {
  'use strict';
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  const origFetch = window.fetch;

  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);

    // Only try to parse JSON responses
    const ct = res.headers?.get('content-type') || '';
    if (!/json/i.test(ct)) return res;

    try {
      const url = String(args?.[0] || '');
      const relevant =
        url.includes('/api/') ||
        url.includes('/api/v1/') ||
        url.includes('/graphql') ||
        url.includes('xdt_api') ||
        /viewer|viewers|story|reel|seen|story_viewers/i.test(url);

      if (!relevant) return res;

      const clone = res.clone();
      clone.json().then(data => {
        if (!data) return;

        // Normalize potential shapes -> viewers[]
        let viewers = null;

        if (Array.isArray(data.users)) {
          viewers = data.users;
        } else if (data?.viewers && Array.isArray(data.viewers)) {
          viewers = data.viewers;
        } else if (data?.data?.xdt_api__v1__media__story_viewers?.viewers) {
          viewers = data.data.xdt_api__v1__media__story_viewers.viewers;
        } else if (data?.data?.media?.story_viewers?.edges) {
          viewers = data.data.media.story_viewers.edges.map(e => e.node || e.user || e);
        } else if (data?.data?.xdt_api__v1__stories__viewers__connection__edge?.edges) {
          viewers = data.data.xdt_api__v1__stories__viewers__connection__edge.edges.map(e => e.node || e);
        }

        if (!viewers || viewers.length === 0) return;

        // Media id from URL or payload
        const pathId = (location.pathname.match(/\/stories\/[^/]+\/(\d+)/) || [])[1];
        const mediaId = String(
          data.media_id || data.reel?.id || pathId || 'unknown'
        );

        const formatted = viewers.map((v, idx) => normalizeViewer(v, idx));

        window.postMessage({
          type: 'STORYLISTER_VIEWERS_CHUNK',
          data: {
            mediaId,
            viewers: formatted,
            totalCount: data.user_count || data.total_viewer_count || viewers.length
          }
        }, '*');
        
      }).catch(() => {
        // Silent fail - don't break Instagram
      });
      
    } catch(e) {
      // Silent fail - never interfere with Instagram
    }
    
    return res;
  };

  // Override XMLHttpRequest for older Instagram code (backup)
  const originalXHR = window.XMLHttpRequest;
  const XHRProto = originalXHR.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function(method, url, ...rest) {
    this._storylisterUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XHRProto.send = function(...args) {
    const url = this._storylisterUrl || '';
    
    if (url.includes('/list_reel_media_viewer') || 
        url.includes('/story_viewers') ||
        url.includes('/likers') ||
        url.includes('/api/v1/')) {
      
      this.addEventListener('load', function() {
        try {
          const json = JSON.parse(this.responseText);
          
          let viewers = null;
          if (Array.isArray(json.users)) {
            viewers = json.users;
          } else if (json?.viewers && Array.isArray(json.viewers)) {
            viewers = json.viewers;
          }
          
          if (!viewers || viewers.length === 0) return;
          
          const urlMatch = document.location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
          const mediaId = json.media_id || (urlMatch ? urlMatch[1] : null);
          
          if (!mediaId) return;
          
          const formatted = viewers.map((u, idx) => {
            // Handle friendship_status for XHR responses
            if (u.friendship_status) {
              u.followed_by_viewer = u.friendship_status.followed_by;
              u.follows_viewer = u.friendship_status.following;
            }
            return normalizeViewer(u, idx);
          });
          
          if (formatted.length > 0) {
            window.postMessage({
              type: 'STORYLISTER_VIEWERS_CHUNK',
              data: {
                mediaId: String(mediaId),
                viewers: formatted,
                totalCount: json.user_count || viewers.length
              }
            }, '*');
          }
        } catch (e) {
          // Silently fail
        }
      });
    }
    
    return originalSend.apply(this, args);
  };

  // Normalize viewer data from various Instagram API shapes
  function normalizeViewer(v, idx) {
    const u = v?.user || v?.node?.user || v?.node || v; // unify shapes from GraphQL/REST
    
    return {
      id: String(u.id || u.pk || u.pk_id || u.username || idx),
      username: u.username || '',
      full_name: u.full_name || u.fullname || u.name || '',
      profile_pic_url: u.profile_pic_url || u.profile_pic_url_hd || '',
      is_verified: !!(u.is_verified || u.blue_verified || u.is_verified_badge),
      followed_by_viewer: !!(u.followed_by_viewer || u.is_following),
      follows_viewer: !!(u.follows_viewer || u.is_follower),
      originalIndex: idx,
      viewedAt: u.timestamp || u.viewed_at || Date.now()
    };
  }
})();