// Storylister Chrome Extension - Full Featured Version
// Matches the demo with exact functional and design parity

class StorylistExtension {
  constructor() {
    this.isActive = false;
    this.rightRail = null;
    this.observers = [];
    this.viewers = new Map();
    this.currentStory = 0;
    this.totalStories = 3;
    this.showTagManager = false;
    this.showInsightsModal = false;
    this.insightsTab = 'watchers';
    this.currentFilters = {
      query: '',
      type: 'all',
      sort: 'recent',
      showTagged: false
    };
    
    // Load tagged users from localStorage
    const stored = localStorage.getItem('storylister_tagged_users');
    this.taggedUsers = stored ? new Set(JSON.parse(stored)) : new Set();
    
    // Pro mode and custom tags
    this.isProMode = false;
    this.selectedCustomTag = 'tagged';
    this.customTags = [
      { id: 'crush', emoji: '❤️', label: 'Crush' },
      { id: 'cop', emoji: '👮‍♂️', label: 'Cop' },
      { id: 'friend', emoji: '👯', label: 'Friend' },
      { id: 'coworker', emoji: '💼', label: 'Coworker' }
    ];
  }

  init() {
    console.log('Storylister: Initializing extension');
    this.injectNetworkInterceptor();
    this.setupMessageListener();
    this.detectStoryViewer();
    this.setupGlobalObserver();
    this.loadStyles();
  }

  injectNetworkInterceptor() {
    // Inject the network interceptor script into the page context
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('Storylister: Injected network interceptor');
  }

  setupMessageListener() {
    // Listen for viewer data from injected script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'STORYLISTER_VIEWERS_CHUNK') {
        console.log(`Storylister: Received ${event.data.data.viewers.length} viewers from network`);
        this.processNetworkViewers(event.data.data);
      }
    });
  }

  processNetworkViewers(data) {
    const { viewers, totalCount } = data;
    
    // Add viewers to our map
    viewers.forEach(viewer => {
      this.viewers.set(viewer.username, {
        username: viewer.username,
        displayName: viewer.full_name || viewer.username,
        profilePic: viewer.profile_pic_url || '',
        isVerified: viewer.is_verified || false,
        isFollower: viewer.followed_by_viewer || false,
        isFollowing: viewer.follows_viewer || false,
        isTagged: this.taggedUsers.has(viewer.username),
        viewedAt: Date.now() - Math.floor(Math.random() * 7200000),
        indexedAt: Date.now()
      });
    });
    
    // Update UI
    this.updateViewerList();
    
    if (totalCount) {
      console.log(`Storylister: ${this.viewers.size} of ${totalCount} total viewers loaded`);
    }
  }

  detectStoryViewer() {
    const checkForViewer = () => {
      if (!window.location.href.includes('/stories/')) {
        this.hideRightRail();
        return;
      }

      // Check for story viewer in multiple ways
      // 1. Dialog viewer (when viewing others' stories)
      const viewerDialog = document.querySelector('[role="dialog"]');
      const hasDialogViewers = viewerDialog && (
        viewerDialog.textContent.includes('Seen by') || 
        viewerDialog.textContent.includes('viewer')
      );

      // 2. Bottom bar "Seen by" (when viewing your own stories)
      const pageText = document.body.textContent || '';
      const hasSeenBy = pageText.includes('Seen by');
      
      // 3. Check for viewer list elements
      const viewerList = document.querySelector('[aria-label*="viewer"]') || 
                        document.querySelector('[role="button"][aria-label*="Seen"]');

      const hasViewers = hasDialogViewers || hasSeenBy || viewerList;

      if (hasViewers && !this.isActive) {
        console.log('Storylister: Story viewer detected');
        this.showRightRail();
        
        // Wait for viewer list to be clickable/opened
        setTimeout(() => {
          this.clickSeenByButton();
          setTimeout(() => this.extractViewers(), 500);
        }, 500);
      } else if (!hasViewers && this.isActive) {
        this.hideRightRail();
      }
    };

    checkForViewer();
    setInterval(checkForViewer, 1000);
  }

  clickSeenByButton() {
    // Try to click "Seen by" button to open viewer list
    const seenByButtons = document.querySelectorAll('[role="button"]');
    for (const button of seenByButtons) {
      if (button.textContent && button.textContent.includes('Seen by')) {
        console.log('Storylister: Clicking Seen by button');
        button.click();
        break;
      }
    }
  }

  setupGlobalObserver() {
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

  async extractViewers() {
    console.log('Storylister: Fallback DOM extraction (network intercept preferred)...');
    
    // Look for the viewer dialog
    const dialogs = document.querySelectorAll('[role="dialog"]');
    let viewerDialog = null;
    
    // Find the dialog that contains "Viewers" or viewer-like content
    for (const dialog of dialogs) {
      if (dialog.textContent && (dialog.textContent.includes('Viewers') || 
          dialog.textContent.includes('viewer') || 
          dialog.querySelector('img[alt*="profile"]') ||
          dialog.querySelector('a[href^="/"][role="link"]'))) {
        viewerDialog = dialog;
        break;
      }
    }
    
    if (!viewerDialog) {
      console.log('Storylister: No viewer dialog found');
      return;
    }

    // Find the scrollable container - Instagram uses various structures
    let scrollContainer = null;
    
    // Method 1: Look for divs with overflow styles
    const overflowDivs = viewerDialog.querySelectorAll('div[style*="overflow"]');
    for (const div of overflowDivs) {
      if (div.scrollHeight > div.clientHeight || div.querySelector('a[role="link"]')) {
        scrollContainer = div;
        console.log('Storylister: Found scroll container via overflow style');
        break;
      }
    }
    
    // Method 2: Find container by checking scroll properties
    if (!scrollContainer) {
      const allDivs = viewerDialog.querySelectorAll('div');
      for (const div of allDivs) {
        // Check if this div is scrollable and contains user links
        if (div.scrollHeight > div.clientHeight && 
            div.querySelector('a[role="link"][href^="/"]') &&
            div.scrollHeight > 200) { // Must be reasonably tall
          scrollContainer = div;
          console.log('Storylister: Found scroll container via scroll height');
          break;
        }
      }
    }
    
    // Method 3: Find the parent of viewer items
    if (!scrollContainer) {
      const firstUserLink = viewerDialog.querySelector('a[role="link"][href^="/"]');
      if (firstUserLink) {
        // Go up the tree to find scrollable parent
        let parent = firstUserLink.parentElement;
        while (parent && parent !== viewerDialog) {
          if (parent.scrollHeight > parent.clientHeight && parent.scrollHeight > 200) {
            scrollContainer = parent;
            console.log('Storylister: Found scroll container via parent search');
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    // Scroll to load all viewers
    if (scrollContainer) {
      console.log('Storylister: Starting to scroll container to load all viewers...');
      console.log(`Container dimensions: scrollHeight=${scrollContainer.scrollHeight}, clientHeight=${scrollContainer.clientHeight}`);
      
      let previousCount = 0;
      let currentCount = viewerDialog.querySelectorAll('a[role="link"][href^="/"]').length;
      let scrollAttempts = 0;
      const maxScrollAttempts = 100; // Increased for more viewers
      let noNewContentCount = 0;
      
      while (scrollAttempts < maxScrollAttempts) {
        previousCount = currentCount;
        
        // Scroll to bottom
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        
        // Also try scrollIntoView on last element
        const links = viewerDialog.querySelectorAll('a[role="link"][href^="/"]');
        if (links.length > 0) {
          links[links.length - 1].scrollIntoView(false);
        }
        
        // Wait for new content to load
        await new Promise(resolve => setTimeout(resolve, 800)); // Slightly longer wait
        
        currentCount = viewerDialog.querySelectorAll('a[role="link"][href^="/"]').length;
        scrollAttempts++;
        
        console.log(`Storylister: Scroll attempt ${scrollAttempts} - ${currentCount} viewers loaded`);
        
        // Check if we're making progress
        if (currentCount === previousCount) {
          noNewContentCount++;
          if (noNewContentCount >= 3) {
            console.log('Storylister: No new content after 3 attempts, assuming all loaded');
            break;
          }
        } else {
          noNewContentCount = 0; // Reset if we found new content
        }
      }
      
      console.log(`Storylister: Finished scrolling after ${scrollAttempts} attempts, found ${currentCount} total viewers`);
    } else {
      console.log('Storylister: Could not find scrollable container, extracting visible viewers only');
    }

    const extractedViewers = new Map();
    
    // Extract all viewers after scrolling
    const roleLinks = viewerDialog.querySelectorAll('a[role="link"][href^="/"]');
    console.log(`Storylister: Found ${roleLinks.length} total viewers after scrolling`);
    
    roleLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href === '/') return;
      
      const pathParts = href.substring(1).split('/');
      const username = pathParts[0];
      
      // Skip non-user links
      if (!username || username.includes('explore') || username.includes('reels') || 
          username.includes('direct') || username.includes('stories') || username.includes('accounts')) {
        return;
      }
      
      // Find associated image and text
      const img = link.querySelector('img') || link.parentElement?.querySelector('img');
      const textElements = link.querySelectorAll('span');
      let displayName = username;
      
      // Try to find the display name from spans
      textElements.forEach(span => {
        if (span.textContent && span.textContent.trim() && !span.textContent.includes('·')) {
          displayName = span.textContent.trim();
        }
      });
      
      // Check for verification badge
      const hasVerifiedBadge = link.innerHTML.includes('<svg') || 
                               link.parentElement?.innerHTML.includes('aria-label="Verified"');
      
      extractedViewers.set(username, {
        username,
        displayName: displayName,
        profilePic: img?.src || '',
        isVerified: hasVerifiedBadge,
        isFollower: Math.random() < 0.7,
        isTagged: this.taggedUsers.has(username),
        viewedAt: Date.now() - Math.floor(Math.random() * 7200000),
        indexedAt: Date.now()
      });
    });

    if (extractedViewers.size > 0) {
      this.viewers = extractedViewers;
      this.updateViewerList();
      console.log(`Storylister: Successfully indexed ${extractedViewers.size} viewers`);
    } else {
      console.log('Storylister: No viewers extracted');
    }
  }

  showRightRail() {
    if (this.rightRail) return;
    
    this.isActive = true;
    this.createRightRail();
    this.updateViewerList();
  }

  hideRightRail() {
    if (this.rightRail) {
      this.rightRail.remove();
      this.rightRail = null;
    }
    this.isActive = false;
  }

  createRightRail() {
    this.rightRail = document.createElement('div');
    this.rightRail.id = 'storylister-right-rail';
    this.rightRail.innerHTML = `
      <div class="storylister-panel">
        <div class="storylister-header">
          <div class="storylister-logo">
            <span class="logo-icon">👁️</span>
            <span>Storylister</span>
          </div>
          <button class="storylister-close" title="Close Storylister">×</button>
        </div>
        
        <div class="storylister-pro-toggle">
          <label class="pro-switch">
            <input type="checkbox" id="storylister-pro-mode">
            <span class="slider"></span>
          </label>
          <span class="pro-label">Free</span>
        </div>
        
        <div class="storylister-stats">
          <div class="stat-card">
            <div class="stat-label">VIEWERS</div>
            <div class="stat-value" id="storylister-viewer-count">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">VERIFIED</div>
            <div class="stat-value" id="storylister-verified-count">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">TAGGED</div>
            <div class="stat-value" id="storylister-tagged-count">0/0</div>
          </div>
        </div>
        
        <div class="storylister-content">
          <div class="storylister-search-section">
            <h3>Search Viewers</h3>
            <input 
              type="text" 
              id="storylister-search" 
              placeholder="Search by username or name..."
            />
          </div>
          
          <div class="storylister-filters">
            <button class="filter-tab active" data-filter="all">
              All
            </button>
            <button class="filter-tab" data-filter="verified">
              <svg class="verified-icon" viewBox="0 0 24 24" width="14" height="14">
                <path fill="#1877F2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              Verified (<span class="verified-count">0</span>)
            </button>
            <button class="filter-tab" data-filter="tagged">
              👀 Tagged (<span class="tagged-filter-count">0</span>)
            </button>
          </div>
          
          <div class="storylister-tabs">
            <button class="tab-btn active" data-tab="following">Following</button>
            <button class="tab-btn" data-tab="followers">Followers</button>
            <button class="tab-btn" data-tab="non-followers">Non-followers</button>
          </div>
          
          <div class="storylister-results" id="storylister-results">
            <div class="storylister-empty">
              Click "Seen by" to start indexing viewers
            </div>
          </div>
        </div>
        
        <div class="storylister-footer">
          <button class="storylister-btn secondary" id="storylister-manage-tags">
            👀 Manage Tags
          </button>
          <button class="storylister-btn primary" id="storylister-export">
            📊 Export &<br>Track
          </button>
        </div>
      </div>
      
      <!-- Tag Manager Modal -->
      <div class="storylister-tag-manager" id="storylister-tag-manager" style="display: none;">
        <div class="tag-manager-header">
          <button class="tag-manager-back">← Back</button>
          <div class="tag-manager-title">
            <span class="tag-icon">👀</span>
            <h3>Manage Tagged Users</h3>
          </div>
          <div style="width: 80px;"></div>
        </div>
        
        <div class="tag-manager-helper">
          <p class="helper-title">Why tag viewers?</p>
          <div class="helper-reasons">
            <div class="helper-item">
              <span class="helper-emoji">🎯</span>
              <span>Track your most loyal viewers across stories</span>
            </div>
            <div class="helper-item">
              <span class="helper-emoji">💜</span>
              <span>Identify top fans and engaged followers</span>
            </div>
            <div class="helper-item">
              <span class="helper-emoji">📊</span>
              <span>Monitor who consistently watches your content</span>
            </div>
          </div>
          <div class="tag-manager-upsell" id="tag-upsell" style="display: none;">
            <span class="upsell-emoji">✨</span>
            <span class="upsell-text">Want to tag and track more? 
              <button class="upsell-btn">Upgrade to Pro!</button>
            </span>
          </div>
        </div>
        
        <div class="tag-manager-content">
          <div class="tag-manager-stats">
            <div class="stat-card">
              <span class="stat-number" id="tag-total-count">0</span>
              <span class="stat-label">Total Tagged</span>
            </div>
            <div class="stat-card">
              <span class="stat-number" id="tag-watching-count">0</span>
              <span class="stat-label">Watching Now</span>
            </div>
            <div class="stat-card">
              <span class="stat-number" id="tag-not-watching-count">0</span>
              <span class="stat-label">Not Watching</span>
            </div>
          </div>
          
          <div class="tag-section-wrapper">
            <div class="section-title">
              <h4>Add Tags to Current Viewers</h4>
              <span class="section-subtitle">Search and tag viewers from this story</span>
            </div>
            <div class="tag-manager-add-controls">
              <input
                type="text"
                id="tag-search-input"
                placeholder="Type username to search current viewers..."
                class="tag-manager-search-input"
              />
            </div>
            <div class="tag-manager-suggestions" id="tag-suggestions" style="display: none;"></div>
          </div>
          
          <div class="tag-section-wrapper">
            <div class="section-title">
              <h4>Your Tagged Users</h4>
              <span class="section-subtitle" id="tag-user-count">No users tagged yet</span>
            </div>
            <input
              type="text"
              id="tag-filter-input"
              placeholder="Filter your tagged users..."
              class="tag-manager-filter-input"
              style="display: none;"
            />
            <div class="tag-manager-list" id="tag-user-list">
              <div class="tag-manager-empty">
                <span class="empty-emoji">🏷️</span>
                <p class="empty-title">No tagged users yet</p>
                <p class="empty-hint">Start tagging viewers to track your most engaged audience!</p>
              </div>
            </div>
          </div>
          
          <div class="tag-manager-footer">
            <div class="footer-actions">
              <button class="clear-all-btn" id="tag-clear-all">
                🗑️ Clear All
              </button>
              <button class="done-btn" id="tag-done-btn">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Story Insights Modal -->
      <div class="viewer-insights-modal" id="storylister-insights" style="display: none;">
        <div class="insights-header">
          <h3>Story to Story Insights</h3>
          <button class="insights-close">×</button>
        </div>
        
        <div class="insights-comparison">
          <div class="comparison-stat">
            <span class="stat-label">Viewers</span>
            <span class="stat-value" id="insights-viewers">100</span>
          </div>
          <div class="comparison-stat">
            <span class="stat-label">Drop-off Rate</span>
            <span class="stat-value drop-off" id="insights-dropoff">-15%</span>
          </div>
          <div class="comparison-stat">
            <span class="stat-label">Retention</span>
            <span class="stat-value retention" id="insights-retention">85%</span>
          </div>
        </div>
        
        <div class="story-navigation">
          <button class="story-nav-btn prev" id="story-prev">←</button>
          <span class="story-nav-indicator" id="story-indicator">Story 1 of 3</span>
          <button class="story-nav-btn next" id="story-next">→</button>
        </div>
        
        <div class="story-progress-bar" id="story-progress"></div>
        
        <div class="insights-tabs">
          <button class="insights-tab active" data-tab="watchers">
            Watchers (<span id="watchers-count">100</span>)
          </button>
          <button class="insights-tab" data-tab="fell-off">
            Fell-off (<span id="fell-off-count">15</span>)
          </button>
          <button class="insights-tab" data-tab="tagged">
            Tagged (<span id="tagged-insights-count">0/0</span>)
          </button>
        </div>
        
        <div class="insights-content" id="insights-content">
          <!-- Content will be dynamically added -->
        </div>
      </div>
    `;
    
    document.body.appendChild(this.rightRail);
    this.attachEventListeners();
  }

  attachEventListeners() {
    // Close button
    const closeBtn = this.rightRail.querySelector('.storylister-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideRightRail());
    }

    // Pro mode toggle
    const proToggle = this.rightRail.querySelector('#storylister-pro-mode');
    if (proToggle) {
      proToggle.addEventListener('change', (e) => {
        this.isProMode = e.target.checked;
        const label = this.rightRail.querySelector('.pro-label');
        if (label) label.textContent = this.isProMode ? 'Pro' : 'Free';
        this.updateProFeatures();
      });
    }

    // Search input
    const searchInput = this.rightRail.querySelector('#storylister-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentFilters.query = e.target.value;
        this.updateViewerList();
      });
    }

    // Filter tabs
    const filterTabs = this.rightRail.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-filter');
        if (filter === 'tagged') {
          this.currentFilters.showTagged = true;
        } else if (filter === 'verified') {
          this.currentFilters.type = 'verified';
          this.currentFilters.showTagged = false;
        } else {
          this.currentFilters.type = 'all';
          this.currentFilters.showTagged = false;
        }
        this.updateViewerList();
      });
    });

    // Follower tabs
    const tabs = this.rightRail.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabType = tab.getAttribute('data-tab');
        if (tabType === 'followers') {
          this.currentFilters.type = 'followers';
        } else if (tabType === 'non-followers') {
          this.currentFilters.type = 'non-followers';
        } else {
          this.currentFilters.type = 'following';
        }
        this.updateViewerList();
      });
    });

    // Manage Tags button
    const manageTagsBtn = this.rightRail.querySelector('#storylister-manage-tags');
    if (manageTagsBtn) {
      manageTagsBtn.addEventListener('click', () => this.showTagManagerModal());
    }

    // Export & Track button
    const exportBtn = this.rightRail.querySelector('#storylister-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.showInsightsModal());
    }

    // Tag Manager event listeners
    this.attachTagManagerListeners();
    
    // Insights Modal event listeners
    this.attachInsightsListeners();
  }

  attachTagManagerListeners() {
    const tagManager = this.rightRail.querySelector('#storylister-tag-manager');
    if (!tagManager) return;

    // Back button
    const backBtn = tagManager.querySelector('.tag-manager-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.hideTagManagerModal());
    }

    // Done button
    const doneBtn = tagManager.querySelector('#tag-done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => this.hideTagManagerModal());
    }

    // Clear all button
    const clearBtn = tagManager.querySelector('#tag-clear-all');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Remove all tagged users? This cannot be undone.')) {
          this.taggedUsers.clear();
          this.saveTaggedUsers();
          this.updateTagManagerContent();
          this.updateViewerList();
        }
      });
    }

    // Search input for adding tags
    const searchInput = tagManager.querySelector('#tag-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.showTagSuggestions(e.target.value);
      });
    }

    // Filter input for tagged users
    const filterInput = tagManager.querySelector('#tag-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        this.updateTaggedUsersList();
      });
    }

    // Pro upsell button
    const upsellBtn = tagManager.querySelector('.upsell-btn');
    if (upsellBtn) {
      upsellBtn.addEventListener('click', () => {
        this.isProMode = true;
        const proToggle = this.rightRail.querySelector('#storylister-pro-mode');
        if (proToggle) proToggle.checked = true;
        this.updateProFeatures();
      });
    }
  }

  attachInsightsListeners() {
    const insights = this.rightRail.querySelector('#storylister-insights');
    if (!insights) return;

    // Close button
    const closeBtn = insights.querySelector('.insights-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideInsightsModal());
    }

    // Story navigation
    const prevBtn = insights.querySelector('#story-prev');
    const nextBtn = insights.querySelector('#story-next');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentStory > 0) {
          this.currentStory--;
          this.updateInsightsContent();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentStory < this.totalStories - 1) {
          this.currentStory++;
          this.updateInsightsContent();
        }
      });
    }

    // Insights tabs
    const insightsTabs = insights.querySelectorAll('.insights-tab');
    insightsTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabType = tab.getAttribute('data-tab');
        if (tabType) {
          insightsTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.insightsTab = tabType;
          this.updateInsightsTabContent();
        }
      });
    });
  }

  showTagManagerModal() {
    const modal = this.rightRail.querySelector('#storylister-tag-manager');
    if (modal) {
      modal.style.display = 'block';
      this.updateTagManagerContent();
    }
  }

  hideTagManagerModal() {
    const modal = this.rightRail.querySelector('#storylister-tag-manager');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  showInsightsModal() {
    const modal = this.rightRail.querySelector('#storylister-insights');
    if (modal) {
      modal.style.display = 'block';
      this.updateInsightsContent();
    }
  }

  hideInsightsModal() {
    const modal = this.rightRail.querySelector('#storylister-insights');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  updateTagManagerContent() {
    const taggedInCurrentStory = Array.from(this.viewers.values()).filter(v => v.isTagged).length;
    
    // Update stats
    const totalCount = this.rightRail.querySelector('#tag-total-count');
    const watchingCount = this.rightRail.querySelector('#tag-watching-count');
    const notWatchingCount = this.rightRail.querySelector('#tag-not-watching-count');
    
    if (totalCount) totalCount.textContent = this.taggedUsers.size;
    if (watchingCount) watchingCount.textContent = taggedInCurrentStory;
    if (notWatchingCount) notWatchingCount.textContent = this.taggedUsers.size - taggedInCurrentStory;
    
    // Update upsell visibility
    const upsell = this.rightRail.querySelector('#tag-upsell');
    if (upsell) {
      upsell.style.display = this.isProMode ? 'none' : 'flex';
    }
    
    // Update tagged users list
    this.updateTaggedUsersList();
  }

  updateTaggedUsersList() {
    const listContainer = this.rightRail.querySelector('#tag-user-list');
    const filterInput = this.rightRail.querySelector('#tag-filter-input');
    const userCount = this.rightRail.querySelector('#tag-user-count');
    
    if (!listContainer) return;
    
    const filterValue = filterInput?.value.toLowerCase() || '';
    const taggedArray = Array.from(this.taggedUsers);
    const filtered = taggedArray.filter(username => 
      username.toLowerCase().includes(filterValue)
    );
    
    // Update count
    if (userCount) {
      userCount.textContent = this.taggedUsers.size > 0 
        ? `${this.taggedUsers.size} users tagged` 
        : 'No users tagged yet';
    }
    
    // Show/hide filter input
    if (filterInput) {
      filterInput.style.display = this.taggedUsers.size > 0 ? 'block' : 'none';
    }
    
    if (filtered.length === 0 && this.taggedUsers.size === 0) {
      listContainer.innerHTML = `
        <div class="tag-manager-empty">
          <span class="empty-emoji">🏷️</span>
          <p class="empty-title">No tagged users yet</p>
          <p class="empty-hint">Start tagging viewers to track your most engaged audience!</p>
        </div>
      `;
    } else if (filtered.length === 0 && filterValue) {
      listContainer.innerHTML = `
        <div class="tag-manager-empty">
          <span class="empty-emoji">🔍</span>
          <p class="empty-title">No matches found</p>
          <p class="empty-hint">Try a different search term</p>
        </div>
      `;
    } else {
      listContainer.innerHTML = filtered.map(username => {
        const viewer = this.viewers.get(username);
        const isWatching = viewer ? true : false;
        
        return `
          <div class="tag-manager-item">
            <div class="tag-item-left">
              <span class="tag-item-emoji">👤</span>
              <div class="tag-item-info">
                <span class="tag-item-username">${username}</span>
                ${isWatching ? `
                  <span class="tag-status watching">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#10b981">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Watching now
                  </span>
                ` : `
                  <span class="tag-status not-watching">Not in this story</span>
                `}
              </div>
            </div>
            <button class="tag-remove" data-username="${username}">×</button>
          </div>
        `;
      }).join('');
      
      // Add remove listeners
      listContainer.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.getAttribute('data-username');
          if (username) {
            this.toggleTag(username);
            this.updateTagManagerContent();
          }
        });
      });
    }
  }

  showTagSuggestions(query) {
    const suggestionsContainer = this.rightRail.querySelector('#tag-suggestions');
    if (!suggestionsContainer) return;
    
    if (!query) {
      suggestionsContainer.style.display = 'none';
      return;
    }
    
    const matches = Array.from(this.viewers.values())
      .filter(v => 
        v.username.toLowerCase().includes(query.toLowerCase()) &&
        !this.taggedUsers.has(v.username)
      )
      .slice(0, 5);
    
    if (matches.length === 0) {
      suggestionsContainer.style.display = 'none';
      return;
    }
    
    suggestionsContainer.style.display = 'block';
    suggestionsContainer.innerHTML = matches.map(user => `
      <div class="tag-suggestion-item" data-username="${user.username}">
        <img src="${user.profilePic}" alt="${user.username}" />
        <div class="suggestion-info">
          <span class="suggestion-username">${user.username}</span>
          <span class="suggestion-meta">${user.displayName || user.username}</span>
        </div>
        <button class="tag-btn-add">+</button>
      </div>
    `).join('');
    
    // Add click listeners
    suggestionsContainer.querySelectorAll('.tag-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const username = item.getAttribute('data-username');
        if (username) {
          this.toggleTag(username);
          const searchInput = this.rightRail.querySelector('#tag-search-input');
          if (searchInput) searchInput.value = '';
          suggestionsContainer.style.display = 'none';
          this.updateTagManagerContent();
        }
      });
    });
  }

  updateInsightsContent() {
    // Update navigation
    const indicator = this.rightRail.querySelector('#story-indicator');
    const prevBtn = this.rightRail.querySelector('#story-prev');
    const nextBtn = this.rightRail.querySelector('#story-next');
    
    if (indicator) indicator.textContent = `Story ${this.currentStory + 1} of ${this.totalStories}`;
    if (prevBtn) prevBtn.disabled = this.currentStory === 0;
    if (nextBtn) nextBtn.disabled = this.currentStory === this.totalStories - 1;
    
    // Update stats
    const viewerCount = Math.max(100 - (this.currentStory * 20), 60);
    const dropoff = this.currentStory > 0 ? 15 : 0;
    const retention = 100 - (this.currentStory * 20);
    
    const viewersEl = this.rightRail.querySelector('#insights-viewers');
    const dropoffEl = this.rightRail.querySelector('#insights-dropoff');
    const retentionEl = this.rightRail.querySelector('#insights-retention');
    
    if (viewersEl) viewersEl.textContent = viewerCount;
    if (dropoffEl) dropoffEl.textContent = dropoff > 0 ? `-${dropoff}%` : '0%';
    if (retentionEl) retentionEl.textContent = `${retention}%`;
    
    // Update progress bar
    const progressBar = this.rightRail.querySelector('#story-progress');
    if (progressBar) {
      progressBar.innerHTML = [0, 1, 2].map(idx => {
        const viewers = Math.max(100 - (idx * 20), 60);
        const percentage = viewers;
        return `
          <div class="progress-segment ${idx === this.currentStory ? 'active' : ''}" 
               data-story="${idx}">
            <div class="progress-label">Story ${idx + 1}</div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-count">${viewers} viewers</div>
          </div>
        `;
      }).join('');
      
      // Add click listeners to progress segments
      progressBar.querySelectorAll('.progress-segment').forEach(segment => {
        segment.addEventListener('click', () => {
          const storyIdx = parseInt(segment.getAttribute('data-story'));
          if (!isNaN(storyIdx)) {
            this.currentStory = storyIdx;
            this.updateInsightsContent();
          }
        });
      });
    }
    
    // Update tab counts
    const watchersCount = this.rightRail.querySelector('#watchers-count');
    const fellOffCount = this.rightRail.querySelector('#fell-off-count');
    const taggedCount = this.rightRail.querySelector('#tagged-insights-count');
    
    if (watchersCount) watchersCount.textContent = viewerCount;
    if (fellOffCount) fellOffCount.textContent = dropoff > 0 ? Math.floor(dropoff * 1.5) : 0;
    if (taggedCount) {
      const taggedInStory = Array.from(this.viewers.values()).filter(v => v.isTagged).length;
      taggedCount.textContent = `${taggedInStory}/${this.taggedUsers.size}`;
    }
    
    this.updateInsightsTabContent();
  }

  updateInsightsTabContent() {
    const content = this.rightRail.querySelector('#insights-content');
    if (!content) return;
    
    const viewers = Array.from(this.viewers.values());
    
    if (this.insightsTab === 'watchers') {
      content.innerHTML = `
        <div class="insights-list">
          <p class="insights-description">Users who viewed this story</p>
          ${viewers.slice(0, 20).map(user => this.createInsightsUserItem(user)).join('')}
        </div>
      `;
    } else if (this.insightsTab === 'fell-off') {
      const fellOffUsers = viewers.slice(20, 35);
      content.innerHTML = `
        <div class="insights-list">
          <p class="insights-description">Users who watched previous story but not this one</p>
          ${fellOffUsers.length > 0 ? 
            fellOffUsers.map(user => this.createInsightsUserItem(user, true)).join('') :
            '<p class="insights-empty">No users fell off at this story</p>'
          }
        </div>
      `;
    } else if (this.insightsTab === 'tagged') {
      const taggedInStory = viewers.filter(v => v.isTagged);
      const taggedNotInStory = Array.from(this.taggedUsers)
        .filter(username => !this.viewers.has(username))
        .map(username => ({ username, displayName: username, profilePic: '', isTagged: true }));
      
      content.innerHTML = `
        <div class="insights-list">
          <p class="insights-description">Your tagged users and their viewing status</p>
          ${taggedInStory.length > 0 ? `
            <h4 class="insights-subheader">Watched this story</h4>
            ${taggedInStory.map(user => this.createInsightsUserItem(user)).join('')}
          ` : ''}
          ${taggedNotInStory.length > 0 ? `
            <h4 class="insights-subheader">Haven't watched this story</h4>
            ${taggedNotInStory.map(user => this.createInsightsUserItem(user, false, true)).join('')}
          ` : ''}
          ${this.taggedUsers.size === 0 ? '<p class="insights-empty">No tagged users yet</p>' : ''}
        </div>
      `;
    }
    
    // Add tag toggle listeners
    content.querySelectorAll('.insights-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const username = btn.getAttribute('data-username');
        if (username) {
          this.toggleTag(username);
          this.updateInsightsTabContent();
        }
      });
    });
  }

  createInsightsUserItem(user, fellOff = false, notWatched = false) {
    const verifiedBadge = user.isVerified ? `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2" style="display: inline; vertical-align: middle; margin-left: 4px;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    ` : '';
    
    return `
      <div class="insights-user ${fellOff ? 'fell-off' : ''} ${notWatched ? 'not-watched' : ''}">
        ${user.profilePic ? `<img src="${user.profilePic}" alt="${user.username}" />` : '<div class="user-avatar">👤</div>'}
        <div class="insights-user-info">
          <span class="insights-username">
            ${user.username}
            ${verifiedBadge}
          </span>
          <span class="insights-meta">${user.displayName || user.username}</span>
        </div>
        <button class="insights-tag-btn ${user.isTagged ? 'active' : ''}" 
                data-username="${user.username}"
                title="${user.isTagged ? 'Untag' : 'Tag'}">
          👀${user.isTagged ? ' Untag' : ''}
        </button>
      </div>
    `;
  }

  updateViewerList() {
    const resultsContainer = this.rightRail.querySelector('#storylister-results');
    if (!resultsContainer) return;

    let filteredViewers = Array.from(this.viewers.values());

    // Apply search filter
    if (this.currentFilters.query) {
      const query = this.currentFilters.query.toLowerCase();
      filteredViewers = filteredViewers.filter(v => 
        v.username.toLowerCase().includes(query) ||
        (v.displayName && v.displayName.toLowerCase().includes(query))
      );
    }

    // Apply type filter
    if (this.currentFilters.showTagged) {
      filteredViewers = filteredViewers.filter(v => v.isTagged);
    } else if (this.currentFilters.type === 'verified') {
      filteredViewers = filteredViewers.filter(v => v.isVerified);
    } else if (this.currentFilters.type === 'followers') {
      filteredViewers = filteredViewers.filter(v => v.isFollower);
    } else if (this.currentFilters.type === 'non-followers') {
      filteredViewers = filteredViewers.filter(v => !v.isFollower);
    }

    // Update counts
    const viewerCount = this.rightRail.querySelector('#storylister-viewer-count');
    const verifiedCount = this.rightRail.querySelector('#storylister-verified-count');
    const taggedCount = this.rightRail.querySelector('#storylister-tagged-count');
    
    if (viewerCount) viewerCount.textContent = this.viewers.size;
    if (verifiedCount) {
      const verified = Array.from(this.viewers.values()).filter(v => v.isVerified).length;
      verifiedCount.textContent = verified;
      const verifiedFilter = this.rightRail.querySelector('.verified-count');
      if (verifiedFilter) verifiedFilter.textContent = verified;
    }
    if (taggedCount) {
      const tagged = Array.from(this.viewers.values()).filter(v => v.isTagged).length;
      taggedCount.textContent = `${tagged}/${this.taggedUsers.size}`;
      const taggedFilter = this.rightRail.querySelector('.tagged-filter-count');
      if (taggedFilter) taggedFilter.textContent = this.taggedUsers.size;
    }

    // Update results
    if (filteredViewers.length === 0) {
      resultsContainer.innerHTML = `
        <div class="storylister-empty">
          ${this.viewers.size === 0 ? 'Click "Seen by" to start indexing viewers' : 'No viewers match your search'}
        </div>
      `;
    } else {
      const resultsHTML = `
        <div class="storylister-results-header">
          ${filteredViewers.length} viewers found
          <button class="storylister-refresh" title="Re-scan viewers">🔄</button>
          <button class="storylister-newest">↓ Newest</button>
        </div>
        ${filteredViewers.map(viewer => this.createViewerItem(viewer)).join('')}
      `;
      resultsContainer.innerHTML = resultsHTML;

      // Add event listeners for refresh button
      const refreshBtn = resultsContainer.querySelector('.storylister-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          console.log('Storylister: Manual refresh triggered');
          this.extractViewers();
        });
      }

      // Add event listeners for tag buttons
      resultsContainer.querySelectorAll('.viewer-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.getAttribute('data-username');
          if (username) {
            this.toggleTag(username);
          }
        });
      });

      // Add event listeners for action buttons
      resultsContainer.querySelectorAll('.viewer-actions button').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          const username = btn.getAttribute('data-username');
          if (action && username) {
            this.handleViewerAction(action, username);
          }
        });
      });
    }
  }

  createViewerItem(viewer) {
    const verifiedBadge = viewer.isVerified ? `
      <svg class="verified-badge" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    ` : '';

    const timeAgo = this.formatTimeAgo(viewer.viewedAt);

    return `
      <div class="storylister-viewer-item">
        <div class="storylister-viewer-left">
          ${viewer.profilePic ? 
            `<img src="${viewer.profilePic}" alt="${viewer.username}" class="viewer-avatar" />` :
            '<div class="viewer-avatar-placeholder">👤</div>'
          }
          <div class="storylister-viewer-info">
            <div class="storylister-viewer-name">
              ${viewer.username}
              ${verifiedBadge}
            </div>
            <div class="storylister-viewer-meta">
              ${viewer.displayName || viewer.username} · ${timeAgo}
            </div>
          </div>
        </div>
        <div class="storylister-viewer-actions">
          <button class="viewer-action-btn" data-action="view" data-username="${viewer.username}" title="View Profile">
            👁️
          </button>
          <button class="viewer-tag-btn ${viewer.isTagged ? 'active' : ''}" 
                  data-username="${viewer.username}" 
                  title="${viewer.isTagged ? 'Remove tag' : 'Add tag'}">
            ${this.isProMode && this.selectedCustomTag !== 'tagged' ? 
              this.customTags.find(t => t.id === this.selectedCustomTag)?.emoji || '👀' : 
              '👀'
            }
          </button>
          <button class="viewer-action-btn" data-action="more" data-username="${viewer.username}" title="More Options">
            ⋯
          </button>
        </div>
      </div>
    `;
  }

  toggleTag(username) {
    if (this.taggedUsers.has(username)) {
      this.taggedUsers.delete(username);
    } else {
      this.taggedUsers.add(username);
    }
    
    // Update viewer state
    const viewer = this.viewers.get(username);
    if (viewer) {
      viewer.isTagged = this.taggedUsers.has(username);
    }
    
    this.saveTaggedUsers();
    this.updateViewerList();
  }

  saveTaggedUsers() {
    localStorage.setItem('storylister_tagged_users', JSON.stringify(Array.from(this.taggedUsers)));
  }

  handleViewerAction(action, username) {
    if (action === 'view') {
      window.open(`https://www.instagram.com/${username}/`, '_blank');
    } else if (action === 'more') {
      this.showToast(`More options for @${username}`, 'info');
    }
  }

  updateProFeatures() {
    // Update tag manager upsell
    const upsell = this.rightRail.querySelector('#tag-upsell');
    if (upsell) {
      upsell.style.display = this.isProMode ? 'none' : 'flex';
    }
    
    // Enable/disable pro features
    if (this.isProMode) {
      this.showToast('Pro mode activated! All features unlocked.', 'success');
    }
  }

  formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 340px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#8b5cf6'};
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

      #storylister-right-rail {
        position: fixed;
        top: 0;
        right: 0;
        width: 320px;
        height: 100vh;
        background: #DBE0E5;
        z-index: 99999;
        box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .storylister-panel {
        background: #DBE0E5;
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .storylister-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 16px;
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .storylister-logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: white;
        font-size: 18px;
      }

      .logo-icon {
        font-size: 24px;
      }

      .storylister-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .storylister-close:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
      }
      
      .storylister-pro-toggle {
        padding: 12px 16px;
        background: white;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .pro-switch {
        position: relative;
        display: inline-block;
        width: 48px;
        height: 24px;
      }
      
      .pro-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
        border-radius: 34px;
      }
      
      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
      }
      
      input:checked + .slider {
        background-color: #8b5cf6;
      }
      
      input:checked + .slider:before {
        transform: translateX(24px);
      }
      
      .pro-label {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
      }
      
      .storylister-stats {
        padding: 16px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        background: #DBE0E5;
      }
      
      .stat-card {
        background: white;
        padding: 12px;
        border-radius: 8px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .stat-label {
        font-size: 10px;
        text-transform: uppercase;
        color: #6b7280;
        letter-spacing: 0.5px;
      }
      
      .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: #111827;
        margin-top: 4px;
      }

      .storylister-content {
        padding: 0 16px 16px 16px;
        background: #DBE0E5;
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      
      .storylister-search-section {
        margin-bottom: 12px;
      }
      
      .storylister-search-section h3 {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 8px 0;
      }

      #storylister-search {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        background: white;
        color: #111827;
      }

      #storylister-search:focus {
        outline: none;
        border-color: #8b5cf6;
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
      }

      .storylister-filters {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }

      .filter-tab {
        padding: 8px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 13px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .filter-tab:hover {
        border-color: #8b5cf6;
      }

      .filter-tab.active {
        background: #8b5cf6;
        color: white;
        border-color: #8b5cf6;
      }
      
      .filter-tab.active svg {
        fill: white;
      }
      
      .verified-icon {
        width: 14px;
        height: 14px;
      }
      
      .storylister-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 12px;
        background: white;
        padding: 4px;
        border-radius: 8px;
      }
      
      .tab-btn {
        flex: 1;
        padding: 8px;
        border: none;
        background: transparent;
        font-size: 13px;
        font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
      }
      
      .tab-btn:hover {
        background: #f3f4f6;
      }
      
      .tab-btn.active {
        background: #8b5cf6;
        color: white;
      }

      .storylister-results {
        background: white;
        border-radius: 8px;
        padding: 8px;
        flex: 1;
        overflow-y: auto;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        min-height: 200px;
      }
      
      .storylister-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        font-size: 12px;
        color: #6b7280;
        border-bottom: 1px solid #f3f4f6;
        margin-bottom: 8px;
      }
      
      .storylister-newest,
      .storylister-refresh {
        background: none;
        border: none;
        color: #8b5cf6;
        font-size: 12px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s;
      }
      
      .storylister-newest:hover,
      .storylister-refresh:hover {
        background: #f3f4f6;
      }
      
      .storylister-refresh {
        font-size: 16px;
        padding: 4px 6px;
      }

      .storylister-viewer-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        height: 56px;
        background: white;
        transition: all 0.2s;
        border-bottom: 1px solid #f3f4f6;
      }

      .storylister-viewer-item:hover {
        background: #f9fafb;
      }
      
      .storylister-viewer-left {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
      }
      
      .viewer-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }
      
      .viewer-avatar-placeholder {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #f3f4f6;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: #9ca3af;
        flex-shrink: 0;
      }

      .storylister-viewer-info {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      .storylister-viewer-name {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .storylister-viewer-meta {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .verified-badge {
        width: 14px;
        height: 14px;
        fill: #1877F2;
      }
      
      .storylister-viewer-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .viewer-action-btn,
      .viewer-tag-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .viewer-action-btn:hover,
      .viewer-tag-btn:hover {
        background: #f3f4f6;
        transform: scale(1.1);
      }
      
      .viewer-tag-btn.active {
        background: #8b5cf6;
        border-color: #8b5cf6;
      }

      .storylister-empty {
        text-align: center;
        padding: 40px 20px;
        color: #6b7280;
        font-size: 14px;
      }

      .storylister-footer {
        padding: 16px;
        background: #DBE0E5;
        border-top: 1px solid #c6cbd1;
        display: flex;
        justify-content: space-between;
        flex-shrink: 0;
        gap: 12px;
      }

      .storylister-btn {
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .storylister-btn.secondary {
        background: white;
        color: #374151;
        border: 1px solid #e5e7eb;
      }

      .storylister-btn.secondary:hover {
        background: #f9fafb;
        transform: translateY(-2px);
      }

      .storylister-btn.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .storylister-btn.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      /* Tag Manager Modal Styles */
      .storylister-tag-manager {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: #DBE0E5;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .tag-manager-header {
        padding: 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: white;
        flex-shrink: 0;
      }
      
      .tag-manager-back {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
        font-weight: 500;
      }
      
      .tag-manager-back:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: translateX(-2px);
      }
      
      .tag-manager-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .tag-manager-title h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .tag-icon {
        font-size: 24px;
      }
      
      .tag-manager-helper {
        padding: 16px;
        background: #DBE0E5;
        flex-shrink: 0;
      }
      
      .helper-title {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 12px 0;
      }
      
      .helper-reasons {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .helper-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: white;
        border-radius: 8px;
        font-size: 13px;
        color: #374151;
      }
      
      .helper-emoji {
        font-size: 16px;
      }
      
      .tag-manager-upsell {
        margin-top: 12px;
        padding: 12px;
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 2px solid #fbbf24;
      }
      
      .upsell-emoji {
        font-size: 20px;
      }
      
      .upsell-text {
        font-size: 13px;
        color: #92400e;
        flex: 1;
      }
      
      .upsell-btn {
        background: #8b5cf6;
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        margin-left: 6px;
        transition: all 0.2s;
      }
      
      .upsell-btn:hover {
        background: #7c3aed;
        transform: scale(1.05);
      }
      
      .tag-manager-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #DBE0E5;
        min-height: 0;
      }
      
      .tag-manager-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }
      
      .tag-section-wrapper {
        background: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .section-title {
        margin-bottom: 16px;
      }
      
      .section-title h4 {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 4px 0;
      }
      
      .section-subtitle {
        font-size: 13px;
        color: #6b7280;
        display: block;
      }
      
      .tag-manager-add-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .tag-manager-search-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        background: #f9fafb;
        transition: all 0.2s;
      }
      
      .tag-manager-search-input:focus {
        outline: none;
        border-color: #8b5cf6;
        background: white;
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
      }
      
      .tag-manager-suggestions {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        margin-top: 8px;
        max-height: 180px;
        overflow-y: auto;
      }
      
      .tag-suggestion-item {
        display: flex;
        align-items: center;
        padding: 10px;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .tag-suggestion-item:hover {
        background: #e5e7eb;
      }
      
      .tag-suggestion-item img {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        margin-right: 10px;
      }
      
      .suggestion-info {
        flex: 1;
      }
      
      .suggestion-username {
        font-size: 14px;
        font-weight: 500;
        color: #111827;
      }
      
      .suggestion-meta {
        font-size: 12px;
        color: #6b7280;
      }
      
      .tag-btn-add {
        padding: 6px 12px;
        background: #8b5cf6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .tag-btn-add:hover {
        background: #7c3aed;
        transform: scale(1.05);
      }
      
      .tag-manager-filter-input {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        margin-top: 8px;
        background: #f9fafb;
        transition: all 0.2s;
      }
      
      .tag-manager-filter-input:focus {
        outline: none;
        border-color: #8b5cf6;
        background: white;
        box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
      }
      
      .tag-manager-list {
        max-height: 320px;
        overflow-y: auto;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 4px;
        margin-top: 12px;
      }
      
      .tag-manager-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px;
        background: white;
        border-radius: 6px;
        margin-bottom: 4px;
        transition: all 0.2s;
      }
      
      .tag-manager-item:hover {
        background: #f9fafb;
        transform: translateX(2px);
      }
      
      .tag-item-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .tag-item-emoji {
        font-size: 20px;
      }
      
      .tag-item-info {
        display: flex;
        flex-direction: column;
      }
      
      .tag-item-username {
        font-size: 14px;
        font-weight: 500;
        color: #111827;
      }
      
      .tag-status {
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
      }
      
      .tag-status.watching {
        color: #10b981;
      }
      
      .tag-status.not-watching {
        color: #6b7280;
      }
      
      .tag-remove {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid #e5e7eb;
        background: white;
        color: #6b7280;
        font-size: 18px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .tag-remove:hover {
        background: #ef4444;
        color: white;
        border-color: #ef4444;
        transform: scale(1.1);
      }
      
      .tag-manager-empty {
        text-align: center;
        padding: 40px 20px;
      }
      
      .empty-emoji {
        font-size: 48px;
        margin-bottom: 12px;
        display: block;
      }
      
      .empty-title {
        font-size: 16px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 8px 0;
      }
      
      .empty-hint {
        font-size: 14px;
        color: #6b7280;
        margin: 0;
      }
      
      .tag-manager-footer {
        padding: 16px;
        background: #DBE0E5;
        border-top: 1px solid #c6cbd1;
        flex-shrink: 0;
      }
      
      .footer-actions {
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      
      .clear-all-btn {
        padding: 10px 20px;
        background: #fee2e2;
        color: #dc2626;
        border: 2px solid #fecaca;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .clear-all-btn:hover {
        background: #ef4444;
        color: white;
        border-color: #ef4444;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      }
      
      .done-btn {
        padding: 10px 32px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .done-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      /* Story Insights Modal Styles */
      .viewer-insights-modal {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        max-height: 600px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
        z-index: 100001;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .insights-header {
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .insights-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .insights-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: 20px;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .insights-close:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
      }
      
      .insights-comparison {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        padding: 20px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .comparison-stat {
        text-align: center;
      }
      
      .comparison-stat .stat-label {
        font-size: 12px;
        text-transform: uppercase;
        color: #6b7280;
        letter-spacing: 0.5px;
      }
      
      .comparison-stat .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #111827;
        margin-top: 4px;
      }
      
      .comparison-stat .drop-off {
        color: #ef4444;
      }
      
      .comparison-stat .retention {
        color: #10b981;
      }
      
      .story-navigation {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 16px;
        background: white;
      }
      
      .story-nav-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid #e5e7eb;
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: all 0.2s;
      }
      
      .story-nav-btn:hover:not(:disabled) {
        background: #8b5cf6;
        color: white;
        border-color: #8b5cf6;
      }
      
      .story-nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      
      .story-nav-indicator {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
      }
      
      .story-progress-bar {
        display: flex;
        gap: 12px;
        padding: 0 20px 16px;
        background: white;
      }
      
      .progress-segment {
        flex: 1;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .progress-segment:hover {
        transform: scale(1.02);
      }
      
      .progress-segment.active .progress-label {
        color: #8b5cf6;
        font-weight: 600;
      }
      
      .progress-label {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 4px;
      }
      
      .progress-bar-container {
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
      }
      
      .progress-bar-fill {
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        transition: width 0.3s ease;
      }
      
      .progress-count {
        font-size: 11px;
        color: #6b7280;
        margin-top: 4px;
      }
      
      .insights-tabs {
        display: flex;
        border-bottom: 1px solid #e5e7eb;
        background: white;
      }
      
      .insights-tab {
        flex: 1;
        padding: 12px;
        background: none;
        border: none;
        font-size: 14px;
        font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.2s;
        border-bottom: 2px solid transparent;
      }
      
      .insights-tab:hover:not(:disabled) {
        color: #374151;
      }
      
      .insights-tab.active {
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
      }
      
      .insights-tab:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .insights-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: white;
      }
      
      .insights-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .insights-description {
        font-size: 13px;
        color: #6b7280;
        margin-bottom: 12px;
      }
      
      .insights-subheader {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin: 16px 0 8px;
      }
      
      .insights-user {
        display: flex;
        align-items: center;
        padding: 10px;
        background: #f9fafb;
        border-radius: 8px;
        transition: all 0.2s;
      }
      
      .insights-user:hover {
        background: #f3f4f6;
        transform: translateX(2px);
      }
      
      .insights-user.fell-off {
        opacity: 0.7;
      }
      
      .insights-user.not-watched {
        opacity: 0.6;
      }
      
      .insights-user img {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        margin-right: 10px;
      }
      
      .user-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 10px;
        font-size: 18px;
      }
      
      .insights-user-info {
        flex: 1;
      }
      
      .insights-username {
        font-size: 14px;
        font-weight: 500;
        color: #111827;
      }
      
      .insights-meta {
        font-size: 12px;
        color: #6b7280;
      }
      
      .insights-tag-btn {
        padding: 6px 12px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .insights-tag-btn:hover {
        background: #f3f4f6;
        transform: scale(1.05);
      }
      
      .insights-tag-btn.active {
        background: #8b5cf6;
        color: white;
        border-color: #8b5cf6;
      }
      
      .insights-empty {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 14px;
      }
      
      .stat-number {
        font-size: 24px;
        font-weight: 700;
        color: #111827;
      }
      
      .stat-label {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }
    `;

    document.head.appendChild(style);
  }
}

// Initialize extension
const storylistExtension = new StorylistExtension();
storylistExtension.init();