// injected.js (fixed)
// Runs in the page context. Intercepts fetch/XMLHttpRequest and relays story viewers to the content script.
// IMPORTANT: We DO NOT modify DOM or call IG APIs directly other than letting IG load; we only observe.
(function(){
  if (window.__storylister_injected__) return;
  window.__storylister_injected__ = true;

  const originalFetch = window.fetch;
  const originalXHROpen = window.XMLHttpRequest.prototype.open;
  const originalXHRSend = window.XMLHttpRequest.prototype.send;

  let currentMediaId = null;
  let paginationInProgress = false;

  function extractMediaId(){
    const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function processViewerData(data, type){
    try{
      let viewers = [];
      let pageInfo = {};
      if (type === 'graphql'){
        const viewerData = data?.data?.xdt_api__v1__media__story_viewers
                        || data?.data?.xdt_api__v1__media__likers
                        || data?.data?.viewer
                        || data?.data?.story?.viewers
                        || data?.data?.media?.story_viewers;
        if (viewerData?.edges?.length){
          viewers = viewerData.edges.map(edge => ({
            username: edge.node?.username || '',
            full_name: edge.node?.full_name || '',
            profile_pic_url: edge.node?.profile_pic_url || edge.node?.profile_pic_url_hd || '',
            is_verified: !!edge.node?.is_verified,
            is_private: !!edge.node?.is_private,
            id: edge.node?.id || edge.node?.pk,
            follows_viewer: !!edge.node?.follows_viewer,
            followed_by_viewer: !!edge.node?.followed_by_viewer
          }));
          pageInfo = viewerData.page_info || {};
        }
      } else if (type === 'rest'){
        if (Array.isArray(data?.users)){
          viewers = data.users.map(u => ({
            username: u?.username || '',
            full_name: u?.full_name || '',
            profile_pic_url: u?.profile_pic_url || u?.profile_pic_url_hd || '',
            is_verified: !!u?.is_verified,
            is_private: !!u?.is_private,
            id: u?.pk || u?.id,
            follows_viewer: !!u?.friendship_status?.following,
            followed_by_viewer: !!u?.friendship_status?.followed_by
          }));
          pageInfo = { has_next_page: !!data?.next_max_id, end_cursor: data?.next_max_id || null };
        }
      }

      if (viewers.length){
        window.postMessage({
          type: 'STORYLISTER_VIEWERS_CHUNK',
          data: {
            mediaId: currentMediaId || extractMediaId(),
            viewers,
            pageInfo,
            totalCount: data?.total_viewer_count || data?.viewer_count || null
          }
        }, '*');
      }
    }catch(e){
      // swallow
    }
  }

  // Intercept fetch
  window.fetch = async function(input, init){
    const res = await originalFetch.apply(this, arguments);
    try{
      const url = (typeof input==='string') ? input : (input?.url || '');
      const isViewerCall =
        /list_reel_media_viewer/.test(url) ||
        /reel_seen_by/.test(url) ||
        (/api\/graphql/.test(url) && /story_viewers|likers|viewer/.test(url));

      if (isViewerCall){
        const clone = res.clone();
        clone.json().then(j => {
          // Decide shape
          if (Array.isArray(j?.users)) processViewerData(j, 'rest');
          else processViewerData(j, 'graphql');
        }).catch(()=>{});
      }
    }catch(_){}
    return res;
  };

  // Intercept XHR
  XMLHttpRequest.prototype.open = function(method, url){
    this.__sl_url = url;
    return originalXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body){
    this.addEventListener('load', ()=>{
      try{
        const url = this.__sl_url || '';
        const isViewerCall =
          /list_reel_media_viewer/.test(url) ||
          /reel_seen_by/.test(url) ||
          (/api\/graphql/.test(url) && /story_viewers|likers|viewer/.test(url));
        if (isViewerCall){
          const j = JSON.parse(this.responseText);
          if (Array.isArray(j?.users)) processViewerData(j, 'rest');
          else processViewerData(j, 'graphql');
        }
      }catch(_){}
    });
    return originalXHRSend.apply(this, arguments);
  };

  // Optional: internal helper to auto-paginate (not called by default)
  async function autoPaginate(baseUrl, cursor, options){
    if (paginationInProgress) return;
    paginationInProgress = true;
    let nextCursor = cursor;
    let attempts = 0;
    const maxAttempts = 50;
    while (nextCursor && attempts < maxAttempts){
      attempts++;
      let paginatedUrl = baseUrl + (baseUrl.includes('?') ? `&max_id=${nextCursor}` : `?max_id=${nextCursor}`);
      try{
        await new Promise(r=>setTimeout(r, 400 + Math.floor(Math.random()*300)));
        const response = await originalFetch(paginatedUrl, {
          ...(options||{}),
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...(options?.headers||{})
          }
        });
        const data = await response.json();
        if (Array.isArray(data?.users) && data.users.length){
          processViewerData(data, 'rest');
          nextCursor = data.next_max_id;
        } else {
          break;
        }
      }catch(e){
        break;
      }
    }
    paginationInProgress = false;
  }

  // Track current storyId
  setInterval(()=>{
    const id = extractMediaId();
    if (id !== currentMediaId){
      currentMediaId = id;
      paginationInProgress = false;
    }
  }, 1000);
})();