# Storylister v16.3 - Critical Key Unification Fix

## Release Date: October 30, 2025

## Overview
Version 16.3 fixes the critical key mismatch bug that was causing Instagram to hang, viewer counts to overflow, and data to not clear between stories. The root cause was that v16.2 was storing viewers under unique story keys (`stories:owner:mediaId`) but Count Sentry and the UI were still reading from `location.pathname`.

## The Root Cause (v16.2 Bug)
The interceptor stored viewers under: `stories:johndoe:12345678`  
But Count Sentry read from: `/stories/johndoe/`  
Result: Count Sentry never found viewers → infinite scrolling → Instagram hang

## Critical Fixes in v16.3

### 1. ✅ **Unified Key System**
- **Problem:** Key mismatch between storage (unique keys) and reading (pathname)
- **Solution:** All components now use the same unique story key throughout:
  - Interceptor writes to `stories:owner:mediaId`
  - Count Sentry reads from `stories:owner:mediaId`
  - UI listens for active key broadcasts and reads from `stories:owner:mediaId`
- **Impact:** No more infinite scrolling, no more Instagram hangs

### 2. ✅ **Fixed Count Overflow**
- **Problem:** Viewer counts exceeded Instagram's reported count
- **Solution:** 
  - Count Sentry now reads from the correct key
  - Double overflow protection: before AND after insert
  - Immediate stop if count exceeds Instagram's number
- **Impact:** Viewer counts now exactly match Instagram's count

### 3. ✅ **Fixed Cross-Story Contamination**
- **Problem:** Viewers from previous stories carried over to new stories
- **Solution:**
  - onDOMChange now clears the correct unique story map
  - Backend broadcasts active story key to UI
  - UI updates immediately when story changes
- **Impact:** Each story shows only its own viewers

### 4. ✅ **Fixed Reaction Merge**
- **Problem:** mergeReactsFromDialogIntoMap was called with Map instead of key string
- **Solution:** Fixed all calls to pass the story key string
- **Impact:** Reactions now properly merge from DOM fallback

## Technical Details

### Key Broadcasting System
```javascript
// Backend announces active story key
state.currentKey = state.lastStoryKey = ukey;
window.dispatchEvent(new CustomEvent('storylister:active_media', { 
  detail: { storyId: ukey } 
}));

// UI listens and updates
window.addEventListener('storylister:active_media', (e) => {
  ACTIVE_MEDIA_ID_FROM_BACKEND = e.detail?.storyId || null;
  loadViewersFromStorage();
  updateViewerList();
});
```

### Count Sentry Fix
```javascript
// Before (v16.2 - BROKEN)
const map = state.viewerStore.get(getStorageKey()); // Wrong key!

// After (v16.3 - FIXED)
const currentKey = state.lastStoryKey || state.currentKey;
const map = currentKey ? state.viewerStore.get(currentKey) : null;
```

### Double Overflow Protection
```javascript
// Check BEFORE insert
if (loaded > totalCount) {
  map.clear();
  stopCountSentry();
  return;
}

// Check AFTER insert
const loadedAfter = map.size;
if (loadedAfter > totalCount) {
  map.clear();
  stopCountSentry();
  return;
}
```

## Installation
1. **IMPORTANT**: Uninstall v16.2 completely (it has critical bugs)
2. Load `storylister-v16.3.zip` in Chrome Extensions (Developer Mode)
3. Navigate to Instagram Stories - works immediately!
4. No more hangs, exact counts, perfect story switching

## Testing Checklist
- [x] Instagram doesn't hang when scrolling viewers
- [x] Viewer counts match Instagram exactly (never exceed)
- [x] Stories play smoothly without auto-pausing
- [x] Switching stories clears previous viewers
- [x] Count Sentry reaches parity and stops
- [x] Reactions display correctly
- [x] Extension works on first install

## Files Changed
- `manifest.json` - Version bump to 16.3
- `content-backend.js` - Unified all operations on unique story keys, fixed Count Sentry, added key broadcasting, removed duplicate injection
- `content.js` - Listen for active key broadcasts, read from correct unique key

## Summary
v16.3 is a critical stability release that fixes the key mismatch regression from v16.2. All components now use the same unique story key system, preventing Instagram hangs, count overflows, and cross-story contamination. The extension is now production-ready with exact viewer counting and smooth story playback.