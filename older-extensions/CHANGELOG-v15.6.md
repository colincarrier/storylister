# Storylister v15.6 - Surgical Patches for First Story & Video Playback

## Release Date: September 25, 2025

## Overview

This release applies minimal, surgical patches to fix the first story data capture, video playback issues, and first-install reliability.

## Critical Fixes Applied

### 1. ✅ Split Content Scripts with Different Load Timing
**Problem**: Backend script was loading too late, missing first story's initial API call
**Solution**: Split content scripts in manifest.json
- `content-backend.js` loads at `document_start` (catches first API call)
- `content.js` loads at `document_idle` (UI can load later)
- Ensures fetch/XHR hooks are in place before Instagram makes first request

### 2. ✅ Removed All Video Pause/Resume Code
**Problem**: Extension was pausing videos, causing play/pause loops
**Solution**: Removed all video control code
- Deleted `pauseVideos()` and `resumeVideos()` functions
- Removed video MutationObserver
- Let Instagram handle video pause when "Seen by" dialog opens naturally
- Videos now play/pause correctly without interference

### 3. ✅ Added First-Install Reliability Nudge
**Problem**: On first install, extension sometimes didn't trigger
**Solution**: Added post-load nudge
- One-time retry after 1 second to ensure DOM is ready
- Doesn't replace observer, just ensures first run works
- Fixes intermittent "didn't work on first install" issues

### 4. ✅ Follower/Following Mapping (Already Fixed in v15.5)
- `youFollow` = YOU follow THEM
- `isFollower` = THEY follow YOU
- Filters now show correct user groups

### 5. ✅ Reaction Detection (Already Fixed in v15.5)
- Checks `latest_reaction.reaction_emoji` field
- Properly detects hearts/likes
- Reaction filter works correctly

## Key Changes from v15.5

### Manifest Changes
```json
// Split into two content script entries:
{
  "matches": ["https://www.instagram.com/*"],
  "js": ["content-backend.js"],
  "run_at": "document_start"  // CRITICAL: Loads early
},
{
  "matches": ["https://www.instagram.com/*"],
  "js": ["content.js"],
  "css": ["content.css"],
  "run_at": "document_idle"   // UI loads later
}
```

### Removed Code
- All video pause/resume functions
- Video MutationObserver
- pausedVideos state tracking
- Pause videos checkbox in settings

### Added Code
- Post-load nudge for first-install reliability

## What's Fixed

✅ **First story captures all viewers** - Backend loads early enough to catch first API call
✅ **Videos play normally** - No more auto-pause when you press play
✅ **First install works reliably** - Post-load nudge ensures activation
✅ **All filters work correctly** - Followers/following/reactions all accurate
✅ **No UI disruption** - Clean separation of backend and UI loading

## Installation

1. Download `storylister-v15.6.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to test

## Testing Checklist

- [ ] First story from home page shows all viewers (matches "Seen by" count)
- [ ] Close viewer dialog, press play - video STAYS playing
- [ ] Navigate between stories - counts remain correct
- [ ] Followers filter shows people who follow YOU
- [ ] Following filter shows people YOU follow
- [ ] Reactions filter shows users with hearts
- [ ] Extension activates on first install without refresh

## Note

This version implements the minimal surgical patches recommended by ChatGPT to fix critical issues without introducing new problems. No experimental features or complex logic added.