// injected.js
(() => {
  'use strict';

  // --------- Intercept fetch to capture viewers ---------
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);

    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url || '';
      const clone = res.clone();

      // Check if it's a viewer-related endpoint
      const isViewerEndpoint = url.includes('/list_reel_media_viewer') ||
                              url.includes('/story_viewers') ||
                              url.includes('/likers') ||
                              url.includes('query_id') ||
                              url.includes('query_hash') ||
                              /viewers?|reel|story/i.test(url);

      if (isViewerEndpoint) {
        clone.json().then(json => {
          if (!json) return;
          
          // Extract users from various response formats
          let users = null;
          if (Array.isArray(json.users)) {
            users = json.users;
          } else if (json?.data?.xdt_api__v1__media__story_viewers?.viewers) {
            users = json.data.xdt_api__v1__media__story_viewers.viewers;
          } else if (json?.data?.media?.story_viewers?.edges) {
            users = json.data.media.story_viewers.edges.map(e => e.node || e.user || e);
          }
          
          if (!users || users.length === 0) return;

          // Try to derive a story/media id from response or URL
          const urlMatch = document.location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
          const mediaId =
            json.media_id ||
            json.reel?.id ||
            new URL(url, location.href).searchParams.get('story_media_id') ||
            (urlMatch ? urlMatch[1] : null);

          if (!mediaId) {
            console.log('[Storylister Injected] No media ID found in response');
            return;
          }

          const viewers = users.map((u, idx) => ({
            id: String(u.id || u.pk || idx),
            username: u.username,
            full_name: u.full_name || '',
            profile_pic_url: u.profile_pic_url || '',
            is_verified: !!u.is_verified,
            followed_by_viewer: !!u.followed_by_viewer || !!u.friendship_status?.followed_by,
            follows_viewer: !!u.follows_viewer || !!u.friendship_status?.following,
            // Keep IG's original order and when we captured it
            originalIndex: idx,
            capturedAt: u.timestamp || u.viewed_at || Date.now(),  // Use Instagram's timestamp if available
            viewedAt: u.timestamp || u.viewed_at || null  // Preserve actual view time
          }));

          console.log(`[Storylister Injected] Captured ${viewers.length} viewers for story ${mediaId}`);

          window.postMessage({
            type: 'STORYLISTER_VIEWERS_CHUNK',
            data: {
              mediaId: String(mediaId),
              viewers,
              totalCount: json.user_count || json.total_viewer_count || json?.data?.media?.story_viewers?.count || users.length
            }
          }, '*');
        }).catch((e) => {
          console.error('[Storylister Injected] Failed to parse response:', e);
        });
      }
    } catch (e) {
      console.error('[Storylister Injected] Error intercepting fetch:', e);
    }
    return res;
  };

  // --------- Find the scrollable container inside the "Viewers" dialog ---------
  function findScrollableInViewersDialog() {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;

    // Most reliable: inline overflow-y styles
    const styled = dlg.querySelector('[style*="overflow-y: auto"],[style*="overflow-y: scroll"]');
    if (styled) return styled;

    // Fallback: largest scrollable DIV
    const divs = Array.from(dlg.querySelectorAll('div'));
    let best = null, bestDelta = 0;
    for (const d of divs) {
      const delta = (d.scrollHeight || 0) - (d.clientHeight || 0);
      if (delta > bestDelta) { bestDelta = delta; best = d; }
    }
    return best || dlg;
  }

  // --------- Very fast pagination using End key ---------
  function pageAllViewers() {
    const pane = findScrollableInViewersDialog();
    if (!pane) {
      console.log('[Storylister Injected] No scrollable element found');
      return;
    }

    let lastH = 0, stableCount = 0, running = true;
    const tick = () => {
      if (!running || !document.contains(pane)) {
        console.log('[Storylister Injected] Pagination stopped');
        return;
      }

      // focus + End key (mirrors user behavior)
      pane.focus();
      const endKey = new KeyboardEvent('keydown', { 
        key: 'End', 
        code: 'End', 
        keyCode: 35, 
        which: 35, 
        bubbles: true, 
        cancelable: true 
      });
      pane.dispatchEvent(endKey);
      pane.scrollTop = pane.scrollHeight;

      const h = pane.scrollHeight;
      if (h === lastH) {
        stableCount++;
        if (stableCount >= 3) { 
          console.log(`[Storylister Injected] Pagination complete. Height: ${h}`);
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
      console.log('[Storylister Injected] Viewers dialog detected, starting pagination');
      pageAllViewers();
    }
  });
  dlgObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

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
        url.includes('/likers')) {
      
      this.addEventListener('load', function() {
        try {
          const json = JSON.parse(this.responseText);
          const urlMatch = document.location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
          const mediaId = json.media_id || (urlMatch ? urlMatch[1] : null);
          
          if (!mediaId) return;
          
          const users = json.users || [];
          const viewers = users.map((u, idx) => ({
            id: String(u.id || u.pk || idx),
            username: u.username,
            full_name: u.full_name || '',
            profile_pic_url: u.profile_pic_url || '',
            is_verified: !!u.is_verified,
            followed_by_viewer: !!u.friendship_status?.followed_by,
            follows_viewer: !!u.friendship_status?.following,
            originalIndex: idx,
            capturedAt: u.timestamp || u.viewed_at || Date.now(),  // Use Instagram's timestamp if available
            viewedAt: u.timestamp || u.viewed_at || null  // Preserve actual view time
          }));
          
          if (viewers.length > 0) {
            window.postMessage({
              type: 'STORYLISTER_VIEWERS_CHUNK',
              data: {
                mediaId: String(mediaId),
                viewers,
                totalCount: json.user_count || users.length
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

  console.log('[Storylister Injected] Script loaded and watching for viewer dialogs');
})();