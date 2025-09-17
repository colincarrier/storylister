// Storylister Backend - Data Layer with DOM Observation
// This script handles data collection and storage with localStorage bridge
// No UI elements - UI is handled by content.js

(function() {
  console.log('[SL:backend] Initializing backend data layer with DOM observers');
  
  const CONFIG = {
    RETENTION_HOURS: 24,
    MAX_STORIES_KEPT: 10,
    MAX_CACHE_SIZE: 5000,
    DB_NAME: 'StoryLister',
    DB_VERSION: 1
  };
  
  let db = null;
  let currentStoryId = null;
  let storiesMap = new Map(); // Track all stories in session
  let viewersPerStory = new Map(); // Map of storyId -> Map of username -> viewer data
  let domObservers = {
    progressBar: null,
    viewerModal: null,
    storyContainer: null
  };
  
  // DOM selectors (may need updates based on Instagram's current classes)
  const SELECTORS = {
    progressBars: '[role="progressbar"]',
    progressContainer: 'div[style*="transform"] > div > div',
    viewerModal: '[role="dialog"]',
    viewerCount: 'span:has-text("Seen by")',
    viewerRows: '[role="button"][tabindex="0"]',
    storyContainer: 'section > div > div[style*="height"]',
    videoElements: 'video'
  };
  
  // Initialize IndexedDB
  async function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        console.log('[SL:backend] Database opened successfully');
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('viewers')) {
          const viewerStore = db.createObjectStore('viewers', { keyPath: 'compositeId' });
          viewerStore.createIndex('storyId', 'storyId', { unique: false });
          viewerStore.createIndex('username', 'username', { unique: false });
          viewerStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('stories')) {
          const storyStore = db.createObjectStore('stories', { keyPath: 'id' });
          storyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('checkpoints')) {
          const checkpointStore = db.createObjectStore('checkpoints', { keyPath: 'id' });
          checkpointStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  // Extract story ID from URL
  function extractStoryId() {
    const match = window.location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }
  
  // Extract story owner from URL
  function extractStoryOwner() {
    const match = window.location.pathname.match(/\/stories\/([^\/]+)\/\d+/);
    return match ? match[1] : null;
  }
  
  // Parse story count from progress bars
  function parseStoryCount() {
    try {
      // Look for progress bar segments
      const progressBars = document.querySelectorAll('[role="progressbar"], div[style*="width"][style*="height: 2px"]');
      const storyCount = progressBars.length || 0;
      
      // Find active story (look for animation or different opacity)
      let activeIndex = 0;
      progressBars.forEach((bar, index) => {
        const computed = window.getComputedStyle(bar);
        if (computed.opacity === '1' || bar.querySelector('[style*="animation"]')) {
          activeIndex = index;
        }
      });
      
      return { total: storyCount, current: activeIndex + 1 };
    } catch (e) {
      console.log('[SL:backend] Could not parse story count from DOM');
      return { total: 0, current: 0 };
    }
  }
  
  // Parse viewer count from DOM
  function parseViewerCount() {
    try {
      // Look for "Seen by X" text
      const elements = Array.from(document.querySelectorAll('span, div')).filter(el => 
        el.textContent.match(/^Seen by \d+$/)
      );
      
      if (elements.length > 0) {
        const match = elements[0].textContent.match(/Seen by (\d+)/);
        return match ? parseInt(match[1]) : null;
      }
      
      // Alternative: Look in viewer modal header
      const modalHeader = document.querySelector('[role="dialog"] h1, [role="dialog"] header');
      if (modalHeader) {
        const match = modalHeader.textContent.match(/(\d+) viewer/);
        return match ? parseInt(match[1]) : null;
      }
    } catch (e) {
      console.log('[SL:backend] Could not parse viewer count from DOM');
    }
    return null;
  }
  
  // Parse emoji reactions from viewer rows
  function parseReactionsFromDOM() {
    try {
      const reactions = new Map();
      const viewerRows = document.querySelectorAll('[role="dialog"] [role="button"]');
      
      viewerRows.forEach(row => {
        // Look for username
        const usernameEl = row.querySelector('span[dir="auto"]');
        if (!usernameEl) return;
        
        const username = usernameEl.textContent;
        
        // Look for emoji reaction
        const emojiEl = row.querySelector('[aria-label*="reaction"], [role="img"], span[style*="emoji"]');
        if (emojiEl) {
          const emoji = emojiEl.textContent || emojiEl.getAttribute('aria-label');
          if (emoji) {
            reactions.set(username, emoji);
          }
        }
      });
      
      return reactions;
    } catch (e) {
      console.log('[SL:backend] Could not parse reactions from DOM');
    }
    return new Map();
  }
  
  // Load checkpoint for "new" viewer tracking
  async function loadCheckpoint(storyOwner) {
    if (!db) return null;
    
    try {
      const transaction = db.transaction(['checkpoints'], 'readonly');
      const store = transaction.objectStore('checkpoints');
      const request = store.get(storyOwner);
      
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result?.timestamp || null);
        request.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }
  
  // Save checkpoint
  async function saveCheckpoint(storyOwner) {
    if (!db || !storyOwner) return;
    
    try {
      const transaction = db.transaction(['checkpoints'], 'readwrite');
      const store = transaction.objectStore('checkpoints');
      store.put({
        id: storyOwner,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('[SL:backend] Error saving checkpoint:', e);
    }
  }
  
  // Mirror data to localStorage for UI compatibility
  async function mirrorToLocalStorage() {
    try {
      const storyOwner = extractStoryOwner();
      const checkpoint = await loadCheckpoint(storyOwner);
      
      // Get story metadata from DOM
      const storyMeta = parseStoryCount();
      const domViewerCount = parseViewerCount();
      
      // Create panel_story_store format
      const storyStore = {};
      
      // Get viewers for current story
      const currentViewers = viewersPerStory.get(currentStoryId) || new Map();
      
      if (currentStoryId) {
        storyStore[currentStoryId] = {
          viewers: [],
          timestamp: Date.now(),
          totalCount: domViewerCount || currentViewers.size,
          domTotal: domViewerCount,
          collectedCount: currentViewers.size
        };
        
        // Add viewers with composite key and "new" flag
        currentViewers.forEach((viewer, username) => {
          const isNew = checkpoint && viewer.timestamp > checkpoint;
          storyStore[currentStoryId].viewers.push([
            `${currentStoryId}_${username}`, // Composite ID
            {
              ...viewer,
              isNew: isNew
            }
          ]);
        });
      }
      
      // Write to localStorage
      localStorage.setItem('panel_story_store', JSON.stringify(storyStore));
      
      // Store story metadata
      localStorage.setItem('panel_story_meta', JSON.stringify({
        currentStoryId: currentStoryId,
        storyOwner: storyOwner,
        storyIndex: storyMeta.current,
        storyTotal: storyMeta.total,
        storiesInSession: Array.from(storiesMap.keys()),
        lastCheckpoint: checkpoint
      }));
      
      // Create viewer cache
      const viewerCache = {};
      currentViewers.forEach((viewer, username) => {
        viewerCache[username] = {
          ...viewer,
          lastSeen: Date.now()
        };
      });
      
      // Limit cache size
      const cacheEntries = Object.entries(viewerCache);
      if (cacheEntries.length > CONFIG.MAX_CACHE_SIZE) {
        const limited = Object.fromEntries(cacheEntries.slice(-CONFIG.MAX_CACHE_SIZE));
        localStorage.setItem('panel_viewer_cache', JSON.stringify(limited));
      } else {
        localStorage.setItem('panel_viewer_cache', JSON.stringify(viewerCache));
      }
      
      console.log(`[SL:backend] Mirrored ${currentViewers.size} viewers, DOM shows ${domViewerCount || '?'} total`);
      
      // Dispatch event for UI
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { 
        detail: { 
          storyId: currentStoryId,
          viewerCount: currentViewers.size,
          totalCount: domViewerCount || currentViewers.size,
          storyIndex: storyMeta.current,
          storyTotal: storyMeta.total,
          isComplete: domViewerCount && currentViewers.size >= domViewerCount
        }
      }));
      
    } catch (error) {
      console.error('[SL:backend] Error mirroring to localStorage:', error);
    }
  }
  
  // Process viewer chunks from interceptor
  function processViewerChunk(data) {
    const { mediaId, viewers, totalCount, timestamp } = data;
    
    if (!viewers || viewers.length === 0) return;
    
    currentStoryId = mediaId || extractStoryId();
    console.log(`[SL:backend] Processing ${viewers.length} viewers for story ${currentStoryId}`);
    
    // Track this story
    if (currentStoryId && !storiesMap.has(currentStoryId)) {
      storiesMap.set(currentStoryId, {
        id: currentStoryId,
        firstSeen: timestamp || Date.now(),
        owner: extractStoryOwner()
      });
    }
    
    // Get or create viewer map for this story
    if (!viewersPerStory.has(currentStoryId)) {
      viewersPerStory.set(currentStoryId, new Map());
    }
    const storyViewers = viewersPerStory.get(currentStoryId);
    
    // Get reactions from DOM
    const domReactions = parseReactionsFromDOM();
    
    // Add viewers with composite key deduplication
    viewers.forEach(viewer => {
      const compositeId = `${currentStoryId}_${viewer.username}`;
      
      // Merge with DOM reaction if available
      const reaction = viewer.reaction || domReactions.get(viewer.username) || null;
      
      storyViewers.set(viewer.username, {
        ...viewer,
        compositeId: compositeId,
        storyId: currentStoryId,
        timestamp: timestamp || Date.now(),
        reaction: reaction
      });
    });
    
    // Store in IndexedDB
    if (db) {
      const transaction = db.transaction(['viewers'], 'readwrite');
      const store = transaction.objectStore('viewers');
      
      viewers.forEach(viewer => {
        const record = {
          compositeId: `${currentStoryId}_${viewer.username}`,
          storyId: currentStoryId,
          username: viewer.username,
          ...viewer,
          timestamp: timestamp || Date.now()
        };
        store.put(record);
      });
    }
    
    // Mirror to localStorage for UI
    mirrorToLocalStorage();
    
    const domTotal = parseViewerCount();
    console.log(`[SL:backend] Total collected: ${storyViewers.size}/${domTotal || totalCount || '?'}`);
  }
  
  // Set up DOM observers
  function setupDOMObservers() {
    // Observer for progress bars (story count)
    if (!domObservers.progressBar) {
      domObservers.progressBar = new MutationObserver(() => {
        const storyMeta = parseStoryCount();
        if (storyMeta.total > 0) {
          console.log(`[SL:backend] Story ${storyMeta.current} of ${storyMeta.total}`);
          mirrorToLocalStorage();
        }
      });
      
      // Try to observe progress container
      const progressContainer = document.querySelector('div[style*="transform"]')?.parentElement;
      if (progressContainer) {
        domObservers.progressBar.observe(progressContainer, { 
          childList: true, 
          subtree: true, 
          attributes: true,
          attributeFilter: ['style']
        });
      }
    }
    
    // Observer for viewer modal
    if (!domObservers.viewerModal) {
      domObservers.viewerModal = new MutationObserver(() => {
        const viewerCount = parseViewerCount();
        const reactions = parseReactionsFromDOM();
        
        if (viewerCount !== null || reactions.size > 0) {
          console.log(`[SL:backend] DOM shows ${viewerCount} total viewers, ${reactions.size} reactions`);
          
          // Update existing viewers with reactions
          const storyViewers = viewersPerStory.get(currentStoryId);
          if (storyViewers) {
            reactions.forEach((emoji, username) => {
              const viewer = storyViewers.get(username);
              if (viewer && !viewer.reaction) {
                viewer.reaction = emoji;
              }
            });
          }
          
          mirrorToLocalStorage();
        }
      });
      
      // Observe entire document for modal appearance
      domObservers.viewerModal.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  
  // Handle story changes
  function handleStoryChange(data) {
    const { mediaId } = data;
    
    if (mediaId && mediaId !== currentStoryId) {
      console.log(`[SL:backend] Story changed: ${currentStoryId} -> ${mediaId}`);
      currentStoryId = mediaId;
      
      // Track new story
      if (!storiesMap.has(currentStoryId)) {
        storiesMap.set(currentStoryId, {
          id: currentStoryId,
          firstSeen: Date.now(),
          owner: extractStoryOwner()
        });
      }
      
      // Load cached data for this story
      loadCachedViewers(currentStoryId).then(() => {
        mirrorToLocalStorage();
      });
    }
  }
  
  // Load cached viewers from IndexedDB
  async function loadCachedViewers(storyId) {
    if (!db || !storyId) return;
    
    try {
      const transaction = db.transaction(['viewers'], 'readonly');
      const store = transaction.objectStore('viewers');
      const index = store.index('storyId');
      const request = index.getAll(storyId);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const viewers = request.result;
          
          if (!viewersPerStory.has(storyId)) {
            viewersPerStory.set(storyId, new Map());
          }
          const storyViewers = viewersPerStory.get(storyId);
          
          viewers.forEach(viewer => {
            storyViewers.set(viewer.username, viewer);
          });
          
          console.log(`[SL:backend] Loaded ${viewers.length} cached viewers for story ${storyId}`);
          resolve();
        };
        request.onerror = () => resolve();
      });
    } catch (e) {
      console.error('[SL:backend] Error loading cached viewers:', e);
    }
  }
  
  // Clean old data
  async function cleanOldData() {
    if (!db) return;
    
    const cutoff = Date.now() - (CONFIG.RETENTION_HOURS * 60 * 60 * 1000);
    
    const transaction = db.transaction(['viewers', 'stories'], 'readwrite');
    const viewerStore = transaction.objectStore('viewers');
    const storyStore = transaction.objectStore('stories');
    
    // Delete old viewers
    const viewerIndex = viewerStore.index('timestamp');
    const viewerRange = IDBKeyRange.upperBound(cutoff);
    viewerIndex.openCursor(viewerRange).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    // Delete old stories
    const storyIndex = storyStore.index('timestamp');
    const storyRange = IDBKeyRange.upperBound(cutoff);
    storyIndex.openCursor(storyRange).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    console.log('[SL:backend] Cleaned data older than', new Date(cutoff));
  }
  
  // Listen for messages from injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'STORYLISTER_VIEWERS_CHUNK') {
      processViewerChunk(event.data.data);
    } else if (event.data.type === 'STORYLISTER_STORY_CHANGED') {
      handleStoryChange(event.data.data);
    }
  });
  
  // Listen for UI requests
  window.addEventListener('storylister:request_data', () => {
    mirrorToLocalStorage();
  });
  
  // Listen for panel open/close to manage checkpoints
  window.addEventListener('storylister:panel_opened', () => {
    const storyOwner = extractStoryOwner();
    if (storyOwner) {
      saveCheckpoint(storyOwner);
    }
  });
  
  // Monitor URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const newStoryId = extractStoryId();
      
      if (newStoryId !== currentStoryId) {
        handleStoryChange({ mediaId: newStoryId });
      }
      
      // Re-setup DOM observers if needed
      setupDOMObservers();
    }
  }, 1000);
  
  // Initialize
  initDB().then(() => {
    console.log('[SL:backend] Backend ready');
    cleanOldData();
    
    // Initial story detection
    currentStoryId = extractStoryId();
    if (currentStoryId) {
      console.log(`[SL:backend] Initial story ID: ${currentStoryId}`);
      storiesMap.set(currentStoryId, {
        id: currentStoryId,
        firstSeen: Date.now(),
        owner: extractStoryOwner()
      });
      
      // Load cached data
      loadCachedViewers(currentStoryId).then(() => {
        mirrorToLocalStorage();
      });
    }
    
    // Setup DOM observers
    setTimeout(setupDOMObservers, 2000); // Wait for page to load
    
    // Clean old data periodically
    setInterval(cleanOldData, 60 * 60 * 1000); // Every hour
  }).catch(error => {
    console.error('[SL:backend] Failed to initialize:', error);
  });
  
  // Public API for UI
  window.StorylisterCore = {
    getState: () => ({
      storyId: currentStoryId,
      stories: Array.from(storiesMap.values()),
      total: viewersPerStory.get(currentStoryId)?.size || 0,
      viewers: Array.from(viewersPerStory.get(currentStoryId)?.values() || [])
    }),
    
    getStoryViewers: (storyId) => {
      return Array.from(viewersPerStory.get(storyId)?.values() || []);
    },
    
    getAllStories: () => {
      return Array.from(storiesMap.values());
    },
    
    onUpdate: (callback) => {
      window.addEventListener('storylister:data_updated', (e) => {
        callback({
          storyId: e.detail.storyId,
          total: e.detail.viewerCount,
          viewers: Array.from(viewersPerStory.get(e.detail.storyId)?.values() || []),
          meta: e.detail
        });
      });
    },
    
    refreshData: () => {
      mirrorToLocalStorage();
    },
    
    updateCheckpoint: () => {
      const storyOwner = extractStoryOwner();
      if (storyOwner) {
        saveCheckpoint(storyOwner);
      }
    }
  };
  
})();