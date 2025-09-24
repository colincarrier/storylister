# Storylister v1.16.0 - Comprehensive Fixes Implementation

## Release Date: September 24, 2025

## Overview

This release implements all exact fixes from the comprehensive analysis document, addressing critical issues with story key mapping, video pause logic, pagination tolerance, and data routing.

## Major Fixes Applied

### 1. Story ID Resolver System
- **New StoryIdResolver** that checks multiple sources for story ID (URL → alternate links → LD+JSON)
- **Composite key format**: `${pathname}#${id||'first'}` ensures unique keys even for first story
- Remembers last known ID to handle rapid navigation

### 2. Video Pause Improvements
- Only pauses when viewer dialog is actually open (`role="dialog"`)
- 1.2 second human-like delay before pausing
- Never re-pauses after user manually plays video
- Tracks user play events via `dataset.userPlayed`

### 3. Pagination with Tolerance
- Implements ±1 tolerance for Instagram's "Seen by N" count
- Stops scrolling when loaded count >= (SeenBy - 1)
- 6-second max duration safety limit
- Smooth scrolling with adaptive timing

### 4. MediaId→StoryKey Mapping
- Routes viewer chunks correctly using mediaId map
- Prevents story A data appearing in story B
- Remembers mediaId in resolver for future lookups
- First-time mediaId binding to active key

### 5. Dual-Key Storage System
- Stores data under composite keys
- Creates `__aliases` object for mediaId lookups
- Cache reads check both composite keys and aliases
- Enables data recovery from multiple access patterns

### 6. Network Interception
- JSON content-type guard prevents parsing non-JSON
- Comprehensive reaction extraction from all API variants
- Robust mediaId resolution (payload → path → timestamp)
- Complete field normalization for all viewer shapes

### 7. Frontend Improvements
- Cache reading with alias support
- Tag persistence per Instagram account
- Strict equality checks for filters
- No inline event handlers (fixes CSP violations)

## Technical Implementation

### Key Components Updated
- `content-backend.js`: Complete observer rewrite with new key system
- `injected.js`: JSON-only parsing with comprehensive field extraction  
- `content.js`: Cache reading with aliases, proper filter logic
- `content.css`: Tag button fully clickable (already correct)

### What Was NOT Changed
- No portals or panel movement into IG dialog
- No global event blocking or propagation stopping
- No inline script tags or handlers
- No fetch rewriting for non-JSON responses
- No pathname-only keys

## Testing Checklist

✅ First story auto-opens correctly  
✅ Viewer counts match IG's "Seen by N" (±1)  
✅ No data mixing between stories  
✅ Videos pause only when dialog open  
✅ User play override respected  
✅ React filter shows correct viewers  
✅ Follower/following filters accurate  
✅ Tags persist across navigation  
✅ Panel shows only on own stories  
✅ Extension icon toggles panel  
✅ No CSP violations  
✅ No infinite loops or CPU thrashing  

## Installation

1. Download `storylister-v1.16.0.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to use the extension

## Note

This version implements the exact code fixes provided in the comprehensive analysis, addressing all identified issues while avoiding the regressions from previous attempts.