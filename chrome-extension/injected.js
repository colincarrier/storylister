// Injected script to intercept Instagram's API calls for viewer data
(function() {
  console.log('Storylister: Network interceptor injected');
  
  // Store original fetch and XMLHttpRequest
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest.prototype.open;
  const originalXHRSend = window.XMLHttpRequest.prototype.send;
  
  // Track active media ID
  let currentMediaId = null;
  let paginationInProgress = false;
  
  // Extract media ID from URL
  function extractMediaId() {
    const match = window.location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }
  
  // Intercept fetch requests
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlString = typeof url === 'string' ? url : url.toString();
    
    // Call original fetch
    const response = await originalFetch.apply(this, args);
    
    // Check if this is a viewer request
    if (urlString.includes('/api/graphql') || urlString.includes('/list_reel_media_viewer')) {
      // Clone response to read it
      const clonedResponse = response.clone();
      
      try {
        const data = await clonedResponse.json();
        
        // Check for GraphQL viewer data
        if (data.data && (data.data.xdt_api__v1__media__likers || 
            data.data.xdt_api__v1__media__story_viewers ||
            data.data.viewer)) {
          console.log('Storylister: Intercepted GraphQL viewer data');
          processViewerData(data, 'graphql');
        }
        
        // Check for REST API viewer data
        if (data.users && Array.isArray(data.users)) {
          console.log('Storylister: Intercepted REST API viewer data');
          processViewerData(data, 'rest');
          
          // Auto-paginate if there's more data
          if (data.next_max_id && !paginationInProgress) {
            autoPaginate(urlString, data.next_max_id, options);
          }
        }
      } catch (e) {
        // Not JSON or parsing error, ignore
      }
    }
    
    return response;
  };
  
  // Intercept XMLHttpRequest
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
            console.log('Storylister: Intercepted XHR viewer data');
            processViewerData(data, 'rest');
            
            // Auto-paginate
            if (data.next_max_id && !paginationInProgress) {
              autoPaginate(url, data.next_max_id, { method: xhr._storylisterMethod });
            }
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
    
    if (type === 'graphql') {
      // Extract from GraphQL response
      const viewerData = data.data.xdt_api__v1__media__story_viewers || 
                        data.data.xdt_api__v1__media__likers ||
                        data.data.viewer;
      
      if (viewerData && viewerData.edges) {
        viewers = viewerData.edges.map(edge => ({
          username: edge.node.username,
          full_name: edge.node.full_name,
          profile_pic_url: edge.node.profile_pic_url,
          is_verified: edge.node.is_verified || false,
          is_private: edge.node.is_private || false,
          id: edge.node.id,
          follows_viewer: edge.node.follows_viewer || false,
          followed_by_viewer: edge.node.followed_by_viewer || false
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
        followed_by_viewer: user.friendship_status?.followed_by || false
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
          mediaId: currentMediaId || extractMediaId(),
          viewers: viewers,
          pageInfo: pageInfo,
          totalCount: data.total_viewer_count || data.viewer_count || null
        }
      }, '*');
      
      console.log(`Storylister: Sent ${viewers.length} viewers to content script`);
    }
  }
  
  // Auto-paginate to get all viewers
  async function autoPaginate(baseUrl, cursor, options = {}) {
    if (paginationInProgress) return;
    paginationInProgress = true;
    
    console.log('Storylister: Starting auto-pagination...');
    let nextCursor = cursor;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (nextCursor && attempts < maxAttempts) {
      attempts++;
      
      // Build pagination URL
      let paginatedUrl = baseUrl;
      if (baseUrl.includes('?')) {
        paginatedUrl += `&max_id=${nextCursor}`;
      } else {
        paginatedUrl += `?max_id=${nextCursor}`;
      }
      
      console.log(`Storylister: Fetching page ${attempts} with cursor ${nextCursor}`);
      
      try {
        // Wait a bit to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch next page
        const response = await originalFetch(paginatedUrl, {
          ...options,
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers
          }
        });
        
        const data = await response.json();
        
        if (data.users && data.users.length > 0) {
          processViewerData(data, 'rest');
          nextCursor = data.next_max_id;
        } else {
          break;
        }
      } catch (e) {
        console.error('Storylister: Pagination error', e);
        break;
      }
    }
    
    console.log(`Storylister: Pagination complete after ${attempts} pages`);
    paginationInProgress = false;
  }
  
  // Update media ID when URL changes
  setInterval(() => {
    const newMediaId = extractMediaId();
    if (newMediaId !== currentMediaId) {
      currentMediaId = newMediaId;
      paginationInProgress = false;
    }
  }, 1000);
})();