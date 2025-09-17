// Storylister Backend - Data Layer Only
// This script handles data collection and storage with localStorage bridge
// No UI elements - UI is handled by content.js

(function() {
  console.log('[SL:backend] Initializing backend data layer');
  
  const CONFIG = {
    RETENTION_HOURS: 24,
    MAX_STORIES_KEPT: 3,
    MAX_CACHE_SIZE: 5000,
    DB_NAME: 'StoryLister',
    DB_VERSION: 1
  };
  
  let db = null;
  let currentStoryId = null;
  let viewersMap = new Map();
  
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
          const viewerStore = db.createObjectStore('viewers', { keyPath: 'id' });
          viewerStore.createIndex('storyId', 'storyId', { unique: false });
          viewerStore.createIndex('username', 'username', { unique: false });
          viewerStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('stories')) {
          const storyStore = db.createObjectStore('stories', { keyPath: 'id' });
          storyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  // Extract story ID from URL
  function extractStoryId() {
    const match = window.location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }
  
  // Mirror data to localStorage for UI compatibility
  function mirrorToLocalStorage() {
    try {
      // Create panel_story_store format
      const storyStore = {};
      const viewerCache = {};
      const globalSeen = new Set();
      
      // Group viewers by story
      viewersMap.forEach((viewer, username) => {
        const storyId = viewer.storyId || currentStoryId;
        
        if (!storyStore[storyId]) {
          storyStore[storyId] = {
            viewers: [],
            timestamp: Date.now(),
            totalCount: 0
          };
        }
        
        // Add to story store
        storyStore[storyId].viewers.push([viewer.id, {
          username: viewer.username,
          full_name: viewer.full_name || viewer.displayName || viewer.username,
          profile_pic_url: viewer.profile_pic_url || '',
          is_verified: viewer.is_verified || false,
          is_private: viewer.is_private || false,
          followed_by_viewer: viewer.followed_by_viewer || viewer.isFollower || false,
          follows_viewer: viewer.follows_viewer || viewer.isFollowing || false,
          timestamp: viewer.timestamp || Date.now()
        }]);
        
        storyStore[storyId].totalCount = storyStore[storyId].viewers.length;
        
        // Add to viewer cache
        viewerCache[username] = {
          ...viewer,
          lastSeen: Date.now()
        };
        
        // Add to global seen
        globalSeen.add(username);
      });
      
      // Write to localStorage
      localStorage.setItem('panel_story_store', JSON.stringify(storyStore));
      
      // Limit viewer cache size
      const cacheEntries = Object.entries(viewerCache);
      if (cacheEntries.length > CONFIG.MAX_CACHE_SIZE) {
        const limited = Object.fromEntries(cacheEntries.slice(-CONFIG.MAX_CACHE_SIZE));
        localStorage.setItem('panel_viewer_cache', JSON.stringify(limited));
      } else {
        localStorage.setItem('panel_viewer_cache', JSON.stringify(viewerCache));
      }
      
      localStorage.setItem('panel_global_seen', JSON.stringify(Array.from(globalSeen)));
      
      console.log(`[SL:backend] Mirrored ${viewersMap.size} viewers to localStorage`);
      
      // Dispatch event for UI
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { 
        detail: { 
          storyId: currentStoryId,
          viewerCount: viewersMap.size,
          totalCount: viewersMap.size
        }
      }));
      
    } catch (error) {
      console.error('[SL:backend] Error mirroring to localStorage:', error);
    }
  }
  
  // Process viewer chunks from interceptor
  function processViewerChunk(data) {
    const { mediaId, viewers, totalCount } = data;
    
    if (!viewers || viewers.length === 0) return;
    
    currentStoryId = mediaId || extractStoryId();
    console.log(`[SL:backend] Processing ${viewers.length} viewers for story ${currentStoryId}`);
    
    // Add viewers to map (deduped by username)
    viewers.forEach(viewer => {
      viewersMap.set(viewer.username, {
        ...viewer,
        storyId: currentStoryId,
        timestamp: Date.now(),
        id: viewer.id || viewer.pk || `${currentStoryId}_${viewer.username}`
      });
    });
    
    // Store in IndexedDB
    if (db) {
      const transaction = db.transaction(['viewers'], 'readwrite');
      const store = transaction.objectStore('viewers');
      
      viewers.forEach(viewer => {
        const record = {
          id: `${currentStoryId}_${viewer.username}`,
          storyId: currentStoryId,
          username: viewer.username,
          ...viewer,
          timestamp: Date.now()
        };
        store.put(record);
      });
    }
    
    // Mirror to localStorage for UI
    mirrorToLocalStorage();
    
    console.log(`[SL:backend] Total viewers collected: ${viewersMap.size}/${totalCount || '?'}`);
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
    }
  });
  
  // Listen for UI requests
  window.addEventListener('storylister:request_data', () => {
    mirrorToLocalStorage();
  });
  
  // Monitor URL changes
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const newStoryId = extractStoryId();
      
      if (newStoryId !== currentStoryId) {
        console.log(`[SL:backend] Story changed: ${currentStoryId} -> ${newStoryId}`);
        currentStoryId = newStoryId;
        
        // Clear viewers for new story
        viewersMap.clear();
        
        // Load existing data for this story from IndexedDB
        if (db && currentStoryId) {
          const transaction = db.transaction(['viewers'], 'readonly');
          const store = transaction.objectStore('viewers');
          const index = store.index('storyId');
          const request = index.getAll(currentStoryId);
          
          request.onsuccess = () => {
            const viewers = request.result;
            viewers.forEach(viewer => {
              viewersMap.set(viewer.username, viewer);
            });
            console.log(`[SL:backend] Loaded ${viewers.length} cached viewers for story ${currentStoryId}`);
            mirrorToLocalStorage();
          };
        }
      }
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
    }
    
    // Clean old data periodically
    setInterval(cleanOldData, 60 * 60 * 1000); // Every hour
  }).catch(error => {
    console.error('[SL:backend] Failed to initialize:', error);
  });
  
  // Public API for UI
  window.StorylisterCore = {
    getState: () => ({
      storyId: currentStoryId,
      total: viewersMap.size,
      viewers: Array.from(viewersMap.values())
    }),
    
    onUpdate: (callback) => {
      window.addEventListener('storylister:data_updated', (e) => {
        callback({
          storyId: e.detail.storyId,
          total: e.detail.viewerCount,
          viewers: Array.from(viewersMap.values())
        });
      });
    },
    
    refreshData: () => {
      mirrorToLocalStorage();
    }
  };
  
})();