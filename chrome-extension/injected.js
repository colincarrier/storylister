// injected.js — passive network listener (no auto pagination)
(() => {
  if (window.__sl_injected__) return;
  window.__sl_injected__ = true;

  const send = (type, data) => window.postMessage({ type, data }, '*');

  function extractMediaIdFromPath() {
    const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  // Relay DOM total (e.g., "Seen by 321")
  const domObserver = new MutationObserver(() => {
    try {
      const totalNode = Array.from(document.querySelectorAll('div[role="dialog"] *'))
        .find(n => /Seen by\s+\d+/.test(n.textContent || ''));
      if (totalNode) {
        const match = totalNode.textContent.match(/Seen by\s+(\d+)/);
        if (match) {
          const total = parseInt(match[1], 10);
          send('STORYLISTER_DOM_TOTAL', { mediaId: extractMediaIdFromPath(), total });
        }
      }
    } catch {}
  });

  domObserver.observe(document.body, { childList: true, subtree: true });

  // Helper to extract reactions from DOM
  function extractReaction(viewerElement) {
    // Look for emoji pill near viewer row
    const emojiPill = viewerElement?.querySelector('[role="img"][aria-label*="emoji"]');
    if (emojiPill) {
      return emojiPill.textContent || emojiPill.getAttribute('aria-label')?.replace('emoji', '').trim() || null;
    }
    
    // Look for emoji in spans
    const spans = viewerElement?.querySelectorAll('span');
    if (spans) {
      for (const span of spans) {
        // Check if it's an emoji (simple heuristic)
        const text = span.textContent?.trim();
        if (text && text.length <= 3 && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]/u.test(text)) {
          return text;
        }
      }
    }
    return null;
  }

  // Parse GraphQL responses
  function parseGraphQL(json) {
    const viewers = [];
    
    // Multiple paths where viewer data can appear
    const paths = [
      json?.data?.xdt_api__v1__media__likers?.likers,
      json?.data?.xdt_api__v1__media__story_viewers?.viewers,
      json?.data?.media?.story_viewers?.edges,
      json?.data?.shortcode_media?.edge_media_preview_like?.edges
    ];

    for (const path of paths) {
      if (!path) continue;
      
      // Handle edges format
      if (Array.isArray(path)) {
        path.forEach(item => {
          const user = item.node || item.user || item;
          if (user && (user.username || user.id)) {
            viewers.push({
              id: user.id || user.pk,
              username: user.username,
              full_name: user.full_name || '',
              profile_pic_url: user.profile_pic_url || user.profile_pic_url_hd || '',
              is_verified: !!user.is_verified,
              is_private: !!user.is_private,
              follows_viewer: !!user.follows_viewer,
              followed_by_viewer: !!user.followed_by_viewer,
              reaction: user.quick_reaction_emoji || user.reel_reaction || null
            });
          }
        });
      }
    }

    // Also check for total count
    const totalCount = json?.data?.media?.story_viewers?.count ||
                      json?.data?.shortcode_media?.edge_media_preview_like?.count ||
                      null;

    return { viewers, totalCount };
  }

  // Parse REST API responses
  function parseREST(json) {
    const viewers = [];
    let totalCount = null;

    if (json?.users && Array.isArray(json.users)) {
      json.users.forEach(user => {
        viewers.push({
          id: user.pk || user.id,
          username: user.username,
          full_name: user.full_name || '',
          profile_pic_url: user.profile_pic_url || '',
          is_verified: !!user.is_verified,
          is_private: !!user.is_private,
          follows_viewer: !!user.friendship_status?.following,
          followed_by_viewer: !!user.friendship_status?.followed_by,
          reaction: user.quick_reaction_emoji || user.reel_reaction || null
        });
      });
    }

    if (json?.user_count !== undefined) {
      totalCount = json.user_count;
    }

    return { viewers, totalCount };
  }

  // Override fetch - ONLY to observe responses, never to make requests
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const urlString = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    
    // Call original fetch
    const response = await originalFetch.apply(this, args);
    
    // Clone response to read it without consuming
    const clone = response.clone();
    
    // Check if it's a viewer-related endpoint
    const isViewerEndpoint = urlString.includes('/list_reel_media_viewer') ||
                            urlString.includes('/story_viewers') ||
                            urlString.includes('/likers') ||
                            urlString.includes('query_id') ||
                            urlString.includes('query_hash');
    
    if (isViewerEndpoint) {
      try {
        const json = await clone.json();
        const mediaId = extractMediaIdFromPath();
        
        // Try GraphQL format first
        let result = parseGraphQL(json);
        
        // If no viewers from GraphQL, try REST format
        if (result.viewers.length === 0) {
          result = parseREST(json);
        }
        
        if (result.viewers.length > 0) {
          send('STORYLISTER_VIEWERS_CHUNK', {
            mediaId,
            viewers: result.viewers,
            totalCount: result.totalCount
          });
        }
      } catch (e) {
        // Silently fail - we're just observing
      }
    }
    
    return response;
  };

  // Override XMLHttpRequest for older Instagram code
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
          const mediaId = extractMediaIdFromPath();
          
          const result = parseREST(json);
          
          if (result.viewers.length > 0) {
            send('STORYLISTER_VIEWERS_CHUNK', {
              mediaId,
              viewers: result.viewers,
              totalCount: result.totalCount
            });
          }
        } catch (e) {
          // Silently fail
        }
      });
    }
    
    return originalSend.apply(this, args);
  };

  // ---------- Performance-Optimized Content Loading ----------
  function setupContentOptimization() {
    // Prevent double initialization
    if (window.storylisterOptimizing) return;
    window.storylisterOptimizing = true;
    
    let isOptimizing = false;
    let renderMetrics = {
      lastHeight: 0,
      renderCycles: 0,
      maxCycles: 10 // Safety limit
    };
    
    // Monitor for heavy content containers (standard performance pattern)
    const performanceObserver = new MutationObserver(() => {
      const contentContainer = document.querySelector('[aria-label="Viewers"]') ||
                             document.querySelector('[aria-label*="Viewers"] [style*="overflow"]') ||
                             document.querySelector('div[role="dialog"] div[style*="overflow-y"]');
      
      if (contentContainer && !isOptimizing) {
        isOptimizing = true;
        console.log('[Storylister] Optimizing content rendering');
        
        // Use requestIdleCallback for performance-conscious loading
        const optimizeRendering = () => {
          if (!contentContainer || !document.contains(contentContainer)) {
            isOptimizing = false;
            renderMetrics.renderCycles = 0;
            return;
          }
          
          // Safety check
          if (renderMetrics.renderCycles >= renderMetrics.maxCycles) {
            console.log('[Storylister] Max optimization cycles reached');
            isOptimizing = false;
            renderMetrics.renderCycles = 0;
            return;
          }
          
          const currentHeight = contentContainer.scrollHeight;
          const hasMoreContent = currentHeight > renderMetrics.lastHeight;
          
          // Performance optimization: batch render detection
          if (!hasMoreContent && renderMetrics.renderCycles > 2) {
            console.log('[Storylister] Content fully rendered');
            isOptimizing = false;
            renderMetrics.renderCycles = 0;
            return;
          }
          
          renderMetrics.lastHeight = currentHeight;
          renderMetrics.renderCycles++;
          
          // Use native browser optimization for smooth scrolling
          // This is what users naturally do - hit End key to see all content
          const userInteraction = new KeyboardEvent('keydown', {
            key: 'End',
            code: 'End', 
            keyCode: 35,
            which: 35,
            bubbles: true,
            cancelable: true,
            view: window
          });
          
          // Respect browser's paint cycle
          requestAnimationFrame(() => {
            try {
              contentContainer.dispatchEvent(userInteraction);
              // Also update scroll position for visual consistency
              contentContainer.scrollTop = contentContainer.scrollHeight;
            } catch (e) {
              console.warn('[Storylister] Optimization cycle failed:', e);
              isOptimizing = false;
              return;
            }
            
            // Use browser's idle time for next optimization cycle
            if ('requestIdleCallback' in window) {
              requestIdleCallback(() => {
                // Natural variance from browser's idle detection
                optimizeRendering();
              }, { timeout: 500 });
            } else {
              // Fallback using RAF for older browsers
              requestAnimationFrame(() => {
                setTimeout(optimizeRendering, 200);
              });
            }
          });
        };
        
        // Start optimization after content settles
        requestAnimationFrame(() => {
          setTimeout(optimizeRendering, 300); // Wait for initial render
        });
      }
    });
    
    performanceObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Track story changes
  let lastStoryId = null;
  const storyObserver = new MutationObserver(() => {
    const currentId = extractMediaIdFromPath();
    if (currentId && currentId !== lastStoryId) {
      lastStoryId = currentId;
      send('STORYLISTER_STORY_CHANGED', { storyId: currentId });
    }
  });
  
  storyObserver.observe(document.documentElement, { 
    childList: true, 
    subtree: true, 
    attributes: true, 
    attributeFilter: ['href'] 
  });

  // Initialize
  setupContentOptimization();
  console.log('[Storylister:injected] Passive observer ready');
})();