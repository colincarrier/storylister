# Storylister v15.4 - Critical Navigation & Detection Fixes

## Release Date: September 24, 2025

## Overview

This release applies 4 critical improvements from ChatGPT's latest analysis to fix navigation issues and improve story detection.

## Critical Fixes Applied

### 1. MediaId Change Detection 🔄
**Prevents data mixing during back/forward navigation**
- Detects when a new story loads under the same pathname
- Resets viewer map when mediaId changes for a key
- Fixes incorrect viewer counts when using browser navigation
- Prevents stale data from appearing after back/forward

### 2. DOM-Based Reaction Fallback ❤️
**Adds redundancy for reaction detection**
- New `mergeReactsFromDialogIntoMap()` function
- Looks for heart icons in the viewer dialog DOM
- Marks users as reacted when API data is missing
- Provides backup when network response lacks reaction data

### 3. Enhanced Cache Structure 📦
**Stores mediaId with cached data**
```js
store[key] = { 
  mediaId: currentMediaId,  // NEW: Helps detect story changes
  viewers: Array.from(map.entries()), 
  fetchedAt: Date.now() 
};
```
- Enables story change detection on page reload
- Prevents serving wrong data after navigation

### 4. Simplified Own Story Detection ✅
**More reliable story ownership check**
- New `isOwnStory()` function with bulletproof logic
- Checks for "Seen by" control (only on YOUR stories)
- No complex account checking needed
- Works immediately on first story

## Technical Details

### Before v15.4 Issues:
- Data mixed between stories during back/forward navigation
- Wrong viewer counts after using browser history
- Missing reactions when API didn't provide data
- Complex account checking logic sometimes failed

### After v15.4 Fixes:
- Each story's data isolated by mediaId tracking
- Browser navigation correctly resets viewer data
- Reactions detected from both API and DOM
- Simple "Seen by" presence determines ownership

## Installation

1. Download `storylister-v15.4.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to test

## Testing Focus Areas

✅ Navigate back/forward between stories - data should reset correctly  
✅ Check reactions work even when API doesn't provide them  
✅ Verify panel only shows on YOUR stories (with "Seen by")  
✅ First story should auto-open and load viewers properly  
✅ Viewer counts should match after navigation  

## Note

This version keeps all improvements from v15.3 and adds critical fixes for navigation stability and detection reliability.