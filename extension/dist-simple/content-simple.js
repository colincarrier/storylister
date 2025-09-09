// Storylister Chrome Extension - Content Script
// This version integrates directly with Instagram's story viewer interface

class StorylistExtension {
  constructor() {
    this.isActive = false;
    this.rightRail = null;
    this.observers = [];
    this.viewers = new Map();
    this.currentFilters = {
      query: '',
      type: 'all',
      sort: 'recent',
      tag: 'all'
    };
    this.availableTags = [
      { emoji: '❤️', label: 'Crush', id: 'crush' },
      { emoji: '🥷', label: 'Stalker', id: 'stalker' },
      { emoji: '👯', label: 'Friend', id: 'friend' },
      { emoji: '👮‍♂️', label: 'Work', id: 'work' }
    ];
  }

  init() {
    console.log('Storylister: Initializing extension');
    this.detectStoryViewer();
    this.setupGlobalObserver();
  }

  detectStoryViewer() {
    // Look for Instagram's story viewer interface
    const checkForViewer = () => {
      // Check if we're on a story URL
      if (!window.location.href.includes('/stories/')) {
        this.hideRightRail();
        return;
      }

      // Look for the "Seen by" text or viewer list
      const seenByElements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && el.textContent.includes('Seen by')
      );

      if (seenByElements.length > 0 && !this.isActive) {
        console.log('Storylister: Story viewer detected');
        this.showRightRail();
      } else if (seenByElements.length === 0 && this.isActive) {
        this.hideRightRail();
      }
    };

    // Check immediately and then periodically
    checkForViewer();
    setInterval(checkForViewer, 1000);
  }

  setupGlobalObserver() {
    // Watch for URL changes (Instagram is a SPA)
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => this.detectStoryViewer(), 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  showRightRail() {
    if (this.rightRail) return;

    this.isActive = true;
    this.createRightRail();
    this.indexViewers();
    this.setupViewerObserver();
  }

  hideRightRail() {
    if (this.rightRail) {
      this.rightRail.remove();
      this.rightRail = null;
    }
    this.isActive = false;
    this.viewers.clear();
  }

  createRightRail() {
    this.rightRail = document.createElement('div');
    this.rightRail.id = 'storylister-right-rail';
    this.rightRail.innerHTML = `
      <div class="storylister-panel">
        <div class="storylister-header">
          <div class="storylister-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Storylister</span>
          </div>
          <button class="storylister-close" id="storylister-close-btn">×</button>
        </div>
        
        <div class="storylister-content">
          <div class="storylister-search">
            <input type="text" placeholder="Search viewers..." id="storylister-search-input">
          </div>
          
          <div class="storylister-filters">
            <select id="storylister-filter-type">
              <option value="all">All viewers</option>
              <option value="followers">Followers only</option>
              <option value="non-followers">Non-followers</option>
              <option value="verified">Verified</option>
            </select>
            
            <select id="storylister-sort">
              <option value="recent">Recent first</option>
              <option value="alphabetical">A-Z</option>
              <option value="active">Most active</option>
            </select>
          </div>
          
          <div class="storylister-tag-filter">
            <select id="storylister-filter-tag">
              <option value="all">All tags</option>
              <option value="crush">❤️ Crush</option>
              <option value="stalker">🥷 Stalker</option>
              <option value="friend">👯 Friend</option>
              <option value="work">👮‍♂️ Work</option>
              <option value="untagged">No tags</option>
            </select>
          </div>
          
          <div class="storylister-stats">
            <span id="storylister-viewer-count">0 viewers found</span>
            <div class="storylister-actions">
              <button id="storylister-capture">📸 Capture</button>
              <button id="storylister-export">📊 Export</button>
            </div>
          </div>
          
          <div class="storylister-results" id="storylister-results">
            <div class="storylister-empty">
              Click "Seen by" to start indexing viewers
            </div>
          </div>
        </div>
      </div>
    `;

    // Position the right rail
    this.rightRail.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      width: 300px;
      max-height: calc(100vh - 100px);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(this.rightRail);
    this.setupRightRailEvents();
    this.loadStyles();
  }

  setupRightRailEvents() {
    const searchInput = this.rightRail.querySelector('#storylister-search-input');
    const filterType = this.rightRail.querySelector('#storylister-filter-type');
    const sortSelect = this.rightRail.querySelector('#storylister-sort');
    const tagFilter = this.rightRail.querySelector('#storylister-filter-tag');
    const captureBtn = this.rightRail.querySelector('#storylister-capture');
    const exportBtn = this.rightRail.querySelector('#storylister-export');

    searchInput.addEventListener('input', (e) => {
      this.currentFilters.query = e.target.value;
      this.updateResults();
    });

    filterType.addEventListener('change', (e) => {
      this.currentFilters.type = e.target.value;
      this.updateResults();
    });

    sortSelect.addEventListener('change', (e) => {
      this.currentFilters.sort = e.target.value;
      this.updateResults();
    });

    tagFilter.addEventListener('change', (e) => {
      this.currentFilters.tag = e.target.value;
      this.updateResults();
    });

    captureBtn.addEventListener('click', () => this.captureSnapshot());
    exportBtn.addEventListener('click', () => this.showAnalytics());

    // Add close button handler
    const closeBtn = this.rightRail.querySelector('#storylister-close-btn');
    closeBtn.addEventListener('click', () => this.hideRightRail());
  }

  setupViewerObserver() {
    // Watch for viewer list changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          // Small delay to let Instagram finish rendering
          setTimeout(() => this.indexViewers(), 100);
        }
      });
    });

    // Observe the entire document for viewer list changes
    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  indexViewers() {
    // Find viewer list container - Instagram uses specific structure for viewer lists
    const viewerListSelectors = [
      'div[role="dialog"] div[style*="overflow"]', // Common viewer list container
      'div[role="dialog"] ul', // Alternative list structure
      'div[style*="max-height"] div[style*="flex-direction: column"]' // Scrollable viewer container
    ];
    
    let viewerContainer = null;
    for (const selector of viewerListSelectors) {
      const container = document.querySelector(selector);
      if (container && container.querySelector('a[href*="/"]')) {
        viewerContainer = container;
        break;
      }
    }

    if (!viewerContainer) {
      console.log('Storylister: Viewer container not found');
      return;
    }

    // Find all profile links within the viewer container
    const profileLinks = viewerContainer.querySelectorAll('a[href*="/"]');
    let newViewers = 0;

    profileLinks.forEach(link => {
      const href = link.href;
      const usernameMatch = href.match(/instagram\.com\/([^\/\?]+)\/?$/);
      
      if (!usernameMatch || !usernameMatch[1] || 
          usernameMatch[1].includes('/') || 
          usernameMatch[1] === 'explore' || 
          usernameMatch[1] === 'reels') {
        return;
      }

      const username = usernameMatch[1];
      
      // Get existing viewer data or create new
      const existingViewer = this.viewers.get(username);
      
      // Extract viewer info from the link's parent container
      const container = link.closest('div[role="button"]') || link.parentElement?.parentElement;
      if (!container) return;

      const img = container.querySelector('img[alt*="profile"]') || container.querySelector('img');
      const textElements = container.querySelectorAll('span');
      
      let displayName = '';
      let followStatus = '';
      
      textElements.forEach(textEl => {
        const text = textEl.textContent?.trim();
        if (text && text !== username) {
          if (text === 'Follow' || text === 'Following' || text === 'Requested') {
            followStatus = text;
          } else if (!text.includes('•') && text.length < 50 && !displayName) {
            displayName = text;
          }
        }
      });

      // Load saved tags from localStorage
      const savedTags = JSON.parse(localStorage.getItem('storylister-tags') || '{}');
      const userTags = savedTags[username] || [];

      const viewer = {
        username,
        displayName: displayName || existingViewer?.displayName || username,
        profilePic: img ? img.src : existingViewer?.profilePic || null,
        isVerified: container.querySelector('[aria-label*="Verified"]') !== null,
        isFollower: followStatus === 'Following',
        followStatus,
        tags: userTags,
        indexedAt: existingViewer?.indexedAt || Date.now(),
        lastSeen: Date.now()
      };

      this.viewers.set(username, viewer);
      if (!existingViewer) newViewers++;
    });

    if (newViewers > 0 || profileLinks.length > 0) {
      console.log(`Storylister: Indexed ${newViewers} new viewers (${this.viewers.size} total)`);
      this.updateResults();
    }
  }

  updateResults() {
    const resultsContainer = this.rightRail.querySelector('#storylister-results');
    const viewerCountEl = this.rightRail.querySelector('#storylister-viewer-count');
    
    // Filter and sort viewers
    let filteredViewers = Array.from(this.viewers.values());

    // Apply text search
    if (this.currentFilters.query) {
      const query = this.currentFilters.query.toLowerCase();
      filteredViewers = filteredViewers.filter(viewer => 
        viewer.username.toLowerCase().includes(query) ||
        viewer.displayName.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    switch (this.currentFilters.type) {
      case 'followers':
        filteredViewers = filteredViewers.filter(v => v.isFollower);
        break;
      case 'non-followers':
        filteredViewers = filteredViewers.filter(v => !v.isFollower);
        break;
      case 'verified':
        filteredViewers = filteredViewers.filter(v => v.isVerified);
        break;
    }

    // Apply tag filter
    switch (this.currentFilters.tag) {
      case 'all':
        // Show all
        break;
      case 'untagged':
        filteredViewers = filteredViewers.filter(v => !v.tags || v.tags.length === 0);
        break;
      default:
        filteredViewers = filteredViewers.filter(v => v.tags && v.tags.includes(this.currentFilters.tag));
        break;
    }

    // Apply sorting
    switch (this.currentFilters.sort) {
      case 'alphabetical':
        filteredViewers.sort((a, b) => a.username.localeCompare(b.username));
        break;
      case 'recent':
        filteredViewers.sort((a, b) => b.indexedAt - a.indexedAt);
        break;
      case 'active':
        // For now, just use recent
        filteredViewers.sort((a, b) => b.indexedAt - a.indexedAt);
        break;
    }

    // Update count
    viewerCountEl.textContent = `${filteredViewers.length} viewer${filteredViewers.length !== 1 ? 's' : ''} found`;

    // Update results
    if (filteredViewers.length === 0) {
      resultsContainer.innerHTML = `
        <div class="storylister-empty">
          ${this.viewers.size === 0 ? 'Click "Seen by" to start indexing viewers' : 'No viewers match your search'}
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = filteredViewers.map(viewer => `
      <div class="storylister-viewer-item" data-username="${viewer.username}">
        <div class="storylister-viewer-avatar" onclick="window.open('https://instagram.com/${viewer.username}', '_blank')">
          ${viewer.profilePic ? 
            `<img src="${viewer.profilePic}" alt="${viewer.username}">` : 
            `<div class="storylister-avatar-placeholder">${viewer.username.charAt(0).toUpperCase()}</div>`
          }
        </div>
        <div class="storylister-viewer-info" onclick="window.open('https://instagram.com/${viewer.username}', '_blank')">
          <div class="storylister-viewer-username">
            ${viewer.username}
            ${viewer.isVerified ? '<span class="storylister-verified">✓</span>' : ''}
          </div>
          <div class="storylister-viewer-display-name">${viewer.displayName}</div>
        </div>
        <div class="storylister-viewer-tags">
          ${this.availableTags.map(tag => `
            <button class="storylister-tag ${viewer.tags && viewer.tags.includes(tag.id) ? 'active' : ''}" 
                    data-tag="${tag.id}" 
                    title="${tag.label}">
              ${tag.emoji}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    // Add tag click handlers
    resultsContainer.querySelectorAll('.storylister-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const username = e.target.closest('.storylister-viewer-item').dataset.username;
        const tagId = e.target.dataset.tag;
        this.toggleTag(username, tagId);
      });
    });
  }

  toggleTag(username, tagId) {
    const viewer = this.viewers.get(username);
    if (!viewer) return;

    // Load current tags
    const savedTags = JSON.parse(localStorage.getItem('storylister-tags') || '{}');
    const userTags = savedTags[username] || [];

    // Toggle the tag
    const tagIndex = userTags.indexOf(tagId);
    if (tagIndex > -1) {
      userTags.splice(tagIndex, 1);
    } else {
      userTags.push(tagId);
    }

    // Save to localStorage
    savedTags[username] = userTags;
    localStorage.setItem('storylister-tags', JSON.stringify(savedTags));

    // Update viewer object
    viewer.tags = userTags;
    this.viewers.set(username, viewer);

    // Update UI
    this.updateResults();
  }

  captureSnapshot() {
    const data = {
      timestamp: new Date().toISOString(),
      storyUrl: window.location.href,
      storyAuthor: window.location.pathname.split('/')[2] || 'unknown',
      viewers: Array.from(this.viewers.values()),
      totalCount: this.viewers.size
    };

    // Store in local storage
    const snapshots = JSON.parse(localStorage.getItem('storylister-snapshots') || '[]');
    snapshots.push(data);
    localStorage.setItem('storylister-snapshots', JSON.stringify(snapshots));

    this.showToast(`Snapshot captured! ${this.viewers.size} viewers saved`, 'success');
  }

  showAnalytics() {
    // Create analytics modal
    const modal = document.createElement('div');
    modal.id = 'storylister-analytics-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000001;
    `;

    const viewerData = Array.from(this.viewers.values());
    const snapshots = JSON.parse(localStorage.getItem('storylister-snapshots') || '[]');
    
    // Calculate analytics
    const tagCounts = {};
    this.availableTags.forEach(tag => {
      tagCounts[tag.id] = viewerData.filter(v => v.tags && v.tags.includes(tag.id)).length;
    });

    const verifiedCount = viewerData.filter(v => v.isVerified).length;
    const followerCount = viewerData.filter(v => v.isFollower).length;

    modal.innerHTML = `
      <div class="storylister-analytics-content">
        <div class="storylister-analytics-header">
          <h2>📊 Storylister Analytics</h2>
          <button class="storylister-close" data-action="close-modal">×</button>
        </div>
        
        <div class="storylister-analytics-body">
          <div class="storylister-stats-grid">
            <div class="storylister-stat-card">
              <div class="storylister-stat-value">${this.viewers.size}</div>
              <div class="storylister-stat-label">Total Viewers</div>
            </div>
            <div class="storylister-stat-card">
              <div class="storylister-stat-value">${followerCount}</div>
              <div class="storylister-stat-label">Followers</div>
            </div>
            <div class="storylister-stat-card">
              <div class="storylister-stat-value">${verifiedCount}</div>
              <div class="storylister-stat-label">Verified</div>
            </div>
            <div class="storylister-stat-card">
              <div class="storylister-stat-value">${snapshots.length}</div>
              <div class="storylister-stat-label">Snapshots</div>
            </div>
          </div>

          <div class="storylister-tag-stats">
            <h3>Tag Distribution</h3>
            <div class="storylister-tag-bars">
              ${this.availableTags.map(tag => {
                const count = tagCounts[tag.id];
                const percentage = this.viewers.size > 0 ? (count / this.viewers.size * 100).toFixed(1) : 0;
                return `
                  <div class="storylister-tag-bar">
                    <div class="storylister-tag-bar-label">
                      <span>${tag.emoji} ${tag.label}</span>
                      <span>${count}</span>
                    </div>
                    <div class="storylister-tag-bar-track">
                      <div class="storylister-tag-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="storylister-snapshot-history">
            <h3>Recent Snapshots</h3>
            ${snapshots.length > 0 ? `
              <div class="storylister-snapshot-list">
                ${snapshots.slice(-5).reverse().map(snap => `
                  <div class="storylister-snapshot-item">
                    <div class="storylister-snapshot-info">
                      <strong>@${snap.storyAuthor || 'unknown'}</strong>
                      <span>${new Date(snap.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="storylister-snapshot-count">${snap.totalCount} viewers</div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="storylister-empty">No snapshots yet. Use the 📸 Capture button to save viewer lists.</p>'}
          </div>

          <div class="storylister-analytics-actions">
            <button class="storylister-btn-primary" data-action="export-report">Export Full Report</button>
            <button class="storylister-btn-secondary" data-action="clear-history">Clear History</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event handlers for analytics modal
    modal.querySelector('[data-action="close-modal"]').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('[data-action="export-report"]').addEventListener('click', () => {
      const data = {
        analytics: {
          totalViewers: this.viewers.size,
          followers: followerCount,
          verified: verifiedCount,
          tagDistribution: tagCounts
        },
        viewers: viewerData,
        snapshots: snapshots
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storylister-analytics-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    modal.querySelector('[data-action="clear-history"]').addEventListener('click', () => {
      if(confirm('This will clear all snapshots. Are you sure?')) {
        localStorage.removeItem('storylister-snapshots');
        modal.remove();
        this.showToast('History cleared', 'success');
      }
    });
  }

  exportData() {
    this.showAnalytics();
  }

  showToast(message, type) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 340px;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 1000000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  loadStyles() {
    if (document.getElementById('storylister-styles')) return;

    const style = document.createElement('style');
    style.id = 'storylister-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }

      .storylister-panel {
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        border: 1px solid #e5e7eb;
      }

      .storylister-header {
        background: #f9fafb;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .storylister-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: #8b5cf6;
      }

      .storylister-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #6b7280;
        padding: 4px;
        border-radius: 4px;
      }

      .storylister-close:hover {
        background: #e5e7eb;
      }

      .storylister-content {
        padding: 16px;
      }

      .storylister-search input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 14px;
        margin-bottom: 12px;
      }

      .storylister-search input:focus {
        outline: none;
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
      }

      .storylister-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      .storylister-filters select {
        flex: 1;
        padding: 6px 8px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 12px;
        background: white;
      }

      .storylister-stats {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        font-size: 12px;
        color: #6b7280;
      }

      .storylister-actions {
        display: flex;
        gap: 6px;
      }

      .storylister-actions button {
        padding: 4px 8px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        background: white;
        font-size: 11px;
        cursor: pointer;
      }

      .storylister-actions button:hover {
        background: #f3f4f6;
      }

      .storylister-results {
        max-height: 400px;
        overflow-y: auto;
      }

      .storylister-viewer-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .storylister-viewer-item:hover {
        background: #f3f4f6;
      }

      .storylister-viewer-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
      }

      .storylister-viewer-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .storylister-avatar-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(45deg, #8b5cf6, #3b82f6);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
      }

      .storylister-viewer-info {
        flex: 1;
        min-width: 0;
      }

      .storylister-viewer-username {
        font-weight: 500;
        font-size: 14px;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .storylister-verified {
        color: #3b82f6;
        font-weight: bold;
      }

      .storylister-viewer-display-name {
        font-size: 12px;
        color: #6b7280;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .storylister-empty {
        text-align: center;
        color: #6b7280;
        font-size: 14px;
        padding: 20px;
      }

      .storylister-tag-filter {
        margin-bottom: 12px;
      }

      .storylister-tag-filter select {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 12px;
        background: white;
      }

      .storylister-viewer-tags {
        display: flex;
        gap: 4px;
        margin-left: auto;
      }

      .storylister-tag {
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .storylister-tag:hover {
        background: #e5e7eb;
        transform: scale(1.1);
      }

      .storylister-tag.active {
        background: #8b5cf6;
        border-color: #8b5cf6;
      }

      .storylister-analytics-content {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
      }

      .storylister-analytics-header {
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .storylister-analytics-header h2 {
        margin: 0;
        font-size: 20px;
        color: #111827;
      }

      .storylister-analytics-body {
        padding: 20px;
      }

      .storylister-stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 24px;
      }

      .storylister-stat-card {
        background: #f9fafb;
        padding: 16px;
        border-radius: 8px;
        text-align: center;
      }

      .storylister-stat-value {
        font-size: 28px;
        font-weight: bold;
        color: #8b5cf6;
      }

      .storylister-stat-label {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }

      .storylister-tag-stats {
        margin-bottom: 24px;
      }

      .storylister-tag-stats h3 {
        font-size: 16px;
        margin-bottom: 12px;
        color: #111827;
      }

      .storylister-tag-bar {
        margin-bottom: 12px;
      }

      .storylister-tag-bar-label {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-size: 14px;
      }

      .storylister-tag-bar-track {
        background: #f3f4f6;
        height: 24px;
        border-radius: 4px;
        overflow: hidden;
      }

      .storylister-tag-bar-fill {
        background: linear-gradient(90deg, #8b5cf6, #3b82f6);
        height: 100%;
        transition: width 0.3s;
      }

      .storylister-snapshot-history h3 {
        font-size: 16px;
        margin-bottom: 12px;
        color: #111827;
      }

      .storylister-snapshot-list {
        background: #f9fafb;
        border-radius: 8px;
        padding: 12px;
      }

      .storylister-snapshot-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .storylister-snapshot-item:last-child {
        border-bottom: none;
      }

      .storylister-snapshot-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .storylister-snapshot-info strong {
        color: #111827;
        font-size: 14px;
      }

      .storylister-snapshot-info span {
        color: #6b7280;
        font-size: 12px;
      }

      .storylister-snapshot-count {
        background: #8b5cf6;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
      }

      .storylister-analytics-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }

      .storylister-btn-primary {
        flex: 1;
        background: #8b5cf6;
        color: white;
        border: none;
        padding: 12px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }

      .storylister-btn-primary:hover {
        background: #7c3aed;
      }

      .storylister-btn-secondary {
        flex: 1;
        background: white;
        color: #ef4444;
        border: 1px solid #ef4444;
        padding: 12px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .storylister-btn-secondary:hover {
        background: #fef2f2;
      }
    `;

    document.head.appendChild(style);
  }
}

// Initialize the extension
const storylistExtension = new StorylistExtension();
storylistExtension.init();

// Export for debugging
window.storylistExtension = storylistExtension;