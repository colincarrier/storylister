// Storylister Chrome Extension - UI Layer
// This script renders the UI and reads data from localStorage

(function() {
  // console.log('[Storylister] Initializing extension UI');
  
  // Hybrid storage manager - IndexedDB for bulk data, localStorage for speed
  class HybridStorage {
    constructor() {
      this.db = null;
      this.dbName = 'storylister_data';
      this.initPromise = this.initDB();
    }
    
    async initDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          
          if (!db.objectStoreNames.contains('viewers')) {
            const viewerStore = db.createObjectStore('viewers', { 
              keyPath: 'compositeId' 
            });
            viewerStore.createIndex('storyId', 'storyId', { unique: false });
            viewerStore.createIndex('username', 'username', { unique: false });
            viewerStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
          
          if (!db.objectStoreNames.contains('stories')) {
            db.createObjectStore('stories', { keyPath: 'id' });
          }
          
          if (!db.objectStoreNames.contains('analytics')) {
            db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
          }
        };
        
        request.onsuccess = () => {
          this.db = request.result;
          // console.log('[Storylister] IndexedDB initialized');
          resolve();
        };
        
        request.onerror = (e) => {
          console.error('[Storylister] IndexedDB failed, falling back to localStorage', e);
          // Don't fail completely - we can still use localStorage
          resolve();
        };
      });
    }
    
    async saveViewers(storyId, viewers) {
      // DISABLED: UI is read-only for viewer data, backend writes to panel_story_store
      // Don't write to localStorage to prevent conflicts with backend
      
      // Only save to IndexedDB for UI-specific caching if available
      if (this.db) {
        try {
          await this.initPromise;
          const tx = this.db.transaction(['viewers'], 'readwrite');
          const store = tx.objectStore('viewers');
          
          for (const viewer of viewers) {
            const viewerData = Array.isArray(viewer) ? viewer[1] : viewer;
            await store.put({
              ...viewerData,
              compositeId: `${storyId}_${viewerData.username}`,
              storyId,
              timestamp: Date.now()
            });
          }
        } catch (e) {
          console.warn('[Storylister] IndexedDB save failed, data in localStorage only', e);
        }
      }
    }
    
    async getViewers(storyId) {
      // Try localStorage first (fast)
      try {
        const sessionData = localStorage.getItem('panel_story_store');
        if (sessionData) {
          const parsed = JSON.parse(sessionData);
          if (parsed[storyId]?.viewers) {
            return parsed[storyId].viewers;
          }
        }
      } catch (e) {}
      
      // Fall back to IndexedDB
      if (this.db) {
        try {
          await this.initPromise;
          const tx = this.db.transaction(['viewers'], 'readonly');
          const index = tx.objectStore('viewers').index('storyId');
          const request = index.getAll(storyId);
          
          return new Promise(resolve => {
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
          });
        } catch (e) {
          return [];
        }
      }
      
      return [];
    }
  }
  
  const storage = new HybridStorage();
  
  // Helper to derive the store key from current path
  function slStoreKey() {
    // Always use the pathname
    return location.pathname;
  }

  // Load cache map for current story
  function loadCacheMapForCurrent() {
    const key = location.pathname;
    try {
      const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
      const raw = store[key];
      if (!raw || !Array.isArray(raw.viewers)) return new Map();
      return new Map(raw.viewers); // Map<viewerKey, viewer>
    } catch { return new Map(); }
  }

  // Render viewers from cache
  function renderViewersFromCache() {
    const map = loadCacheMapForCurrent();
    viewers.clear();
    
    for (const [key, v] of map) {
      viewers.set(v.username || key, {
        id: v.id || v.pk || v.username,
        username: v.username || '',
        displayName: v.full_name || v.displayName || v.username || 'Anonymous',
        profilePic: v.profile_pic_url || v.profilePic || '',
        isVerified: !!v.is_verified,
        // IG semantics: "follows_viewer" → they follow YOU (i.e., your follower)
        isFollower: !!(v.follows_viewer ?? v.is_follower),
        youFollow:  !!(v.followed_by_viewer ?? v.is_following),
        reacted:    !!v.reaction,
        reaction: v.reaction || null,
        viewedAt: v.viewedAt || v.timestamp || Date.now(),
        originalIndex: v.originalIndex || 0,
        isTagged: taggedUsers.has(v.username || v.id)
      });
    }
    
    updateViewerList();
  }
  
  // State management
  let isActive = false;
  let rightRail = null;
  let viewers = new Map();
  let currentStory = null;
  let storyMeta = {};
  let currentFilters = {
    query: '',
    type: 'all',
    sort: 'recent', // 'recent', 'oldest', 'original'
    showTagged: false,
    showReacts: false
  };
  let taggedUsers = new Set();
  let isProMode = false;
  let pausedVideos = new Set();
  let currentUsername = null;
  let freeAccountUsername = null;
  
  // Safe string helper to prevent undefined/null display
  function slSafe(s) { return (typeof s === 'string' ? s : '') || ''; }

  // Avatar HTML helper with proper fallbacks
  function slAvatarHTML(url, username) {
    // Inline SVG fallback with the user's initial
    const initial = (username || 'U').slice(0,1).toUpperCase();
    const fallback = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23e4e4e7'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.35em' fill='%23666' font-size='20'%3E${initial}%3C/text%3E%3C/svg%3E`;

    if (!url) return `<img class="sl-avatar" src="${fallback}" alt="${username||''}">`;

    // IMPORTANT: no referrerpolicy / crossorigin here
    return `<img class="sl-avatar" src="${url}" loading="lazy"
            onerror="this.onerror=null;this.src='${fallback}'" alt="${username||''}">`;
  }
  
  // Custom tags for Pro mode
  const customTags = [
    { id: 'crush', emoji: '❤️', label: 'Crush' },
    { id: 'cop', emoji: '👮‍♂️', label: 'Cop' },
    { id: 'friend', emoji: '👯', label: 'Friend' },
    { id: 'coworker', emoji: '💼', label: 'Coworker' }
  ];
  
  // Settings helpers for per-account tags
  const SETTINGS_KEY = 'storylister_settings';
  
  // Track the active media ID from backend
  let ACTIVE_MEDIA_ID_FROM_BACKEND = null;
  
  function tagsKeyFromSettings(settings) {
    const handle = (settings?.accountHandle || 'default');
    return `sl_tags_${handle}`;
  }
  
  async function loadSettingsSync() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['storylister_settings'], data => {
        resolve(data['storylister_settings'] || {});
      });
    });
  }
  
  // ---------- Account Management ----------
  function detectActiveUsername() {
    // Get logged-in user from Instagram UI
    // 1) From nav bar avatar (most reliable)
    const navAvatar = document.querySelector('nav a[href^="/"] img[alt$="profile picture"]');
    if (navAvatar) {
      const username = navAvatar.alt.replace("'s profile picture", "");
      // console.log('[Storylister UI] Detected user from nav avatar:', username);
      return username;
    }
    
    // 2) From profile link in navigation
    const profileSpan = document.querySelector('nav a[href^="/"]:not([href="/"]) span');
    if (profileSpan) {
      const link = profileSpan.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href !== '/' && !href.includes('/direct') && !href.includes('/explore')) {
          const username = href.replace(/\//g, '');
          // console.log('[Storylister UI] Detected user from nav link:', username);
          return username;
        }
      }
    }
    
    // 3) From any profile picture with user's name
    const allImgs = document.querySelectorAll('img[alt*="profile picture"]');
    for (const img of allImgs) {
      if (img.alt.includes("'s profile picture")) {
        const username = img.alt.split("'s profile picture")[0];
        // console.log('[Storylister UI] Detected user from profile pic alt:', username);
        return username;
      }
    }
    
    // console.log('[Storylister UI] Could not detect logged-in user');
    return null;
  }
  
  function isOnOwnStory() {
    const m = location.pathname.match(/\/stories\/([^\/]+)\//);
    if (!m) return false;
    const storyOwner = m[1];
    const current = detectActiveUsername();
    currentUsername = current;
    
    // Must match usernames (case-insensitive)
    if (!current || storyOwner.toLowerCase() !== current.toLowerCase()) {
      // console.log('[Storylister UI] Not own story - owner:', storyOwner, 'user:', current);
      return false;
    }
    
    // Check for "Seen by" UI to confirm (multiple methods)
    const hasViewerUI = !!document.querySelector('a[href*="/seen_by/"]') || 
                        Array.from(document.querySelectorAll('button, [role="button"], span, div'))
                          .some(el => /^Seen by \d+$|^\d+ viewers?$|^\d+$/i.test(el.textContent?.trim()));
    
    // console.log('[Storylister UI] Own story check - owner matches, has viewer UI:', hasViewerUI);
    
    return hasViewerUI;
  }
  
  async function canUseExtension() {
    const current = detectActiveUsername();
    if (!current) return false;
    
    // Get settings from chrome.storage.sync
    const settings = await loadSettingsSync();
    
    // Check if Pro mode is enabled
    if (settings.proMode) return true;
    
    // For Free mode, check if this is the primary account
    const saved = settings.accountHandle;
    if (!saved) return true; // Will be set by backend on first use
    
    // Check if current account is the saved account
    return saved === current;
  }
  
  function getAccountPrefix() {
    const username = detectActiveUsername() || 'default';
    return `sl_${username}_`;
  }
  
  // Load tagged users from chrome.storage (account-specific)
  async function loadTaggedUsers() {
    try {
      const settings = await loadSettingsSync();
      const TAGS_KEY = tagsKeyFromSettings(settings);
      
      return new Promise(resolve => {
        chrome.storage.local.get([TAGS_KEY], (obj) => {
          const tags = obj[TAGS_KEY] || [];
          taggedUsers = new Set(tags);
          resolve();
        });
      });
    } catch (e) {
      taggedUsers = new Set();
    }
  }
  
  // Save tagged users to chrome.storage (account-specific)
  async function saveTaggedUsers() {
    const settings = await loadSettingsSync();
    const TAGS_KEY = tagsKeyFromSettings(settings);
    chrome.storage.local.set({ [TAGS_KEY]: Array.from(taggedUsers) });
  }
  
  // Format time ago
  function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
  
  // Auto-pause videos
  async function pauseVideos() {
    const settings = await loadSettingsSync();
    if (settings.pauseVideos === false) return;
    
    document.querySelectorAll('video').forEach(video => {
      if (!video.paused) {
        try {
          video.pause();
          pausedVideos.add(video);
          video.dataset.storylisterPaused = 'true';
        } catch (e) {
          // ignore
        }
      }
    });
    
    // Also pause story progress animations
    const progressBars = document.querySelectorAll('[role="progressbar"]');
    progressBars.forEach(bar => {
      bar.style.animationPlayState = 'paused';
    });
  }
  
  // Resume videos
  function resumeVideos() {
    pausedVideos.forEach(video => {
      if (video.dataset.storylisterPaused === 'true') {
        try {
          video.play();
        } catch (e) {
          // ignore
        }
        delete video.dataset.storylisterPaused;
      }
    });
    pausedVideos.clear();
    
    // Resume progress animations
    const progressBars = document.querySelectorAll('[role="progressbar"]');
    progressBars.forEach(bar => {
      bar.style.animationPlayState = 'running';
    });
  }
  
  // Get filtered viewers
  function getFilteredViewers() {
    let filteredViewers = Array.from(viewers.values());

    // Apply text search
    if (currentFilters.query) {
      const query = currentFilters.query.toLowerCase();
      filteredViewers = filteredViewers.filter(viewer => 
        viewer.username.toLowerCase().includes(query) ||
        (viewer.displayName || viewer.full_name || '').toLowerCase().includes(query)
      );
    }

    // Apply type filter
    switch (currentFilters.type) {
      case 'reacts':
        filteredViewers = filteredViewers.filter(v => v.reacted || !!v.reaction);
        break;
      case 'followers':
        filteredViewers = filteredViewers.filter(v => v.isFollower);
        break;
      case 'non-followers':
        filteredViewers = filteredViewers.filter(v => !v.isFollower);
        break;
      case 'following':
        filteredViewers = filteredViewers.filter(v => v.youFollow);     // you follow them
        break;
      case 'verified':
        filteredViewers = filteredViewers.filter(v => v.isVerified);
        break;
    }

    // Apply tag filter
    if (currentFilters.showTagged) {
      filteredViewers = filteredViewers.filter(v => v.isTagged);
    }

    // Apply sorting
    switch (currentFilters.sort) {
      case 'oldest':
        filteredViewers.sort((a, b) => (a.viewedAt || a.capturedAt || 0) - (b.viewedAt || b.capturedAt || 0));
        break;
      case 'original':
        // Preserve Instagram's original order
        filteredViewers.sort((a, b) => (a.originalIndex || 0) - (b.originalIndex || 0));
        break;
      case 'recent':
      default:
        filteredViewers.sort((a, b) => (b.viewedAt || b.capturedAt || 0) - (a.viewedAt || a.capturedAt || 0));
        break;
    }

    return filteredViewers;
  }
  
  // Data synchronization with chunking
  const DataSyncManager = {
    lastSyncTime: 0,
    
    async performSync() {
      const now = performance.now();
      if (now - this.lastSyncTime < 1000) return;
      this.lastSyncTime = now;
      
      try {
        // Prefer the active media announced by backend
        const currentKey = ACTIVE_MEDIA_ID_FROM_BACKEND || slStoreKey();
        
        if (!currentKey) {
          // Try legacy localStorage format or use last key
          const storeRaw = localStorage.getItem('panel_story_store');
          if (storeRaw) {
            const store = JSON.parse(storeRaw);
            const lastKey = Object.keys(store).at(-1); // last updated
            if (lastKey && store[lastKey]) {
              currentStory = lastKey;
              const storyData = store[lastKey];
              if (storyData.viewers) {
                viewers.clear();
                for (const [id, viewer] of storyData.viewers) {
                  viewers.set(viewer.username || id, viewer);
                }
              }
            }
          }
          return;
        }
        
        const currentStoryId = currentKey;
        currentStory = currentStoryId;
        
        // Get viewers from hybrid storage
        let viewerData = await storage.getViewers(currentStoryId);
        
        if (!viewerData || viewerData.length === 0) {
          // Try legacy localStorage format for backwards compatibility
          const legacyData = localStorage.getItem('panel_story_store');
          if (legacyData) {
            const parsed = JSON.parse(legacyData);
            if (parsed[currentStoryId] && parsed[currentStoryId].viewers) {
              viewerData = parsed[currentStoryId].viewers || [];
            }
          }
        }
        
        // Process in chunks for performance
        if (viewerData && viewerData.length > 0) {
          viewers.clear();
          
          const chunkSize = 50;
          for (let i = 0; i < viewerData.length; i += chunkSize) {
            const chunk = viewerData.slice(i, i + chunkSize);
            
            await new Promise(resolve => {
              requestAnimationFrame(() => {
                chunk.forEach(item => {
                  // Handle both formats ([id, viewer] or just viewer)
                  const viewer = Array.isArray(item) ? item[1] : item;
                  
                  const viewerIndex = Array.isArray(item) ? i : (viewer.originalIndex || i);
                  viewers.set(viewer.username, {
                    id: viewer.id || viewer.pk || viewer.username,
                    username: viewer.username || '',
                    displayName: viewer.full_name || viewer.displayName || viewer.username || 'Anonymous',
                    profilePic: viewer.profile_pic_url || viewer.profilePic || `https://ui-avatars.com/api/?name=${viewer.username || 'U'}`,
                    isVerified: viewer.is_verified || false,
                    isFollower: viewer.follows_viewer || false,
                    youFollow: viewer.followed_by_viewer || false,
                    isTagged: taggedUsers.has(viewer.username),
                    isNew: viewer.isNew || false,
                    reaction: viewer.reaction || viewer.reacted || null,
                    originalIndex: viewer.originalIndex || viewerIndex,
                    viewedAt: viewer.viewedAt || viewer.capturedAt || viewer.timestamp || Date.now(),
                    capturedAt: viewer.capturedAt || Date.now()
                  });
                });
                resolve();
              });
            });
          }
          
          // Update metadata
          storyMeta.domTotal = viewerData.length;
          storyMeta.collectedCount = viewers.size;
          
          // console.log(`[Storylister] Loaded ${viewers.size} viewers for story ${currentStoryId}`);
          updateViewerList();
        }
      } catch (e) {
        console.error('[Storylister] Sync error:', e);
      }
    },
    
    startSync() {
      const syncLoop = () => {
        if (isActive && isOnOwnStory()) {
          this.performSync();
        }
        requestAnimationFrame(() => setTimeout(syncLoop, 1000));
      };
      syncLoop();
    }
  };
  
  // Load viewers from localStorage under the pathname key
  function loadViewersFromStorage() {
    const currentKey = slStoreKey(); // Always use pathname
    if (!currentKey) return;
    
    const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
    const data = store[currentKey];
    if (!data?.viewers) return;

    viewers.clear();
    // Each entry is [viewerKey, viewerObj] from backend's dedup
    data.viewers.forEach(([_, v], i) => {
      const viewerKey = v.username || v.id || v.pk;
      viewers.set(viewerKey, {
        id: v.id || v.pk || v.username,
        username: v.username || '',
        displayName: v.full_name || v.displayName || v.username || 'Anonymous',
        profilePic: v.profile_pic_url || v.profilePic || '',
        isVerified: !!v.is_verified,
        isFollower: !!(v.follows_viewer ?? v.is_follower),
        youFollow:  !!(v.followed_by_viewer ?? v.is_following),
        viewedAt: v.viewedAt || v.timestamp || Date.now(),
        originalIndex: Number.isFinite(v.originalIndex) ? v.originalIndex : i,
        reaction: v.reaction || null,
        isTagged: taggedUsers.has(v.username || v.id)
      });
    });
    
    updateViewerList();
  }
  
  // Toggle tag
  function toggleTag(username) {
    if (taggedUsers.has(username)) {
      taggedUsers.delete(username);
    } else {
      taggedUsers.add(username);
    }
    saveTaggedUsers();
    
    // Update viewer
    const viewer = viewers.get(username);
    if (viewer) {
      viewer.isTagged = taggedUsers.has(username);
    }
    
    updateViewerList();
  }
  
  // Export data
  function exportData() {
    const data = getFilteredViewers().map(v => ({
      username: v.username,
      displayName: v.displayName,
      isVerified: v.isVerified,
      isFollower: v.isFollower,
      isTagged: v.isTagged,
      isNew: v.isNew,
      reaction: v.reaction,
      viewedAt: new Date(v.viewedAt).toISOString(),
      story: storyMeta.storyIndex || 1
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister_story${storyMeta.storyIndex || 1}_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Update viewer list UI
  function updateViewerList() {
    const listElement = document.getElementById('sl-list');
    if (!listElement) return;
    
    const filteredViewers = getFilteredViewers();
    
    // Count stats
    const totalViewers = viewers.size;
    const totalVerified = Array.from(viewers.values()).filter(v => v.isVerified).length;
    const taggedInCurrentStory = Array.from(viewers.values()).filter(v => v.isTagged).length;
    const newViewersCount = Array.from(viewers.values()).filter(v => v.isNew).length;
    
    // Update header with story position
    const storyIndicator = document.querySelector('.storylister-story-indicator');
    if (storyIndicator) {
      const storyText = storyMeta.storyTotal > 0 
        ? `Analyzing Story ${storyMeta.storyIndex || 1} of ${storyMeta.storyTotal}`
        : 'Analyzing Story';
      storyIndicator.textContent = storyText;
    }
    
    // Update stats
    const viewerCount = document.getElementById('sl-viewer-count');
    const verifiedCount = document.getElementById('sl-verified-count');
    const taggedCount = document.getElementById('sl-tagged-count');
    
    if (viewerCount) viewerCount.textContent = totalViewers;
    if (verifiedCount) verifiedCount.textContent = totalVerified;
    if (taggedCount) taggedCount.textContent = `${taggedInCurrentStory}/${taggedUsers.size}`;
    
    // Update filtered count with DOM total if available
    let countText = `${filteredViewers.length} viewers`;
    if (storyMeta.domTotal && storyMeta.domTotal > viewers.size) {
      countText = `Showing ${filteredViewers.length} of ${storyMeta.domTotal} viewers`;
    }
    if (newViewersCount > 0) {
      countText += ` (${newViewersCount} new)`;
    }
    const filteredCount = document.getElementById('sl-filtered-count');
    if (filteredCount) filteredCount.textContent = countText;
    
    // Clear and rebuild list
    listElement.innerHTML = '';
    
    if (filteredViewers.length === 0) {
      listElement.innerHTML = `
        <div class="storylister-empty">
          <div class="storylister-empty-icon">👁️</div>
          <div class="storylister-empty-text">
            ${viewers.size === 0 ? 'Waiting for viewers...' : 'No viewers match filters'}
          </div>
        </div>
      `;
      return;
    }
    
    filteredViewers.forEach(viewer => {
      const viewerEl = document.createElement('div');
      viewerEl.className = 'storylister-viewer-item';
      
      // Build reaction display
      let reactionHtml = '';
      if (viewer.reaction) {
        reactionHtml = `<span class="viewer-reaction">${viewer.reaction}</span>`;
      }
      
      // Build new badge
      let newBadge = '';
      if (viewer.isNew) {
        newBadge = '<span class="viewer-new-badge">NEW</span>';
      }
      
      viewerEl.innerHTML = `
        <div class="storylister-viewer-avatar" data-username="${slSafe(viewer.username)}">
          ${slAvatarHTML(viewer.profilePic, viewer.username)}
        </div>
        <div class="storylister-viewer-info">
          <div class="storylister-viewer-username" data-username="${viewer.username}">
            ${viewer.username}
            ${viewer.isVerified ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2" style="display: inline; vertical-align: middle; margin-left: 4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
            ${reactionHtml}
            ${newBadge}
          </div>
          <div class="storylister-viewer-meta">
            ${viewer.displayName} · ${formatTimeAgo(viewer.viewedAt)}
          </div>
        </div>
        <div class="storylister-viewer-tags">
          ${!isProMode ? `
            <button class="storylister-tag ${viewer.isTagged ? 'active' : ''}" data-username="${viewer.username}">
              👀
            </button>
          ` : `
            <select class="storylister-tag-dropdown" data-username="${viewer.username}">
              <option value="">No tag</option>
              ${customTags.map(tag => 
                `<option value="${tag.id}" ${viewer.isTagged ? 'selected' : ''}>${tag.emoji} ${tag.label}</option>`
              ).join('')}
            </select>
          `}
        </div>
      `;
      listElement.appendChild(viewerEl);
    });
  }
  
  // Create the right rail UI
  function createRightRail() {
    const rail = document.createElement('div');
    rail.id = 'storylister-right-rail';
    rail.innerHTML = `
      <div class="storylister-panel">
        <div class="storylister-content">
          <div class="storylister-header">
            <div class="storylister-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>Storylister</span>
            </div>
            <div class="storylister-header-actions">
              <button id="sl-settings-btn" class="storylister-settings-btn" title="Settings">⚙️</button>
              <button id="sl-pro-toggle" class="storylister-pro-toggle">
                ${isProMode ? 'Pro' : 'Free'}
              </button>
              <button id="sl-close" class="storylister-close">×</button>
            </div>
          </div>
          
          <div class="storylister-settings-dropdown" id="sl-settings-dropdown" style="display: none;">
            <label class="settings-toggle">
              <input type="checkbox" id="sl-auto-open" checked>
              <span>Auto-open panel on your stories</span>
            </label>
            <label class="settings-toggle">
              <input type="checkbox" id="sl-pause-videos" checked>
              <span>Pause videos when panel opens</span>
            </label>
          </div>
          
          <div class="storylister-story-section">
            <div class="storylister-story-indicator">
              Analyzing Story
            </div>
            <button class="story-insights-btn-small" id="sl-insights">
              📊 Story to Story Insights
            </button>
          </div>
          
          <div class="storylister-stats-summary">
            <div class="stat-item">
              <span class="stat-label">Viewers</span>
              <span class="stat-value" id="sl-viewer-count">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Verified</span>
              <span class="stat-value" id="sl-verified-count">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Tagged</span>
              <span class="stat-value" id="sl-tagged-count">0/0</span>
            </div>
          </div>
          
          <div class="storylister-search-section">
            <h3 class="search-title">Search Viewers</h3>
            <div class="storylister-search">
              <input 
                type="text" 
                id="sl-search"
                placeholder="Search by username or name..."
              />
            </div>
          </div>
          
          <div class="storylister-filter-buttons">
            <div class="filter-buttons-main">
              <button class="filter-btn active" data-filter-type="all">All</button>
              <button class="filter-btn" data-filter-type="verified">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2" style="display: inline; vertical-align: middle;">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Verified
              </button>
              <button class="filter-btn" data-filter-tagged="true">
                👀 Tagged
              </button>
            </div>
            <div class="filter-buttons-secondary">
              <button class="filter-btn-small" data-filter-type="reacts">❤️ Reacts</button>
              <button class="filter-btn-small" data-filter-type="following">Following</button>
              <button class="filter-btn-small" data-filter-type="followers">Followers</button>
              <button class="filter-btn-small" data-filter-type="non-followers">Non-followers</button>
            </div>
          </div>
          
          <div class="storylister-stats">
            <span class="viewer-count" id="sl-filtered-count">0 viewers found</span>
            <button id="sl-sort" class="sort-toggle-btn">↓ Newest</button>
          </div>
          
          <div class="storylister-results" id="sl-list">
            <!-- Viewer list will be populated here -->
          </div>
          
          <div class="storylister-bottom-sections">
            <div class="bottom-section">
              <button class="storylister-manage-tags" id="sl-manage-tags">
                🏷️ Manage Tags
              </button>
            </div>
            <div class="bottom-section">
              <button class="export-track-btn" id="sl-export">
                💾 Export & Track
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(rail);
    return rail;
  }
  
  // Create manage tags modal
  function createManageTagsModal() {
    const modal = document.createElement('div');
    modal.className = 'storylister-manage-tags-modal';
    modal.id = 'storylister-tags-modal';
    modal.innerHTML = `
      <div class="storylister-modal-header">
        <h3 style="margin: 0; font-size: 18px;">Manage Tagged Users</h3>
        <button class="storylister-close" id="sl-tags-close" style="position: absolute; top: 20px; right: 20px;">×</button>
      </div>
      <div class="storylister-modal-content" id="sl-tags-list">
        <!-- Tagged users will be listed here -->
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }
  
  // Show manage tags modal
  function showManageTagsModal() {
    let modal = document.getElementById('storylister-tags-modal');
    if (!modal) {
      modal = createManageTagsModal();
      
      // Setup close button
      document.getElementById('sl-tags-close')?.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }
    
    // Populate tagged users
    const listEl = document.getElementById('sl-tags-list');
    if (!listEl) return;
    
    if (taggedUsers.size === 0) {
      listEl.innerHTML = '<div style="text-align: center; color: #9ca3af;">No tagged users yet</div>';
    } else {
      listEl.innerHTML = '';
      taggedUsers.forEach(username => {
        const itemEl = document.createElement('div');
        itemEl.className = 'storylister-tag-item';
        itemEl.innerHTML = `
          <span class="storylister-tag-username">@${username}</span>
          <button class="storylister-tag-remove" data-username="${username}">Remove</button>
        `;
        listEl.appendChild(itemEl);
      });
      
      // Add remove listeners
      listEl.querySelectorAll('.storylister-tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const username = e.target.dataset.username;
          taggedUsers.delete(username);
          saveTaggedUsers();
          showManageTagsModal(); // Refresh
          updateViewerList(); // Update main list
        });
      });
    }
    
    modal.classList.add('active');
  }
  
  // Create Story Insights Modal
  function createStoryInsightsModal() {
    const modal = document.createElement('div');
    modal.className = 'storylister-insights-modal';
    modal.id = 'storylister-insights-modal';
    modal.innerHTML = `
      <div class="storylister-modal-overlay" id="sl-insights-overlay"></div>
      <div class="storylister-modal-container">
        <div class="storylister-modal-header">
          <h2 style="margin: 0; font-size: 20px; font-weight: 600;">📊 Story to Story Insights</h2>
          <button class="storylister-close" id="sl-insights-close">×</button>
        </div>
        <div class="storylister-insights-content">
          <div class="insights-summary">
            <h3>Current Session Analytics</h3>
            <div class="insights-grid">
              <div class="insight-card">
                <div class="insight-value" id="total-stories-viewed">0</div>
                <div class="insight-label">Stories Analyzed</div>
              </div>
              <div class="insight-card">
                <div class="insight-value" id="total-unique-viewers">0</div>
                <div class="insight-label">Unique Viewers</div>
              </div>
              <div class="insight-card">
                <div class="insight-value" id="avg-viewers-per-story">0</div>
                <div class="insight-label">Avg Viewers/Story</div>
              </div>
              <div class="insight-card">
                <div class="insight-value" id="viewer-retention">0%</div>
                <div class="insight-label">Viewer Retention</div>
              </div>
            </div>
          </div>
          
          <div class="insights-breakdown">
            <h3>Story Breakdown</h3>
            <div id="story-breakdown-list" class="story-list">
              <!-- Story data will be populated here -->
            </div>
          </div>
          
          <div class="insights-viewers">
            <h3>Top Engaged Viewers</h3>
            <div id="top-viewers-list" class="viewers-analysis">
              <!-- Top viewers will be listed here -->
            </div>
          </div>
          
          <div class="insights-footer">
            <button class="export-insights-btn" id="export-insights">
              💾 Export Insights Data
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }
  
  // Calculate and show insights
  function showStoryInsights() {
    let modal = document.getElementById('storylister-insights-modal');
    if (!modal) {
      modal = createStoryInsightsModal();
      
      // Setup close handlers
      document.getElementById('sl-insights-close')?.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      document.getElementById('sl-insights-overlay')?.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      // Export button
      document.getElementById('export-insights')?.addEventListener('click', exportInsights);
    }
    
    // Get all story data from localStorage
    const storyStore = localStorage.getItem('panel_story_store');
    const allStories = storyStore ? JSON.parse(storyStore) : {};
    
    // Get current session from the current story
    const currentStory = allStories[slStoreKey()];
    const currentSessionId = currentStory?.sessionId;
    
    // Filter stories to only include current session
    const sessionStories = {};
    if (currentSessionId) {
      Object.entries(allStories).forEach(([key, story]) => {
        if (story.sessionId === currentSessionId) {
          sessionStories[key] = story;
        }
      });
    }
    
    // Calculate metrics using only session stories
    const storyIds = Object.keys(sessionStories);
    const totalStories = storyIds.length;
    const allViewers = new Set();
    const viewerFrequency = new Map();
    let totalViewerCount = 0;
    
    // Process each story in this session
    storyIds.forEach(storyId => {
      const story = sessionStories[storyId];
      if (story.viewers) {
        story.viewers.forEach(([compositeId, viewer]) => {
          allViewers.add(viewer.username);
          totalViewerCount++;
          
          // Track viewer frequency
          const freq = viewerFrequency.get(viewer.username) || {
            username: viewer.username,
            displayName: viewer.full_name || viewer.username,
            count: 0,
            stories: [],
            isVerified: viewer.is_verified
          };
          freq.count++;
          freq.stories.push(storyId);
          viewerFrequency.set(viewer.username, freq);
        });
      }
    });
    
    const uniqueViewers = allViewers.size;
    const avgViewers = totalStories > 0 ? Math.round(totalViewerCount / totalStories) : 0;
    
    // Calculate retention (viewers who viewed multiple stories)
    const loyalViewers = Array.from(viewerFrequency.values()).filter(v => v.count > 1).length;
    const retention = uniqueViewers > 0 ? Math.round((loyalViewers / uniqueViewers) * 100) : 0;
    
    // Update summary metrics
    document.getElementById('total-stories-viewed').textContent = totalStories;
    document.getElementById('total-unique-viewers').textContent = uniqueViewers;
    document.getElementById('avg-viewers-per-story').textContent = avgViewers;
    document.getElementById('viewer-retention').textContent = retention + '%';
    
    // Story breakdown
    const breakdownList = document.getElementById('story-breakdown-list');
    if (breakdownList) {
      breakdownList.innerHTML = '';
      
      if (storyIds.length === 0) {
        breakdownList.innerHTML = '<div class="no-data">No story data available for this session. View some stories first!</div>';
      } else {
        // Sort stories by fetchedAt to show in chronological order
        const sortedStoryIds = storyIds.sort((a, b) => {
          const aTime = sessionStories[a].fetchedAt || 0;
          const bTime = sessionStories[b].fetchedAt || 0;
          return aTime - bTime;
        });
        
        sortedStoryIds.forEach((storyId, index) => {
          const story = sessionStories[storyId];
          const viewerCount = story.viewers ? story.viewers.length : 0;
          const newCount = story.viewers ? story.viewers.filter(([,v]) => v.isNew).length : 0;
          
          const storyEl = document.createElement('div');
          storyEl.className = 'story-item';
          storyEl.innerHTML = `
            <div class="story-number">Story ${index + 1}</div>
            <div class="story-stats">
              <span>${viewerCount} viewers</span>
              ${newCount > 0 ? `<span class="new-badge">${newCount} new</span>` : ''}
              <span class="story-time">${formatTimeAgo(story.fetchedAt || Date.now())}</span>
            </div>
          `;
          breakdownList.appendChild(storyEl);
        });
      }
    }
    
    // Top engaged viewers
    const topViewersList = document.getElementById('top-viewers-list');
    if (topViewersList) {
      topViewersList.innerHTML = '';
      
      const sortedViewers = Array.from(viewerFrequency.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      if (sortedViewers.length === 0) {
        topViewersList.innerHTML = '<div class="no-data">No viewer data yet</div>';
      } else {
        sortedViewers.forEach(viewer => {
          const viewerEl = document.createElement('div');
          viewerEl.className = 'engaged-viewer';
          viewerEl.innerHTML = `
            <div class="viewer-info">
              <span class="viewer-name">@${viewer.username}</span>
              ${viewer.isVerified ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2" style="display: inline; vertical-align: middle;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
              <span class="viewer-display">${viewer.displayName}</span>
            </div>
            <div class="viewer-engagement">
              <span class="story-count">${viewer.count} ${viewer.count === 1 ? 'story' : 'stories'}</span>
              <div class="engagement-bar" style="width: ${Math.min((viewer.count / totalStories) * 100, 100)}%"></div>
            </div>
          `;
          topViewersList.appendChild(viewerEl);
        });
      }
    }
    
    modal.style.display = 'block';
  }
  
  // Export insights data
  function exportInsights() {
    const storyStore = localStorage.getItem('panel_story_store');
    const allStories = storyStore ? JSON.parse(storyStore) : {};
    
    const insightsData = {
      exportDate: new Date().toISOString(),
      account: currentUsername,
      summary: {
        totalStories: Object.keys(allStories).length,
        totalViewers: 0,
        uniqueViewers: new Set()
      },
      stories: [],
      viewerEngagement: {}
    };
    
    // Process stories
    Object.entries(allStories).forEach(([storyId, story], index) => {
      const viewers = story.viewers || [];
      insightsData.summary.totalViewers += viewers.length;
      
      viewers.forEach(([, viewer]) => {
        insightsData.summary.uniqueViewers.add(viewer.username);
        
        if (!insightsData.viewerEngagement[viewer.username]) {
          insightsData.viewerEngagement[viewer.username] = {
            username: viewer.username,
            displayName: viewer.full_name || viewer.username,
            storiesViewed: 0,
            isVerified: viewer.is_verified || false,
            reactions: []
          };
        }
        insightsData.viewerEngagement[viewer.username].storiesViewed++;
        if (viewer.reaction) {
          insightsData.viewerEngagement[viewer.username].reactions.push(viewer.reaction);
        }
      });
      
      insightsData.stories.push({
        storyNumber: index + 1,
        storyId: storyId,
        viewerCount: viewers.length,
        timestamp: story.fetchedAt,
        viewers: viewers.map(([, v]) => ({
          username: v.username,
          displayName: v.full_name,
          isNew: v.isNew || false,
          reaction: v.reaction || null
        }))
      });
    });
    
    insightsData.summary.uniqueViewers = insightsData.summary.uniqueViewers.size;
    
    const blob = new Blob([JSON.stringify(insightsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister_insights_${currentUsername}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Show right rail
  async function showRightRail() {
    // Check if we can use the extension
    if (!(await canUseExtension())) {
      // console.log('[Storylister] Cannot use extension on this account (Pro required for multiple accounts)');
      const settings = await loadSettingsSync();
      if (settings.accountHandle) {
        showUpgradePrompt(settings.accountHandle);
      }
      return;
    }
    
    if (!rightRail) {
      rightRail = createRightRail();
      setupEventListeners();
    }
    
    rightRail.classList.add('active');
    isActive = true;
    
    // Pause videos
    pauseVideos();
    
    // Set up observer for new videos
    const videoObserver = new MutationObserver(() => {
      if (isActive) {
        pauseVideos();
      }
    });
    videoObserver.observe(document.body, { childList: true, subtree: true });
    
    // Notify backend that panel opened
    window.dispatchEvent(new CustomEvent('storylister:panel_opened'));
    
    // Load viewers
    loadViewersFromStorage();
    updateViewerList();
  }
  
  // Hide right rail
  function hideRightRail() {
    if (rightRail) {
      rightRail.classList.remove('active');
    }
    isActive = false;
    
    // Notify backend that panel closed
    window.dispatchEvent(new CustomEvent('storylister:panel_closed'));
    
    // Resume videos
    resumeVideos();
  }
  
  // Show upgrade prompt
  function showUpgradePrompt(savedHandle) {
    const prompt = document.createElement('div');
    prompt.className = 'storylister-upgrade-prompt';
    prompt.innerHTML = `
      <div class="upgrade-content">
        <h3>Multiple Account Support</h3>
        <p>Storylister Free works with one Instagram account. Upgrade to Pro to use with multiple accounts.</p>
        <p>Currently active on: <strong>@${savedHandle}</strong></p>
        <button class="upgrade-close" onclick="this.parentElement.parentElement.remove()">OK</button>
      </div>
    `;
    document.body.appendChild(prompt);
    setTimeout(() => prompt.remove(), 5000);
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Close button
    document.getElementById('sl-close')?.addEventListener('click', hideRightRail);
    
    // Settings toggle
    const settingsBtn = document.getElementById('sl-settings-btn');
    const settingsDropdown = document.getElementById('sl-settings-dropdown');
    
    settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsDropdown.style.display = settingsDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Settings checkboxes
    document.getElementById('sl-auto-open')?.addEventListener('change', async (e) => {
      const settings = await loadSettingsSync();
      settings.autoOpen = e.target.checked;
      chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
    });
    
    document.getElementById('sl-pause-videos')?.addEventListener('change', async (e) => {
      const settings = await loadSettingsSync();
      settings.pauseVideos = e.target.checked;
      chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
    });
    
    // Pro toggle
    document.getElementById('sl-pro-toggle')?.addEventListener('click', (e) => {
      isProMode = !isProMode;
      e.target.textContent = isProMode ? 'Pro' : 'Free';
      e.target.classList.toggle('pro', isProMode);
      updateViewerList();
    });
    
    // Search - stop propagation to prevent interference
    const searchEl = document.getElementById('sl-search');
    if (searchEl) {
      searchEl.addEventListener('keydown', e => { 
        e.stopPropagation(); 
      }, { capture: true });
      searchEl.addEventListener('input', (e) => {
        currentFilters.query = e.target.value;
        updateViewerList();
      });
    }
    
    // Filter buttons
    document.querySelectorAll('[data-filter-type]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filterType = e.currentTarget.dataset.filterType;
        
        // Remove active from all type filters
        document.querySelectorAll('[data-filter-type]').forEach(b => {
          b.classList.remove('active');
        });
        
        e.currentTarget.classList.add('active');
        currentFilters.type = filterType;
        updateViewerList();
      });
    });
    
    // Tagged filter
    document.querySelector('[data-filter-tagged]')?.addEventListener('click', (e) => {
      currentFilters.showTagged = !currentFilters.showTagged;
      e.currentTarget.classList.toggle('active', currentFilters.showTagged);
      updateViewerList();
    });

    // Reacts filter
    document.querySelector('[data-filter-reacts]')?.addEventListener('click', (e) => {
      currentFilters.showReacts = !currentFilters.showReacts;
      e.currentTarget.classList.toggle('active', currentFilters.showReacts);
      updateViewerList();
    });
    
    // Sort toggle - three-way: newest -> oldest -> original
    document.getElementById('sl-sort')?.addEventListener('click', (e) => {
      const sorts = ['recent', 'oldest', 'original'];
      const labels = {
        'recent': '↓ Newest',
        'oldest': '↑ Oldest',
        'original': '📝 Original'
      };
      
      const currentIndex = sorts.indexOf(currentFilters.sort);
      currentFilters.sort = sorts[(currentIndex + 1) % 3];
      e.target.textContent = labels[currentFilters.sort];
      updateViewerList();
    });
    
    // Export
    document.getElementById('sl-export')?.addEventListener('click', exportData);
    
    // Insights button
    document.getElementById('sl-insights')?.addEventListener('click', showStoryInsights);
    
    // Manage tags button
    document.getElementById('sl-manage-tags')?.addEventListener('click', showManageTagsModal);
    
    // Tag clicks (delegated)
    document.getElementById('sl-list')?.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('.storylister-tag');
      if (tagBtn) {
        const username = tagBtn.dataset.username;
        toggleTag(username);
      }
      
      const avatarEl = e.target.closest('.storylister-viewer-avatar');
      const usernameEl = e.target.closest('.storylister-viewer-username');
      if (avatarEl || usernameEl) {
        const username = (avatarEl || usernameEl).dataset.username;
        // console.log(`[Storylister] Would open profile: @${username}`);
      }
    });
    
    // Tag dropdown (delegated)
    document.getElementById('sl-list')?.addEventListener('change', (e) => {
      if (e.target.classList.contains('storylister-tag-dropdown')) {
        const username = e.target.dataset.username;
        if (e.target.value) {
          if (!taggedUsers.has(username)) {
            toggleTag(username);
          }
        } else {
          if (taggedUsers.has(username)) {
            toggleTag(username);
          }
        }
      }
    });
    
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      if (settingsDropdown) {
        settingsDropdown.style.display = 'none';
      }
    });
  }
  
  // Check if on stories page
  async function checkForStories() {
    const isStoriesPage = window.location.pathname.includes('/stories/');
    const isOwnStory = isOnOwnStory();
    
    if (isStoriesPage && isOwnStory && !isActive) {
      // Load settings to check if auto-open is enabled
      const settings = await loadSettingsSync();
      if (settings.autoOpen !== false) { // Default true
        showRightRail();
      }
    } else if ((!isStoriesPage || !isOwnStory) && isActive) {
      hideRightRail();
    }
  }
  
  // Listen for active media announcements from backend
  window.addEventListener('storylister:active_media', (e) => {
    ACTIVE_MEDIA_ID_FROM_BACKEND = e.detail?.storyId || null;
    // force a refresh now that we know the correct key
    if (typeof loadViewersFromStorage === 'function') {
      loadViewersFromStorage();
    }
  });

  // Listen for data updates
  window.addEventListener('storylister:data_updated', (e) => {
    // console.log('[Storylister] Data updated:', e.detail);
    const currentKey = slStoreKey();
    if (e.detail?.storyId === currentKey) {
      renderViewersFromCache();
    }
  });
  
  // Listen for settings updates from chrome.storage
  window.addEventListener('storylister:settings_updated', (e) => {
    // console.log('[Storylister] Settings updated:', e.detail);
    // Re-check if we should show/hide based on new settings
    checkForStories();
  });
  
  // Monitor URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      checkForStories();
    }
  }, 1000);
  
  // Add styles for new elements
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .viewer-reaction {
        margin-left: 6px;
        font-size: 14px;
      }
      
      .viewer-new-badge {
        display: inline-block;
        background: #10b981;
        color: white;
        font-size: 10px;
        font-weight: 600;
        padding: 2px 4px;
        border-radius: 3px;
        margin-left: 6px;
        text-transform: uppercase;
      }
      
      .storylister-empty {
        text-align: center;
        padding: 40px 20px;
        color: #9ca3af;
      }
      
      .storylister-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      
      .storylister-empty-text {
        font-size: 14px;
      }
      
      .storylister-settings-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
      }
      
      .storylister-settings-dropdown {
        position: absolute;
        top: 100%;
        right: 10px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        min-width: 200px;
      }
      
      .settings-toggle {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        cursor: pointer;
      }
      
      .settings-toggle input {
        margin-right: 8px;
      }
      
      .settings-toggle span {
        font-size: 14px;
        color: #4b5563;
      }
      
      .storylister-upgrade-prompt {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border: 2px solid #8b5cf6;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        z-index: 100002;
      }
      
      .upgrade-content {
        text-align: center;
      }
      
      .upgrade-close {
        background: #8b5cf6;
        color: white;
        border: none;
        padding: 8px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin-top: 10px;
      }
      
      /* Manage Tags Modal Styles */
      .storylister-manage-tags-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 100001;
        width: 420px;
        max-height: 500px;
        display: none;
      }
      
      .storylister-manage-tags-modal.active {
        display: block;
      }
      
      .storylister-modal-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        position: relative;
      }
      
      .storylister-modal-content {
        padding: 20px;
        max-height: 350px;
        overflow-y: auto;
      }
      
      .storylister-tag-item {
        display: flex;
        align-items: center;
        padding: 12px;
        margin-bottom: 8px;
        background: #f9fafb;
        border-radius: 8px;
        transition: background 0.2s;
      }
      
      .storylister-tag-item:hover {
        background: #f3f4f6;
      }
      
      .storylister-tag-username {
        flex: 1;
        font-weight: 500;
        color: #111827;
      }
      
      .storylister-tag-remove {
        background: #ef4444;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.2s;
      }
      
      .storylister-tag-remove:hover {
        background: #dc2626;
      }
      
      /* Story Insights Modal Styles */
      .storylister-insights-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 100000;
        display: none;
      }
      
      .storylister-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
      }
      
      .storylister-modal-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 16px;
        width: 600px;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      
      .storylister-insights-content {
        padding: 24px;
        max-height: calc(80vh - 70px);
        overflow-y: auto;
      }
      
      .insights-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin: 20px 0;
      }
      
      .insight-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
      }
      
      .insight-value {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      
      .insight-label {
        font-size: 14px;
        opacity: 0.9;
      }
      
      .story-item {
        display: flex;
        justify-content: space-between;
        padding: 12px;
        background: #f9fafb;
        border-radius: 8px;
        margin-bottom: 8px;
      }
      
      .story-number {
        font-weight: 600;
        color: #374151;
      }
      
      .story-stats {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      
      .new-badge {
        background: #10b981;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      
      .engaged-viewer {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        background: #f9fafb;
        border-radius: 6px;
        margin-bottom: 6px;
        align-items: center;
      }
      
      .viewer-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .viewer-name {
        font-weight: 600;
      }
      
      .viewer-display {
        color: #6b7280;
        font-size: 14px;
      }
      
      .viewer-engagement {
        position: relative;
        text-align: right;
      }
      
      .story-count {
        font-size: 14px;
        color: #4b5563;
      }
      
      .engagement-bar {
        position: absolute;
        height: 2px;
        background: #8b5cf6;
        bottom: -4px;
        right: 0;
        border-radius: 1px;
      }
      
      .export-insights-btn {
        width: 100%;
        padding: 12px;
        background: #8b5cf6;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 20px;
      }
      
      .export-insights-btn:hover {
        background: #7c3aed;
      }
      
      .no-data {
        text-align: center;
        color: #9ca3af;
        padding: 20px;
      }
    `;
    
    // Wait for document.head to be available
    if (document.head) {
      document.head.appendChild(style);
    } else {
      // If head isn't ready, wait for DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          document.head.appendChild(style);
        });
      }
    }
  }
  
  // Initialize when DOM is ready
  async function initialize() {
    // console.log('[Storylister] Extension ready');
    
    // Load account-specific data
    currentUsername = detectActiveUsername();
    const settings = await loadSettingsSync();
    await loadTaggedUsers();
    
    // Inject styles
    injectStyles();
    
    // Start data synchronization manager
    DataSyncManager.startSync();
    
    // Check if we should show the panel
    checkForStories();
    
    // Request initial data
    window.dispatchEvent(new CustomEvent('storylister:request_data'));
  }
  
  // Listen for panel show/hide events from content-backend
  window.addEventListener('storylister:show_panel', () => {
    try { 
      showRightRail(); 
    } catch (e) { 
      console.warn('[Storylister] Show panel failed', e); 
    }
  });
  
  window.addEventListener('storylister:hide_panel', () => {
    try { 
      hideRightRail(); 
    } catch (e) { 
      console.warn('[Storylister] Hide panel failed', e); 
    }
  });
  
  // Listen for story change events to reset the panel
  window.addEventListener('storylister:active_media', (e) => {
    const key = e.detail?.storyId || location.pathname;
    // Reset viewer list and counts
    viewers.clear();
    taggedUsers.clear();
    updateViewerList();
    
    // Load data from cache if available
    const store = JSON.parse(localStorage.getItem('panel_story_store') || '{}');
    const data = store[key];
    // Fixed: removed handleBundledData call that was causing runtime error
  });
  
  // Hook the backend's broadcast
  window.addEventListener('storylister:data_updated', (e) => {
    const key = e.detail?.storyId;
    if (key !== slStoreKey()) return;   // only refresh when this story updated
    loadViewersFromStorage();
  });
  
  // Helper to get story ID from URL (same as backend)
  function getCurrentStoryIdFromURL() {
    const m = location.pathname.match(/\/stories\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }
  
  function getStoryOwnerFromURL() {
    const m = location.pathname.match(/\/stories\/([^/]+)/);
    return m ? m[1] : null;
  }
  
  function slStoreKey() {
    // Must match content-backend.js
    return location.pathname;
  }
  
  // Ensure button handlers work (delegation for dynamic elements)
  // Make Manage Tags / Insights modals closeable
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-sl-close]');
    const backdrop = e.target.classList?.contains('sl-backdrop') ? e.target : null;
    if (closeBtn || backdrop) {
      // Hide any Storylister modal
      document.querySelectorAll('.sl-modal.active').forEach(el => el.classList.remove('active'));
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target.closest('#sl-manage-tags')) {
      e.preventDefault();
      if (typeof showManageTagsModal === 'function') showManageTagsModal();
    }
    
    if (e.target.closest('#sl-insights')) {
      e.preventDefault();
      if (typeof showStoryInsights === 'function') showStoryInsights();
    }
  }, true);
  
  // Chrome runtime message handler for popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
      try {
        if (req?.cmd === 'sl:toggle') {
          const rail = document.getElementById('storylister-right-rail');
          if (rail) {
            rail.classList.toggle('active');
            sendResponse({ ok: true, visible: rail.classList.contains('active') });
            return; // we already responded (no async work)
          }
        }
        if (req?.cmd === 'sl:show') {
          showRightRail?.(); 
          sendResponse({ ok: true }); 
          return;
        }
        if (req?.cmd === 'sl:hide') {
          hideRightRail?.(); 
          sendResponse({ ok: true }); 
          return;
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      // don't return true here; we already sent a response
    });
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
})();