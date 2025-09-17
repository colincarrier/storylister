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

  // --------- Fast pagination by "End" key ---------
  const scrollerInDialog = () => {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dlg) return null;
    // Find the scrollable child if there is one
    const scrollable = dlg.querySelector('[style*="overflow-y"]') || 
                       dlg.querySelector('[style*="overflow: auto"]') ||
                       dlg.querySelector('div > div > div');
    return scrollable || dlg;
  };

  let paginating = false;
  function fastPaginate() {
    const el = scrollerInDialog();
    if (!el) { 
      console.log('[Storylister Injected] No scrollable element found');
      paginating = false; 
      return; 
    }

    let lastH = -1;
    let stable = 0;
    let attempts = 0;

    const tick = () => {
      if (!document.contains(el)) { 
        console.log('[Storylister Injected] Element removed from DOM');
        paginating = false; 
        return; 
      }

      const h = el.scrollHeight;
      stable = (h === lastH) ? (stable + 1) : 0;
      lastH = h;
      attempts++;

      // End key + explicit bottom scroll (what a user would do)
      const ev = new KeyboardEvent('keydown', { 
        key: 'End', 
        code: 'End', 
        keyCode: 35, 
        which: 35, 
        bubbles: true, 
        cancelable: true 
      });
      el.dispatchEvent(ev);
      el.scrollTop = el.scrollHeight;

      // Stop if stable for 3 ticks or after 100 attempts (safety)
      if (stable >= 3 || attempts > 100) { 
        console.log(`[Storylister Injected] Pagination complete. Height: ${h}, Attempts: ${attempts}`);
        paginating = false; 
        return; 
      }
      
      setTimeout(tick, 150);
    };

    if (!paginating) { 
      console.log('[Storylister Injected] Starting fast pagination');
      paginating = true; 
      tick(); 
    }
  }

  // Watch for dialog appearance
  const mo = new MutationObserver(() => {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (dlg && !paginating) {
      // Check if it's the viewers dialog
      const hasViewers = dlg.querySelector('[aria-label*="Viewers"]') || 
                        dlg.querySelector('[aria-label*="viewers"]') ||
                        dlg.textContent?.includes('Viewers');
      if (hasViewers) {
        console.log('[Storylister Injected] Viewers dialog detected, starting pagination');
        setTimeout(fastPaginate, 300);
      }
    }
  });
  
  mo.observe(document.documentElement, { childList: true, subtree: true });

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