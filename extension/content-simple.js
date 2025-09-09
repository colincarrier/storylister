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
      sort: 'recent'
    };
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
          <button class="storylister-close" onclick="this.closest('#storylister-right-rail').remove()">×</button>
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

    captureBtn.addEventListener('click', () => this.captureSnapshot());
    exportBtn.addEventListener('click', () => this.exportData());
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
    // Find all profile links that could be viewers
    const profileLinks = document.querySelectorAll('a[href*="/"][href*="/"]');
    let newViewers = 0;

    profileLinks.forEach(link => {
      const href = link.href;
      const usernameMatch = href.match(/instagram\.com\/([^\/\?]+)\/?$/);
      
      if (!usernameMatch || !usernameMatch[1] || usernameMatch[1].includes('/')) {
        return;
      }

      const username = usernameMatch[1];
      
      // Skip if already indexed
      if (this.viewers.has(username)) return;

      // Extract viewer info from the link's parent container
      const container = link.closest('div');
      if (!container) return;

      const img = container.querySelector('img');
      const textElements = container.querySelectorAll('div');
      
      let displayName = '';
      for (const textEl of textElements) {
        if (textEl.textContent && textEl.textContent.trim() && 
            textEl.textContent !== username && 
            !textEl.textContent.includes('•') &&
            textEl.textContent.length < 50) {
          displayName = textEl.textContent.trim();
          break;
        }
      }

      const viewer = {
        username,
        displayName: displayName || username,
        profilePic: img ? img.src : null,
        isVerified: container.querySelector('[aria-label*="Verified"]') !== null,
        isFollower: false, // Would need more logic to detect this
        indexedAt: Date.now()
      };

      this.viewers.set(username, viewer);
      newViewers++;
    });

    if (newViewers > 0) {
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
      <div class="storylister-viewer-item" onclick="window.open('https://instagram.com/${viewer.username}', '_blank')">
        <div class="storylister-viewer-avatar">
          ${viewer.profilePic ? 
            `<img src="${viewer.profilePic}" alt="${viewer.username}">` : 
            `<div class="storylister-avatar-placeholder">${viewer.username.charAt(0).toUpperCase()}</div>`
          }
        </div>
        <div class="storylister-viewer-info">
          <div class="storylister-viewer-username">
            ${viewer.username}
            ${viewer.isVerified ? '<span class="storylister-verified">✓</span>' : ''}
          </div>
          <div class="storylister-viewer-display-name">${viewer.displayName}</div>
        </div>
      </div>
    `).join('');
  }

  captureSnapshot() {
    const data = {
      timestamp: new Date().toISOString(),
      storyUrl: window.location.href,
      viewers: Array.from(this.viewers.values()),
      totalCount: this.viewers.size
    };

    // Store in local storage
    const snapshots = JSON.parse(localStorage.getItem('storylister-snapshots') || '[]');
    snapshots.push(data);
    localStorage.setItem('storylister-snapshots', JSON.stringify(snapshots));

    this.showToast('Snapshot captured!', 'success');
  }

  exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      storyUrl: window.location.href,
      viewers: Array.from(this.viewers.values()),
      snapshots: JSON.parse(localStorage.getItem('storylister-snapshots') || '[]')
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast('Data exported!', 'success');
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
    `;

    document.head.appendChild(style);
  }
}

// Initialize the extension
const storylistExtension = new StorylistExtension();
storylistExtension.init();

// Export for debugging
window.storylistExtension = storylistExtension;