(() => {
  'use strict';
  
  console.log('[SL-INJECT] Script running in page context');
  
  // Global state for tracking
  window.__SL_STATE = window.__SL_STATE || {
    intercepted: new Map(),
    listeners: []
  };

  // Intercept fetch responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0]?.url || args[0];
    
    if (typeof url === 'string' && url.includes('/seen_by/')) {
      // Clone response for processing
      const clone = response.clone();
      try {
        const data = await clone.json();
        console.log('[SL-INJECT] Intercepted seen_by response:', data);
        
        // Extract viewer data with reactions
        if (data?.data?.story_viewers?.edges) {
          const viewers = data.data.story_viewers.edges.map(edge => ({
            id: edge.node?.id,
            username: edge.node?.username,
            full_name: edge.node?.full_name,
            profile_pic_url: edge.node?.profile_pic_url,
            reaction: edge.reaction_sticker?.emoji || null,
            is_verified: edge.node?.is_verified || false
          })).filter(v => v.id && v.username);
          
          // Get media ID from URL
          const urlObj = new URL(url, window.location.origin);
          const mediaId = urlObj.pathname.match(/\/(\d+)\/seen_by/)?.[1];
          
          // Dispatch to content script
          window.postMessage({
            type: 'sl_viewer_chunk',
            viewers,
            hasNext: data.data.story_viewers?.page_info?.has_next_page || false,
            mediaId: mediaId || null,
            timestamp: Date.now()
          }, '*');
        }
      } catch (e) {
        console.error('[SL-INJECT] Error processing seen_by:', e);
      }
    }
    
    return response;
  };
  
  // Also intercept XMLHttpRequest for older API calls
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  
  XHR.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };
  
  XHR.send = function() {
    if (this._url && this._url.includes('/seen_by/')) {
      const originalLoad = this.onload;
      this.onload = function() {
        try {
          const data = JSON.parse(this.responseText);
          if (data?.data?.story_viewers?.edges) {
            const viewers = data.data.story_viewers.edges.map(edge => ({
              id: edge.node?.id,
              username: edge.node?.username,
              full_name: edge.node?.full_name,
              profile_pic_url: edge.node?.profile_pic_url,
              reaction: edge.reaction_sticker?.emoji || null,
              is_verified: edge.node?.is_verified || false
            })).filter(v => v.id && v.username);
            
            const mediaId = this._url.match(/\/(\d+)\/seen_by/)?.[1];
            
            window.postMessage({
              type: 'sl_viewer_chunk',
              viewers,
              hasNext: data.data.story_viewers?.page_info?.has_next_page || false,
              mediaId: mediaId || null,
              timestamp: Date.now()
            }, '*');
          }
        } catch (e) {
          console.error('[SL-INJECT] XHR parse error:', e);
        }
        
        if (originalLoad) originalLoad.apply(this, arguments);
      };
    }
    return originalSend.apply(this, arguments);
  };
  
  console.log('[SL-INJECT] Fetch and XHR interceptors installed');
})();