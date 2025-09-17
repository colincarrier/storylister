// Storylister Network Interceptor - Purely Observational
// This script intercepts Instagram's own network responses but NEVER makes its own requests

(function() {
  console.log('Storylister: Network interceptor loaded (passive mode)');
  
  // Store original functions
  const originalFetch = window.fetch;
  const originalXHR = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  let currentMediaId = null;
  
  // Extract story ID from URL
  function extractMediaId() {
    const match = window.location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }
  
  // Override fetch - ONLY to observe responses, never to make requests
  window.fetch = async function(...args) {
    const urlString = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    
    // Call original fetch - we ONLY observe Instagram's own requests
    const response = await originalFetch.apply(this, args);
    
    // Check if this is a viewer request from Instagram
    if (urlString.includes('/api/graphql') || urlString.includes('/list_reel_media_viewer')) {
      // Clone response to read it
      const clonedResponse = response.clone();
      
      try {
        const data = await clonedResponse.json();
        
        // Check for GraphQL viewer data
        if (data.data && (data.data.xdt_api__v1__media__likers || 
            data.data.xdt_api__v1__media__story_viewers ||
            data.data.viewer)) {
          console.log('Storylister: Observed GraphQL viewer data from Instagram');
          processViewerData(data, 'graphql');
        }
        
        // Check for REST API viewer data
        if (data.users && Array.isArray(data.users)) {
          console.log('Storylister: Observed REST API viewer data from Instagram');
          processViewerData(data, 'rest');
          // NOTE: We do NOT auto-paginate. We only show what Instagram loads.
        }
      } catch (e) {
        // Not JSON or parsing error, ignore
      }
    }
    
    return response;
  };
  
  // Intercept XMLHttpRequest - ONLY to observe, never to make requests
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._storylisterUrl = url;
    this._storylisterMethod = method;
    return originalXHR.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const url = xhr._storylisterUrl;
    
    // Add response listener
    xhr.addEventListener('load', function() {
      if (url && (url.includes('/api/graphql') || url.includes('/list_reel_media_viewer'))) {
        try {
          const data = JSON.parse(xhr.responseText);
          
          // Process viewer data
          if (data.users && Array.isArray(data.users)) {
            console.log('Storylister: Observed XHR viewer data from Instagram');
            processViewerData(data, 'rest');
            // NOTE: We do NOT auto-paginate. We only show what Instagram loads.
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
    
    return originalXHRSend.apply(this, [body]);
  };
  
  // Process viewer data and send to content script
  function processViewerData(data, type) {
    let viewers = [];
    let pageInfo = {};
    const mediaId = currentMediaId || extractMediaId();
    
    if (type === 'graphql') {
      // Extract from GraphQL response
      const viewerData = data.data?.xdt_api__v1__media__story_viewers || 
                        data.data?.xdt_api__v1__media__likers ||
                        data.data?.viewer;
      
      if (viewerData && viewerData.edges) {
        viewers = viewerData.edges.map(edge => ({
          username: edge.node.username,
          full_name: edge.node.full_name,
          profile_pic_url: edge.node.profile_pic_url,
          is_verified: edge.node.is_verified || false,
          is_private: edge.node.is_private || false,
          id: edge.node.id,
          follows_viewer: edge.node.follows_viewer || false,
          followed_by_viewer: edge.node.followed_by_viewer || false,
          // Look for reactions in the node
          reaction: edge.node.quick_reaction_emoji || edge.node.reaction_type || null
        }));
        
        pageInfo = viewerData.page_info || {};
      }
    } else if (type === 'rest') {
      // Extract from REST API response
      viewers = data.users.map(user => ({
        username: user.username,
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url,
        is_verified: user.is_verified || false,
        is_private: user.is_private || false,
        id: user.pk || user.id,
        follows_viewer: user.friendship_status?.following || false,
        followed_by_viewer: user.friendship_status?.followed_by || false,
        // Look for reactions in the user object
        reaction: user.reel_reaction?.emoji || user.reaction || null
      }));
      
      pageInfo = {
        has_next_page: !!data.next_max_id,
        end_cursor: data.next_max_id
      };
    }
    
    // Send to content script
    if (viewers.length > 0) {
      window.postMessage({
        type: 'STORYLISTER_VIEWERS_CHUNK',
        data: {
          mediaId: mediaId,
          viewers: viewers,
          pageInfo: pageInfo,
          totalCount: data.total_viewer_count || data.viewer_count || null,
          timestamp: Date.now()
        }
      }, '*');
      
      console.log(`Storylister: Observed ${viewers.length} viewers for story ${mediaId}`);
    }
  }
  
  // Update media ID when URL changes
  setInterval(() => {
    const newMediaId = extractMediaId();
    if (newMediaId !== currentMediaId) {
      currentMediaId = newMediaId;
      console.log(`Storylister: Story changed to ${currentMediaId}`);
      
      // Notify content script of story change
      window.postMessage({
        type: 'STORYLISTER_STORY_CHANGED',
        data: {
          mediaId: currentMediaId,
          timestamp: Date.now()
        }
      }, '*');
    }
  }, 1000);
})();