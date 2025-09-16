// Storylister injected (page world).
// Intercepts IG fetch/XHR responses and relays viewer chunks to the content script.
// NOTE: We DO NOT issue our own pagination fetches to avoid 403s; auto-scroll in content script
// is responsible for triggering IG's own pagination.
(function(){
  if(window.__storylister_injected__) return;
  window.__storylister_injected__ = true;
  try{ console.debug('[Storylister] injected'); }catch(_){}

  const origFetch = window.fetch;
  const origXHROpen = window.XMLHttpRequest.prototype.open;
  const origXHRSend = window.XMLHttpRequest.prototype.send;

  function extractMediaId(){
    const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function relay(viewers, pageInfo={}, totalCount=null){
    if(!Array.isArray(viewers) || viewers.length===0) return;
    try{
      window.postMessage({
        type: 'STORYLISTER_VIEWERS_CHUNK',
        data: {
          mediaId: extractMediaId(),
          viewers,
          pageInfo,
          totalCount
        }
      }, '*');
    }catch(_){}
  }

  function parseGraphQL(json){
    const candidates = [
      json?.data?.xdt_api__v1__media__story_viewers,
      json?.data?.xdt_api__v1__media__likers,
      json?.data?.viewer,
      json?.data?.story?.viewers,
      json?.data?.media?.story_viewers
    ].filter(Boolean);
    for(const node of candidates){
      const edges = node?.edges;
      if(Array.isArray(edges)){
        const pageInfo = node?.page_info || {};
        const viewers = edges.map(e=> e?.node ? {
          id: e.node.id || e.node.pk,
          username: e.node.username,
          full_name: e.node.full_name,
          profile_pic_url: e.node.profile_pic_url || e.node.profile_pic_url_hd,
          is_verified: !!e.node.is_verified,
          is_private: !!e.node.is_private,
          follows_viewer: !!e.node.follows_viewer,
          followed_by_viewer: !!e.node.followed_by_viewer
        } : null).filter(Boolean);
        if(viewers.length) { relay(viewers, pageInfo, null); return true; }
      }
    }
    return false;
  }

  function parseREST(json){
    if(Array.isArray(json?.users)){
      const viewers = json.users.map(u=> ({
        id: u.pk || u.id,
        username: u.username,
        full_name: u.full_name,
        profile_pic_url: u.profile_pic_url || u.profile_pic_url_hd,
        is_verified: !!u.is_verified,
        is_private: !!u.is_private,
        follows_viewer: !!(u.friendship_status && u.friendship_status.following),
        followed_by_viewer: !!(u.friendship_status && u.friendship_status.followed_by)
      }));
      const pageInfo = { has_next_page: !!json?.next_max_id, end_cursor: json?.next_max_id || null };
      const totalCount = json?.total_viewer_count || json?.viewer_count || null;
      relay(viewers, pageInfo, totalCount);
      return true;
    }
    return false;
  }

  window.fetch = async function(...args){
    const res = await origFetch.apply(this, args);
    try{
      const url = (typeof args[0] === 'string') ? args[0] : String(args[0]);
      if(url.includes('/list_reel_media_viewer') || url.includes('/api/graphql') || (url.includes('/media/') && url.includes('/likers/'))){
        const clone = res.clone();
        clone.json().then(j=>{ if(!parseREST(j)) parseGraphQL(j); }).catch(()=>{});
      }
    }catch(_){}
    return res;
  };

  window.XMLHttpRequest.prototype.open = function(method, url, ...rest){
    this.__sl_url = url;
    return origXHROpen.apply(this, [method, url, ...rest]);
  };
  window.XMLHttpRequest.prototype.send = function(body){
    this.addEventListener('load', ()=>{
      try{
        const url = this.__sl_url || '';
        if(url.includes('/list_reel_media_viewer') || url.includes('/api/graphql') || (url.includes('/media/') && url.includes('/likers/'))){
          const j = JSON.parse(this.responseText);
          if(!parseREST(j)) parseGraphQL(j);
        }
      }catch(_){}
    });
    return origXHRSend.apply(this, [body]);
  };

  try{ window.postMessage({type:'STORYLISTER_READY'}, '*'); }catch(_){}

})();
