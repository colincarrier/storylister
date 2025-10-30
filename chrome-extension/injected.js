(() => {
  'use strict';
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  // Enhanced reaction extraction (v16.2-RC)
  function extractReactionFromViewer(v){
    // Consolidate different fields IG may use for story reactions.
    const likeHeart =
      v?.has_liked || v?.has_liked_reel || v?.viewer_has_liked ? "❤️" : null;
    const emoji =
      v?.emoji ||
      v?.emoji_reaction ||
      (v?.reaction && (v?.reaction.emoji || v?.reaction.text)) ||
      v?.reaction_info?.emoji ||
      (Array.isArray(v?.latest_reactions) && v?.latest_reactions[0] && (v?.latest_reactions[0].emoji || v?.latest_reactions[0].text)) ||
      v?.latest_reaction?.reaction_emoji ||  // v16.1 field
      v?.latest_reaction?.emoji ||            // v16.1 field
      v?.reaction?.emoji ||                   // v16.1 field
      v?.story_reaction?.emoji ||             // v16.1 field
      likeHeart;
    return {
      reacted: !!emoji,
      reactionEmoji: typeof emoji === 'string' ? emoji : null,
      reaction: typeof emoji === 'string' ? emoji : null  // Keep backward compat
    };
  }

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

      ...extractReactionFromViewer(v),  // Add all reaction fields
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
        
        // Extract owner username
        const owner = 
          data?.owner?.username || 
          data?.reel_owner?.username || 
          data?.user?.username ||
          location.pathname.match(/\/stories\/([^/]+)/)?.[1] || 
          null;

        const normalized = viewers.map(normalizeViewer);
        const totalCount = data.user_count || data.total_viewer_count || data.count || normalized.length;

        window.postMessage({
          source: 'STORYLISTER',
          type: 'STORYLISTER_VIEWERS_CHUNK',
          data: {
            mediaId,
            ownerUsername: owner,
            viewers: normalized,
            totalCount,
            debug: {
              url: url,
              rawCount: Array.isArray(viewers) ? viewers.length : 0,
              normalizedCount: normalized.length,
              totalReported: totalCount,
              timestamp: Date.now()
            }
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
            
            // Extract owner username
            const owner = 
              data?.owner?.username || 
              data?.reel_owner?.username || 
              data?.user?.username ||
              location.pathname.match(/\/stories\/([^/]+)/)?.[1] || 
              null;

            const normalized = users.map(normalizeViewer);
            const totalCount = data.user_count || data.total_viewer_count || data.count || normalized.length;

            window.postMessage({
              source: 'STORYLISTER',
              type: 'STORYLISTER_VIEWERS_CHUNK',
              data: { 
                mediaId, 
                ownerUsername: owner,
                viewers: normalized, 
                totalCount,
                debug: {
                  url: url,
                  rawCount: Array.isArray(users) ? users.length : 0,
                  normalizedCount: normalized.length,
                  totalReported: totalCount,
                  timestamp: Date.now()
                }
              }
            }, '*');
          } catch {}
        });
      }
      return _send.apply(this, args);
    };
  }
  // Signal READY so content.js knows the interceptor is active.
  window.postMessage({ source: "STORYLISTER", type: "STORYLISTER_READY" }, "*");
  
  // Also dispatch custom event for backward compat with content-backend.js
  try { document.dispatchEvent(new CustomEvent('storylister:injected_ready')); } catch {}
})();