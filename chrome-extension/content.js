// Storylister Chrome Extension - UI Layer
// This script renders the exact UI from mock-instagram and reads data from localStorage

(function() {
  console.log('[Storylister] Initializing extension UI');
  
  // State management
  let isActive = false;
  let rightRail = null;
  let viewers = new Map();
  let currentStory = 0;
  let currentFilters = {
    query: '',
    type: 'all',
    sort: 'recent',
    showTagged: false
  };
  let taggedUsers = new Set();
  let isProMode = false;
  
  // Custom tags for Pro mode
  const customTags = [
    { id: 'crush', emoji: '❤️', label: 'Crush' },
    { id: 'cop', emoji: '👮‍♂️', label: 'Cop' },
    { id: 'friend', emoji: '👯', label: 'Friend' },
    { id: 'coworker', emoji: '💼', label: 'Coworker' }
  ];
  
  // Load tagged users from localStorage
  function loadTaggedUsers() {
    try {
      const stored = localStorage.getItem('storylister_tagged_users');
      taggedUsers = stored ? new Set(JSON.parse(stored)) : new Set();
    } catch (e) {
      taggedUsers = new Set();
    }
  }
  
  // Save tagged users to localStorage
  function saveTaggedUsers() {
    localStorage.setItem('storylister_tagged_users', JSON.stringify(Array.from(taggedUsers)));
  }
  
  // Inject the network interceptor
  function injectInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('[Storylister] Injected network interceptor');
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
  
  // Get filtered viewers
  function getFilteredViewers() {
    let filteredViewers = Array.from(viewers.values());

    // Apply text search
    if (currentFilters.query) {
      const query = currentFilters.query.toLowerCase();
      filteredViewers = filteredViewers.filter(viewer => 
        viewer.username.toLowerCase().includes(query) ||
        viewer.displayName.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    switch (currentFilters.type) {
      case 'followers':
        filteredViewers = filteredViewers.filter(v => v.isFollower);
        break;
      case 'non-followers':
        filteredViewers = filteredViewers.filter(v => !v.isFollower);
        break;
      case 'following':
        filteredViewers = filteredViewers.filter(v => v.isFollowing);
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
    if (currentFilters.sort === 'oldest') {
      filteredViewers.sort((a, b) => a.viewedAt - b.viewedAt);
    } else {
      filteredViewers.sort((a, b) => b.viewedAt - a.viewedAt);
    }

    return filteredViewers;
  }
  
  // Load viewers from localStorage
  function loadViewersFromStorage() {
    try {
      // Load from panel_story_store
      const storyStore = localStorage.getItem('panel_story_store');
      if (storyStore) {
        const parsed = JSON.parse(storyStore);
        const storyId = Object.keys(parsed)[0]; // Get first story
        
        if (storyId && parsed[storyId] && parsed[storyId].viewers) {
          viewers.clear();
          
          parsed[storyId].viewers.forEach(([id, viewer]) => {
            viewers.set(viewer.username, {
              username: viewer.username,
              displayName: viewer.full_name || viewer.username,
              profilePic: viewer.profile_pic_url || `https://i.pravatar.cc/150?u=${viewer.username}`,
              isVerified: viewer.is_verified || false,
              isFollower: viewer.followed_by_viewer || false,
              isFollowing: viewer.follows_viewer || false,
              isTagged: taggedUsers.has(viewer.username),
              viewedAt: viewer.timestamp || Date.now()
            });
          });
          
          console.log(`[Storylister] Loaded ${viewers.size} viewers from localStorage`);
        }
      }
      
      // Load from panel_viewer_cache as fallback
      if (viewers.size === 0) {
        const viewerCache = localStorage.getItem('panel_viewer_cache');
        if (viewerCache) {
          const cached = JSON.parse(viewerCache);
          Object.entries(cached).forEach(([username, viewer]) => {
            viewers.set(username, {
              username: username,
              displayName: viewer.full_name || viewer.displayName || username,
              profilePic: viewer.profile_pic_url || `https://i.pravatar.cc/150?u=${username}`,
              isVerified: viewer.is_verified || false,
              isFollower: viewer.followed_by_viewer || viewer.isFollower || false,
              isFollowing: viewer.follows_viewer || viewer.isFollowing || false,
              isTagged: taggedUsers.has(username),
              viewedAt: viewer.timestamp || Date.now()
            });
          });
          console.log(`[Storylister] Loaded ${viewers.size} viewers from cache`);
        }
      }
    } catch (e) {
      console.error('[Storylister] Error loading viewers:', e);
    }
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
      viewedAt: new Date(v.viewedAt).toISOString(),
      story: currentStory + 1
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  // Update viewer list UI
  function updateViewerList() {
    const listElement = document.getElementById('sl-list');
    if (!listElement) return;
    
    const filteredViewers = getFilteredViewers();
    
    // Update stats
    const totalViewers = viewers.size;
    const totalVerified = Array.from(viewers.values()).filter(v => v.isVerified).length;
    const taggedInCurrentStory = Array.from(viewers.values()).filter(v => v.isTagged).length;
    
    document.getElementById('sl-viewer-count').textContent = totalViewers;
    document.getElementById('sl-verified-count').textContent = totalVerified;
    document.getElementById('sl-tagged-count').textContent = `${taggedInCurrentStory}/${taggedUsers.size}`;
    document.getElementById('sl-filtered-count').textContent = `${filteredViewers.length} viewers found`;
    
    // Clear and rebuild list
    listElement.innerHTML = '';
    
    if (filteredViewers.length === 0) {
      listElement.innerHTML = `
        <div class="storylister-empty">
          <div class="storylister-empty-icon">👁️</div>
          <div class="storylister-empty-text">No viewers found</div>
        </div>
      `;
      return;
    }
    
    filteredViewers.forEach(viewer => {
      const viewerEl = document.createElement('div');
      viewerEl.className = 'storylister-viewer-item';
      viewerEl.innerHTML = `
        <div class="storylister-viewer-avatar" data-username="${viewer.username}">
          <img src="${viewer.profilePic}" alt="${viewer.username}">
        </div>
        <div class="storylister-viewer-info">
          <div class="storylister-viewer-username" data-username="${viewer.username}">
            ${viewer.username}
            ${viewer.isVerified ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2" style="display: inline; vertical-align: middle; margin-left: 4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
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
              <button id="sl-pro-toggle" class="storylister-pro-toggle">
                ${isProMode ? 'Pro' : 'Free'}
              </button>
              <button id="sl-close" class="storylister-close">×</button>
            </div>
          </div>
          
          <div class="storylister-story-section">
            <div class="storylister-story-indicator">
              Analyzing Story
            </div>
            <button class="story-insights-btn-small">
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
              <button class="storylister-manage-tags">
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
  
  // Show right rail
  function showRightRail() {
    if (!rightRail) {
      rightRail = createRightRail();
      setupEventListeners();
    }
    
    rightRail.classList.add('active');
    isActive = true;
    
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
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Close button
    document.getElementById('sl-close')?.addEventListener('click', hideRightRail);
    
    // Pro toggle
    document.getElementById('sl-pro-toggle')?.addEventListener('click', (e) => {
      isProMode = !isProMode;
      e.target.textContent = isProMode ? 'Pro' : 'Free';
      e.target.classList.toggle('pro', isProMode);
      updateViewerList();
    });
    
    // Search
    document.getElementById('sl-search')?.addEventListener('input', (e) => {
      currentFilters.query = e.target.value;
      updateViewerList();
    });
    
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
    
    // Sort toggle
    document.getElementById('sl-sort')?.addEventListener('click', (e) => {
      currentFilters.sort = currentFilters.sort === 'recent' ? 'oldest' : 'recent';
      e.target.textContent = currentFilters.sort === 'recent' ? '↓ Newest' : '↑ Oldest';
      updateViewerList();
    });
    
    // Export
    document.getElementById('sl-export')?.addEventListener('click', exportData);
    
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
        console.log(`[Storylister] Would open profile: @${username}`);
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
  }
  
  // Check if on stories page
  function checkForStories() {
    const isStoriesPage = window.location.pathname.includes('/stories/');
    
    if (isStoriesPage && !isActive) {
      showRightRail();
    } else if (!isStoriesPage && isActive) {
      hideRightRail();
    }
  }
  
  // Listen for data updates
  window.addEventListener('storylister:data_updated', (e) => {
    console.log('[Storylister] Data updated:', e.detail);
    loadViewersFromStorage();
    updateViewerList();
  });
  
  // Monitor URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      checkForStories();
    }
  }, 1000);
  
  // Initialize
  console.log('[Storylister] Extension ready');
  loadTaggedUsers();
  injectInterceptor();
  checkForStories();
  
  // Request initial data
  window.dispatchEvent(new CustomEvent('storylister:request_data'));
  
})();