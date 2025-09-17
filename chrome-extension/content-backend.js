// content-backend.js — passive data layer & legacy bridge (no UI changes)
(() => {
  'use strict';

  const DEBUG = true;

  // ---------- Internal settings (no UI change yet) ----------
  const SETTINGS_KEY = 'storylister_settings';
  const DEFAULT_SETTINGS = { autoOpen: true, pauseVideos: true, proMode: false };

  const Settings = {
    get() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || DEFAULT_SETTINGS; }
      catch { return DEFAULT_SETTINGS; }
    },
    set(next) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
  };

  // ---------- Account awareness (no UI change) ----------
  function detectActiveUsername() {
    // 1) From story URL: /stories/<username>/<id>
    const m = location.pathname.match(/\/stories\/([^\/]+)(?:\/|$)/);
    if (m) return m[1];

    // 2) Heuristic: cursor/profile area (robust to class churn)
    const link = document.querySelector('a[href^="/"][href$="/"] img[alt*="profile picture"]')?.parentElement;
    if (link?.getAttribute('href')) return link.getAttribute('href').replace(/\//g, '') || null;

    // 3) Last resort: look for "'s profile picture" alt text
    const img = Array.from(document.querySelectorAll('img[alt]'))
      .find(el => /'s profile picture$/.test(el.alt));
    if (img) return img.alt.replace(/'s profile picture$/, '');

    return null;
  }

  function isOnOwnStory() {
    const m = location.pathname.match(/\/stories\/([^\/]+)\//);
    if (!m) return false;
    const storyOwner = m[1];
    const current = detectActiveUsername();
    return !!current && storyOwner === current;
  }

  // Free-tier binding to first account that uses it
  const FREE_ACCOUNT_KEY = 'storylister_free_account';
  function canUseForThisAccount() {
    const current = detectActiveUsername();
    if (!current) return false;
    let bound = localStorage.getItem(FREE_ACCOUNT_KEY);
    if (!bound) { localStorage.setItem(FREE_ACCOUNT_KEY, current); bound = current; }
    return bound === current;
  }

  function accountPrefix() {
    const u = detectActiveUsername() || 'default';
    return `sl_${u}_`;
  }

  // ---------- IndexedDB (compact per-story docs) ----------
  const idb = {
    db: null,
    async open() {
      if (this.db) return this.db;
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(`${accountPrefix()}db`, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('stories')) {
            const st = db.createObjectStore('stories', { keyPath: 'storyId' });
            st.createIndex('fetchedAt', 'fetchedAt');
          }
          if (!db.objectStoreNames.contains('checkpoints')) {
            db.createObjectStore('checkpoints', { keyPath: 'owner' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this.db;
    },
    async put(storeName, doc) {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(doc);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    },
    async get(storeName, id) {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async getAll(storeName) {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
  };

  // ---------- State ----------
  const state = {
    stories: new Map(),    // storyId -> Map(userId -> viewer)
    seenEver: new Set(JSON.parse(localStorage.getItem(accountPrefix() + 'seenEver') || '[]')),
    currentStoryId: null,
    storyMeta: {},         // storyId -> { index, total }
    totals: new Map(),     // storyId -> number (DOM total)
    checkpoints: new Map() // owner -> timestamp
  };

  function saveSeenEver() {
    localStorage.setItem(accountPrefix() + 'seenEver', JSON.stringify([...state.seenEver]));
  }

  // ---------- Native timing helpers (no randomness) ----------
  const Perf = {
    // frame-aligned scheduling that looks like render budgeting
    schedule(cb, timeout = 1500) {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(cb, { timeout });
      } else {
        requestAnimationFrame(() => setTimeout(cb, 0));
      }
    }
  };

  // ---------- Checkpoint management for NEW badges ----------
  async function loadCheckpoint(owner) {
    if (!owner) return null;
    const doc = await idb.get('checkpoints', owner).catch(() => null);
    if (doc) {
      state.checkpoints.set(owner, doc.timestamp);
      return doc.timestamp;
    }
    return null;
  }

  async function saveCheckpoint(owner) {
    if (!owner) return;
    const now = Date.now();
    state.checkpoints.set(owner, now);
    await idb.put('checkpoints', { owner, timestamp: now }).catch(e => {
      console.error('[SL:backend] Error saving checkpoint:', e);
    });
  }

  // ---------- Legacy mirror (keeps current UI working) ----------
  const LEGACY_CACHE_CAP = 5000;
  let mirrorTimer = null;

  function scheduleMirror() {
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(mirrorToLegacy, 150);
  }

  async function mirrorToLegacy() {
    mirrorTimer = null;

    const storyStore = {};
    const aggregate = [];
    const storyOwner = detectActiveUsername();
    const checkpoint = state.checkpoints.get(storyOwner) || 0;

    for (const [sid, map] of state.stories.entries()) {
      const entries = [];
      map.forEach(v => {
        const isNew = v.viewedAt > checkpoint;
        entries.push([v.id, {
          id: v.id,
          username: v.username,
          full_name: v.displayName,
          profile_pic_url: v.profilePic,
          is_verified: !!v.isVerified,
          is_private: !!v.isPrivate,
          follows_viewer: !!v.followsViewer,
          followed_by_viewer: !!v.followedByViewer,
          viewedAt: v.viewedAt,
          timestamp: v.viewedAt,
          isNew: isNew,
          reaction: v.reaction || null
        }]);
        aggregate.push([v.id, {
          id: v.id,
          username: v.username,
          full_name: v.displayName,
          profile_pic_url: v.profilePic,
          is_verified: !!v.isVerified,
          lastSeen: v.viewedAt
        }]);
        
        // Track in seenEver
        state.seenEver.add(v.id);
      });

      storyStore[sid] = { 
        viewers: entries, 
        fetchedAt: Date.now(), 
        generation: 0, 
        totalReported: state.totals.get(sid) ?? null,
        domTotal: state.totals.get(sid) ?? null,
        collectedCount: entries.length
      };
    }

    aggregate.sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
    const trimmed = aggregate.slice(0, LEGACY_CACHE_CAP);

    // Add story metadata
    const meta = {
      currentStoryId: state.currentStoryId,
      storyIndex: state.storyMeta[state.currentStoryId]?.index || 1,
      storyTotal: state.storyMeta[state.currentStoryId]?.total || 0,
      domTotal: state.totals.get(state.currentStoryId) ?? null
    };

    try {
      localStorage.setItem('panel_story_store', JSON.stringify(storyStore));
      localStorage.setItem('panel_viewer_cache', JSON.stringify(trimmed));
      localStorage.setItem('panel_global_seen', JSON.stringify([...state.seenEver]));
      localStorage.setItem('panel_story_meta', JSON.stringify(meta));
      saveSeenEver();
      if (DEBUG) console.log('[SL:backend] mirrored panel_* keys');
    } catch (e) {
      console.warn('[SL:backend] mirror failed', e);
    }

    // Notify UI
    window.dispatchEvent(new CustomEvent('storylister:data_updated', { 
      detail: { storyId: state.currentStoryId, count: storyStore[state.currentStoryId]?.viewers?.length || 0 } 
    }));
  }

  // ---------- Viewer ingestion ----------
  function normalizeViewer(u) {
    const id = String(u.id || u.pk);
    return {
      id,
      username: u.username || '',
      displayName: u.full_name || '',
      profilePic: u.profile_pic_url || u.profile_pic_url_hd || '',
      isVerified: !!u.is_verified,
      isPrivate: !!u.is_private,
      followsViewer: !!(u.follows_viewer || u?.friendship_status?.following),
      followedByViewer: !!(u.followed_by_viewer || u?.friendship_status?.followed_by),
      reaction: u.reaction || u.quick_reaction_emoji || u.reel_reaction || null,
      viewedAt: Date.now()
    };
  }

  function ensureBucket(storyId) {
    const sid = String(storyId);
    if (!state.stories.has(sid)) state.stories.set(sid, new Map());
    state.currentStoryId = sid;
    return state.stories.get(sid);
  }

  function extractStoryId() {
    const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  // Message bridge from injected.js
  window.addEventListener('message', (evt) => {
    if (evt.source !== window || !evt.data) return;
    const msg = evt.data;

    if (msg.type === 'STORYLISTER_VIEWERS_CHUNK' && msg.data) {
      const { mediaId, viewers, totalCount } = msg.data;
      const sid = String(mediaId || extractStoryId() || 'unknown');
      const bucket = ensureBucket(sid);

      if (Number.isFinite(totalCount)) state.totals.set(sid, totalCount);

      for (const u of viewers) {
        const v = normalizeViewer(u);
        if (!bucket.has(v.id)) {
          bucket.set(v.id, v);
        }
      }
      
      // persist compact doc
      idb.put('stories', { 
        storyId: sid, 
        viewers: Array.from(bucket.values()), 
        fetchedAt: Date.now(), 
        total: state.totals.get(sid) ?? null 
      }).catch(() => {});
      
      scheduleMirror();
    }

    if (msg.type === 'STORYLISTER_DOM_TOTAL' && msg.data) {
      const { mediaId, total } = msg.data;
      const sid = String(mediaId || extractStoryId() || 'unknown');
      if (Number.isFinite(total)) {
        state.totals.set(sid, total);
        scheduleMirror();
      }
    }

    if (msg.type === 'STORYLISTER_STORY_CHANGED' && msg.data) {
      const { storyId } = msg.data;
      state.currentStoryId = String(storyId);
      ensureBucket(state.currentStoryId);
      scheduleMirror();
    }
  });

  // ---------- DOM observers for story metadata ----------
  function parseStoryCount() {
    // Parse progress bars to get story count
    const progressBars = document.querySelectorAll('[role="progressbar"], [aria-label*="Story"] div[style*="width"]');
    if (progressBars.length > 0) {
      const index = Array.from(progressBars).findIndex(bar => {
        const style = window.getComputedStyle(bar);
        return style.width !== '0px' && style.width !== '100%';
      });
      
      if (state.currentStoryId) {
        state.storyMeta[state.currentStoryId] = {
          index: index >= 0 ? index + 1 : 1,
          total: progressBars.length
        };
      }
      
      return { index: index + 1, total: progressBars.length };
    }
    return null;
  }

  function parseViewerCount() {
    // Look for "Seen by X" in the DOM
    const patterns = [
      /Seen by (\d+)/i,
      /(\d+) viewers?/i,
      /Viewed by (\d+)/i
    ];
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent || '';
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const count = parseInt(match[1], 10);
          if (count > 0) {
            if (state.currentStoryId) {
              state.totals.set(state.currentStoryId, count);
            }
            return count;
          }
        }
      }
    }
    return null;
  }

  // ---------- Native-timing auto-open (no randomness), gated ----------
  function findSeenBy() {
    // Multiple selectors for robustness
    return document.querySelector('a[href*="/seen_by/"]') ||
           document.querySelector('[aria-label*="Seen by"]') ||
           document.querySelector('button:has-text("Seen by")') ||
           Array.from(document.querySelectorAll('div[role="button"]')).find(el => 
             el.textContent?.includes('Seen by'));
  }

  function autoOpenIfAllowed() {
    const settings = Settings.get();
    if (!settings.autoOpen) return;
    if (!isOnOwnStory()) return;
    if (!canUseForThisAccount()) return;

    const el = findSeenBy();
    if (!el) {
      // Try again in a moment
      Perf.schedule(autoOpenIfAllowed, 2000);
      return;
    }

    // Let the browser choose a natural moment to act
    Perf.schedule(() => {
      // click via a standard, frame-aligned event (no mouse jitter)
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      if (DEBUG) console.log('[SL:backend] Auto-opened viewer list');
      
      // Save checkpoint when opening
      const owner = detectActiveUsername();
      if (owner) {
        saveCheckpoint(owner);
      }
    });
  }

  // ---------- Script injection (with retry safety) ----------
  function injectScript() {
    if (document.getElementById('storylister-injected')) return;
    
    const script = document.createElement('script');
    script.id = 'storylister-injected';
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() { this.remove(); };
    
    (document.head || document.documentElement).appendChild(script);
    if (DEBUG) console.log('[SL:backend] Injected script');
  }

  // ---------- Initialization ----------
  // Observe navigation to trigger auto-open once per story
  let lastPath = null;
  const navObserver = new MutationObserver(() => {
    const p = location.pathname;
    if (p === lastPath) return;
    lastPath = p;

    // Parse story metadata when navigating
    parseStoryCount();
    parseViewerCount();

    // only on your own story
    if (/^\/stories\//.test(p) && isOnOwnStory()) {
      state.currentStoryId = extractStoryId();
      Perf.schedule(autoOpenIfAllowed);
    }
  });
  
  navObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // DOM observer for viewer counts
  const domObserver = new MutationObserver(() => {
    const count = parseViewerCount();
    const storyMeta = parseStoryCount();
    if (count !== null || storyMeta !== null) {
      scheduleMirror();
    }
  });
  
  domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Listen for panel events
  window.addEventListener('storylister:panel_opened', () => {
    const owner = detectActiveUsername();
    if (owner && isOnOwnStory()) {
      if (DEBUG) console.log('[SL:backend] Panel opened, saving checkpoint');
      saveCheckpoint(owner);
      // Reload data to update NEW flags
      Perf.schedule(() => scheduleMirror(), 100);
    }
  });

  window.addEventListener('storylister:request_data', () => {
    scheduleMirror();
  });

  // Initial setup
  async function initialize() {
    // Load checkpoint for current user
    const owner = detectActiveUsername();
    if (owner) {
      await loadCheckpoint(owner);
    }

    // Inject script
    injectScript();
    
    // Parse initial state
    parseStoryCount();
    parseViewerCount();
    
    // Check for auto-open
    Perf.schedule(autoOpenIfAllowed);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose API for extension popup
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.action === 'checkStoryViewer') {
        sendResponse({ 
          active: isOnOwnStory(), 
          storyId: state.currentStoryId,
          username: detectActiveUsername(),
          canUse: canUseForThisAccount()
        });
        return false;
      }
    });
  }

  if (DEBUG) console.log('[SL:backend] Ready on', location.pathname);
})();