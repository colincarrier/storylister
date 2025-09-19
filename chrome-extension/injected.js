(() => {
  'use strict';
  if (window.__storylisterInjected__) return;
  window.__storylisterInjected__ = true;

  const origFetch = window.fetch;

  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);

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

        const formatted = viewers.map((v, idx) => ({
          id: String(v.id || v.pk || idx),
          username: v.username || '',
          full_name: v.full_name || '',
          profile_pic_url: v.profile_pic_url || '',
          is_verified: !!v.is_verified,
          followed_by_viewer: !!v.followed_by_viewer,
          follows_viewer: !!v.follows_viewer,
          originalIndex: idx,
          viewedAt: v.timestamp || v.viewed_at || Date.now()
        }));

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
          
          const formatted = viewers.map((u, idx) => ({
            id: String(u.id || u.pk || idx),
            username: u.username || '',
            full_name: u.full_name || '',
            profile_pic_url: u.profile_pic_url || '',
            is_verified: !!u.is_verified,
            followed_by_viewer: !!u.friendship_status?.followed_by,
            follows_viewer: !!u.friendship_status?.following,
            originalIndex: idx,
            viewedAt: u.timestamp || u.viewed_at || Date.now()
          }));
          
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

  // Find the scrollable container inside the "Viewers" dialog
  function findScrollableInViewersDialog() {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;

    // Most reliable: inline overflow-y styles
    const styled = dlg.querySelector('[style*="overflow-y"]') ||
                   dlg.querySelector('[style*="overflow: hidden auto"]');
    if (styled) return styled;

    // Fallback: largest scrollable DIV
    return Array.from(dlg.querySelectorAll('div'))
      .find(el => el.scrollHeight > el.clientHeight + 40) || dlg;
  }

  // Very fast pagination using End key
  function pageAllViewers() {
    const pane = findScrollableInViewersDialog();
    if (!pane) return;

    let lastH = 0, stableCount = 0, running = true;
    const maxTime = 8000; // 8 seconds max
    const startTime = Date.now();
    
    const tick = () => {
      if (!running || !document.contains(pane)) return;
      if (Date.now() - startTime > maxTime) return;

      // focus + End key (mirrors user behavior)
      pane.focus();
      const endKey = new KeyboardEvent('keydown', { 
        key: 'End', 
        code: 'End', 
        keyCode: 35, 
        which: 35, 
        bubbles: true
      });
      pane.dispatchEvent(endKey);
      pane.scrollTop = pane.scrollHeight;

      const h = pane.scrollHeight;
      if (h === lastH) {
        stableCount++;
        if (stableCount >= 3) { 
          running = false; 
          return; 
        }
      } else {
        stableCount = 0; 
        lastH = h;
      }
      setTimeout(tick, 120);
    };
    setTimeout(tick, 300);
  }

  // Start paging the moment the "Viewers" dialog appears
  const dlgObserver = new MutationObserver(() => {
    const title = document.querySelector('[role="dialog"] h2');
    if (title && title.textContent?.trim() === 'Viewers') {
      pageAllViewers();
    }
  });
  dlgObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();