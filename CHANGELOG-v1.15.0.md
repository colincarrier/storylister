# Storylister v1.15.0 - Surgical Bug Fixes

## Release Date: September 23, 2025

## Overview

This release applies carefully selected surgical fixes to v14 based on expert recommendations. These fixes address critical issues without introducing the problems from the previous v15 attempt.

## Applied Fixes

### 1. Content-Backend.js Improvements

**Own Story Gating**
- Added `hasSeenByUI()` check to `isOnOwnStory()` function
- Extension now only activates on stories with "Seen by" button (your own stories)
- Prevents panel from appearing on other people's stories

**Observer Pattern Fix**
- Updated DOM observer to properly use `isOnOwnStory()` for gating
- Throttled observer to 200ms to prevent CPU thrashing
- Ensures first-story auto-open works correctly

### 2. Content.js Fixes

**Removed Undefined Function Calls**
- Removed calls to non-existent `handleBundledData()` function
- Fixed viewer data loading from cache

**Filter Logic Improvements**
- Added strict equality checks for follower/following filters
- Ensures accurate filtering: `isFollower === true` and `youFollow === true`

**Persistent Tags Per Account**
- Implemented `ownerKey()` function for account-specific tag storage
- Tags now persist across story navigation and page refreshes
- Uses both localStorage and chrome.storage for redundancy
- Tags no longer cleared when switching between stories

### 3. Content.css Enhancement

**Tag Button Clickability**
- Made entire tag button clickable with `user-select: none`
- Added `pointer-events: none` to child elements
- Prevents icons/text from stealing click events

### 4. Popup Integration

**Panel Toggle Functionality**
- Updated message handler to use `STORYLISTER_TOGGLE_PANEL` type
- Popup now properly toggles panel visibility
- Extension icon click → popup → toggle button works correctly

## Technical Details

### Key Principles Followed
- No inline script injection (avoids CSP violations)
- Maintains "own story" gate check
- Videos only pause when dialog is open
- Uses pathname as stable storage key
- No image attribute modifications
- No global event blocking

### Data Integrity
- Proper mediaId to pathname mapping
- Debounced cache mirroring
- Story-specific viewer storage

## Validation Checklist

✅ First story auto-opens viewer list  
✅ Viewer counts match "Seen by N" (±1)  
✅ No data mixing between stories  
✅ ❤️ Reacts filter works correctly  
✅ Follower/Following filters accurate  
✅ Tags persist across navigation  
✅ Panel hides on other people's stories  
✅ Extension icon toggles panel  

## Installation

1. Download `storylister-v1.15.0.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to use the extension

## Note

This version carefully applies only the proven fixes from expert analysis, avoiding the issues that affected the previous v15 attempt. All changes have been tested to ensure stability and proper functionality.