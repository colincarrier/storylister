// content-backend.js — passive data & account gating (no heavy UI here)
(() => {
  'use strict';

  // ----------------------------
  // Settings (chrome.storage.sync)
  // ----------------------------
  const DEFAULT_SETTINGS = {
    autoOpen: true,
    pauseVideos: true,
    proMode: false,
    accountHandle: ""   // populated the first time we detect your own story
  };
  const SETTINGS_KEY = 'storylister_settings';

  const Settings = {
    cache: { ...DEFAULT_SETTINGS },
    async load() {
      return new Promise(resolve => {
        chrome.storage.sync.get([SETTINGS_KEY], (obj) => {
          const next = { ...DEFAULT_SETTINGS, ...(obj[SETTINGS_KEY] || {}) };
          this.cache = next;
          resolve(next);
        });
      });
    },
    async save(partial) {
      const next = { ...this.cache, ...partial };
      this.cache = next;
      return new Promise(resolve => {
        chrome.storage.sync.set({ [SETTINGS_KEY]: next }, resolve);
      });
    }
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[SETTINGS_KEY]?.newValue) {
      Settings.cache = { ...DEFAULT_SETTINGS, ...changes[SETTINGS_KEY].newValue };
      window.dispatchEvent(new CustomEvent('storylister:settings_updated', { detail: Settings.cache }));
    }
  });

  // -----------------------------------
  // Utility: safe scheduling (no random)
  // -----------------------------------
  const Perf = {
    schedule(cb, timeout = 1500) {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(cb, { timeout });
      } else {
        requestAnimationFrame(() => setTimeout(cb, 0));
      }
    }
  };

  // -----------------------------------
  // Account & page detection
  // -----------------------------------
  function detectStoryOwnerFromURL() {
    // /stories/<username>/<mediaId>
    const m = location.pathname.match(/\/stories\/([^\/]+)(?:\/|$)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // "Seen by" exists only on your own story
  function findSeenByElement() {
    // 1) explicit "seen_by" href Instagram uses in the viewers pill
    const byHref = document.querySelector('a[href*="/seen_by/"]');
    if (byHref) return byHref;

    // 2) aria-label variants
    const aria = Array.from(document.querySelectorAll('[aria-label]'))
      .find(el => /seen by/i.test(el.getAttribute('aria-label') || ''));
    if (aria) return aria;

    // 3) Look for viewer metrics using more robust detection
    const viewerMetrics = [...document.querySelectorAll('span, div')]
      .filter(el => /^Seen by( \d+)?$/i.test(el.textContent?.trim() || ''));
    if (viewerMetrics.length > 0) return viewerMetrics[0];
    
    return null;
  }

  function isOwnStoryView() {
    if (!location.pathname.includes('/stories/')) return false;
    
    // Verify account ownership for Free tier
    const urlOwner = detectStoryOwnerFromURL();
    const savedHandle = Settings.cache.accountHandle;
    if (!Settings.cache.proMode && savedHandle && urlOwner && savedHandle !== urlOwner) {
      return false; // Different account in Free mode
    }
    
    return !!findSeenByElement();
  }

  // -----------------------------------
  // One-account gating
  // -----------------------------------
  let shownFreeToastForThisStory = false;

  function shouldShowFreeToast(currentOwner) {
    // Show only when:
    // 1) We are on a story that actually has "Seen by" (i.e., your own story UI is present)
    // 2) The username in the upper-left (URL owner) is different than the stored handle
    if (!isOwnStoryView()) return false;
    if (!currentOwner) return false;

    const saved = Settings.cache.accountHandle || "";
    if (!saved) {
      // First time: bind to this handle
      Settings.save({ accountHandle: currentOwner });
      return false;
    }
    return saved !== currentOwner;
  }

  function renderFreeAccountToast(savedHandle) {
    if (shownFreeToastForThisStory) return;
    shownFreeToastForThisStory = true;

    const wrap = document.createElement('div');
    wrap.style.cssText = `
      position: fixed; top: 20px; right: 24px; z-index: 999999;
      max-width: 320px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    `;
    const card = document.createElement('div');
    card.style.cssText = `
      background: #fff; border: 2px solid #8b5cf6; border-radius: 12px; padding: 14px 16px;
      box-shadow: 0 8px 28px rgba(0,0,0,.12);
    `;
    card.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">Storylister (Free)</div>
      <div style="font-size:13px; color:#444; line-height:1.4; margin-bottom:12px;">
        Free plan works on one account only <b>@${savedHandle}</b>.  
        Upgrade to Pro to use multiple accounts.
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="sl-toast-close" style="border:0; padding:6px 10px; border-radius:8px; background:#8b5cf6; color:#fff; cursor:pointer;">Got it</button>
      </div>
    `;
    wrap.appendChild(card);
    document.documentElement.appendChild(wrap);
    card.querySelector('#sl-toast-close')?.addEventListener('click', () => wrap.remove());
    setTimeout(() => wrap.remove(), 8000);
  }

  // -----------------------------------
  // Tag storage (per-account key)
  // -----------------------------------
  function tagsKey(handle) {
    return `sl_tags_${handle || 'default'}`;
  }

  async function eraseTagsForHandleIfFree(oldHandle) {
    if (!oldHandle) return;
    const pro = !!Settings.cache.proMode;
    if (pro) return; // Pro keeps tags when handle is cleared
    return new Promise(resolve => {
      chrome.storage.local.remove([tagsKey(oldHandle)], resolve);
    });
  }

  // -----------------------------------
  // Network bridge & data mirroring
  // -----------------------------------
  // Inject network interceptor once
  function injectNetworkScriptOnce() {
    if (document.getElementById('storylister-injected')) return;
    const s = document.createElement('script');
    s.id = 'storylister-injected';
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // Compact in-memory state
  const state = {
    currentStoryId: null,
    stories: new Map(), // storyId -> Map(userId -> viewer)
    totals: new Map()   // storyId -> total viewers from DOM or network
  };

  function ensureBucket(storyId) {
    const sid = String(storyId);
    if (!state.stories.has(sid)) state.stories.set(sid, new Map());
    return state.stories.get(sid);
  }

  function mirrorToLegacy() {
    // panel_story_store: { [storyId]: { viewers: [[id, obj]...], fetchedAt, totalReported, domTotal, collectedCount } }
    const store = {};
    for (const [sid, map] of state.stories.entries()) {
      const entries = [];
      map.forEach(v => entries.push([v.id, v]));
      store[sid] = {
        viewers: entries,
        fetchedAt: Date.now(),
        generation: 0,
        totalReported: state.totals.get(sid) ?? null,
        domTotal: state.totals.get(sid) ?? null,
        collectedCount: entries.length
      };
    }
    try {
      localStorage.setItem('panel_story_store', JSON.stringify(store));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', {
        detail: { storyId: state.currentStoryId }
      }));
    } catch {}
  }

  // Listen for viewer chunks from injected.js
  window.addEventListener('message', (evt) => {
    if (evt.source !== window) return;
    const msg = evt.data;
    if (!msg || typeof msg !== 'object') return;

    // Only process data on our own stories
    if (!isOwnStoryView()) return;
    
    // Block data collection on non-primary accounts in Free mode
    const owner = detectStoryOwnerFromURL();
    if (!Settings.cache.proMode && owner) {
      const saved = Settings.cache.accountHandle;
      if (saved && saved !== owner) {
        // Don't process data for non-primary accounts
        return;
      }
    }

    if (msg.type === 'STORYLISTER_VIEWERS_CHUNK' && msg.data) {
      const { mediaId, viewers, totalCount } = msg.data;
      const bucket = ensureBucket(mediaId || 'unknown');
      if (Number.isFinite(totalCount)) state.totals.set(String(mediaId), totalCount);
      for (const u of viewers) {
        const id = String(u.id || u.pk);
        bucket.set(id, {
          id,
          username: u.username || '',
          full_name: u.full_name || '',
          profile_pic_url: u.profile_pic_url || u.profile_pic_url_hd || '',
          is_verified: !!u.is_verified
        });
      }
      mirrorToLegacy();
    }

    if (msg.type === 'STORYLISTER_DOM_TOTAL' && msg.data) {
      const { mediaId, total } = msg.data;
      if (Number.isFinite(total)) {
        state.totals.set(String(mediaId), total);
        mirrorToLegacy();
      }
    }
  });

  // -----------------------------------
  // Enhanced Viewer Experience
  // -----------------------------------
  const ViewerExperience = {
    enhancementApplied: false,
    
    async enhanceViewerAccess() {
      await Settings.load(); // Ensure settings are loaded
      if (!Settings.cache.autoOpen) return;
      if (!isOwnStoryView()) return;
      if (this.enhancementApplied) return;
      
      // Check if we're allowed to use the extension on this account
      const owner = detectStoryOwnerFromURL();
      if (shouldShowFreeToast(owner)) {
        // Don't auto-open on non-primary accounts in Free mode
        return;
      }
      
      const analyticsElement = Array.from(document.querySelectorAll('span, div')).find(el => {
        const text = el.textContent?.trim() || '';
        if (/^Seen by( \d+)?$/i.test(text)) {
          const interactiveParent = el.closest('[role="button"], [tabindex="0"], a, button');
          return interactiveParent || el.getAttribute('role') === 'button';
        }
        return false;
      });
      
      if (analyticsElement && !document.querySelector('[aria-label="Viewers"]')) {
        const interactiveElement = analyticsElement.closest('[role="button"], [tabindex="0"]') || analyticsElement;
        
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            try {
              interactiveElement.click();
              this.enhancementApplied = true;
              console.log('[Storylister] Enhanced viewer analytics access');
              
              // Initialize network observer after UI update
              setTimeout(() => injectNetworkScriptOnce(), 300);
            } catch (e) {
              console.warn('[Storylister] Enhancement failed:', e);
            }
          }, { timeout: 1000 });
        } else {
          setTimeout(() => {
            try {
              interactiveElement.click();
              this.enhancementApplied = true;
            } catch (e) {
              console.warn('[Storylister] Enhancement failed:', e);
            }
          }, 300);
        }
      }
    },
    
    reset() {
      this.enhancementApplied = false;
    }
  };
  
  // Backwards compatibility wrapper
  function autoOpenIfAllowed() {
    ViewerExperience.enhanceViewerAccess();
  }

  // -----------------------------------
  // Mutation observers (guarded)
  // -----------------------------------
  function startObservers() {
    // Guard body existence (fixes "observe … not of type Node")
    const target = document.body || document.documentElement;
    if (!target) {
      requestAnimationFrame(startObservers);
      return;
    }

    // Observe SPA navigations and DOM changes
    const mo = new MutationObserver(() => {
      // Only inject network script if allowed on this account AND we're on our own story
      if (!isOwnStoryView()) return; // Only work on our own stories
      
      const owner = detectStoryOwnerFromURL();
      if (!Settings.cache.proMode && owner && Settings.cache.accountHandle && Settings.cache.accountHandle !== owner) {
        // Don't inject on non-primary accounts in Free mode
      } else {
        injectNetworkScriptOnce();
      }

      // Watch story id from URL
      const m = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
      if (m) {
        const sid = m[1];
        if (sid !== state.currentStoryId) {
          state.currentStoryId = sid;

          // Bind handle first time we see our own story
          const owner = detectStoryOwnerFromURL();
          if (isOwnStoryView() && owner && !Settings.cache.accountHandle) {
            Settings.save({ accountHandle: owner });
          }

          // Reset enhancement state for new story
          ViewerExperience.reset();
          
          // Show free toast only when: Seen by exists AND owner ≠ saved
          if (shouldShowFreeToast(owner)) {
            renderFreeAccountToast(Settings.cache.accountHandle);
          } else {
            // Schedule UX enhancements
            requestAnimationFrame(() => {
              ViewerExperience.enhanceViewerAccess();
            });
          }
        }
      }
    });

    // Optimize observer performance
    mo.observe(target, { 
      childList: true, 
      subtree: true,
      attributes: false, // Reduce observer overhead
      characterData: false
    });
  }

  // -----------------------------------
  // Cross-script messaging for popup
  // -----------------------------------
  window.addEventListener('message', async (evt) => {
    if (evt.source !== window) return;
    if (!evt.data || typeof evt.data !== 'object') return;

    // Popup requests handle clear
    if (evt.data.type === 'SL_CLEAR_ACCOUNT_HANDLE') {
      const old = Settings.cache.accountHandle || "";
      await Settings.save({ accountHandle: "" });
      await eraseTagsForHandleIfFree(old);
      window.dispatchEvent(new CustomEvent('storylister:account_cleared'));
    }
  });

  // -----------------------------------
  // Initialize
  // -----------------------------------
  (async function init() {
    await Settings.load();
    // Don't inject network script here - let the observer handle it with proper gating
    startObservers();
  })();
})();