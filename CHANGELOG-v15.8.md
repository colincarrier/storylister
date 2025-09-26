# Storylister v15.8 - Comprehensive Fix from ChatGPT

## Release Date: September 26, 2025

## Overview

This release implements ChatGPT's comprehensive surgical patch set that addresses all major issues found in v15.7, including first story loading, story switching, cache management, NEW badge clearing, filters, and avatar display.

## Critical Fixes Applied

### 1. ✅ Extended Pagination Window (15 seconds)
**Problem**: First story was only loading ~25 viewers before timing out
**Solution**: Extended pagination from 6 to 15 seconds to allow complete loading
- First story now has enough time to load all viewers
- Prevents incomplete viewer lists on initial load

### 2. ✅ Improved MediaId Detection
**Problem**: Extension couldn't always detect which story was active
**Solution**: Enhanced getMediaIdFromDOM() with multiple fallback methods
- Checks URL patterns for 15-25 digit IDs
- Checks "Seen by" link hrefs
- Checks link[rel="alternate"] tags
- Checks any anchor with story IDs
- Checks data-media-id attributes

### 3. ✅ Fixed Story Switching & Cache Management
**Problem**: Navigating between stories mixed viewer lists or showed wrong counts
**Solution**: Properly track both pathname AND mediaId changes
- Detects when same path has different story (carousel navigation)
- Clears stale cache when mediaId changes
- Resets viewer maps appropriately
- Properly handles back/forward navigation

### 4. ✅ NEW Badge Now Clears Properly
**Problem**: NEW badges stayed visible even after viewing
**Solution**: Update lastSeenAt when panel OPENS (not closes)
- markAllSeenForKey() called on panel_opened event
- NEW badges immediately clear on second view
- Each story tracks its own lastSeenAt independently

### 5. ✅ Fixed Follower/Following Filters
**Problem**: Filters were showing wrong user groups
**Solution**: Corrected mapping throughout the extension
- `isFollower` = THEY follow YOU (fs.followed_by)
- `youFollow` = YOU follow THEM (fs.following)
- Filters now show correct user groups
- Non-followers filter fixed to only check isFollower

### 6. ✅ Enhanced Reaction Detection
**Problem**: Hearts/reactions weren't being detected
**Solution**: Added DOM fallback for reaction detection
- Checks modern API fields (latest_reaction.reaction_emoji, has_liked)
- Fallback DOM scraping for heart icons in viewer dialog
- Merges reactions from both sources

### 7. ✅ Fixed Avatar Display (Rectangles → Circles)
**Problem**: Profile pictures showing as rectangles
**Solution**: Fixed SVG fallback to use circles
- Changed rect to circle element in fallback SVG
- Maintains 50% border-radius CSS
- Avatars now properly circular

### 8. ✅ Preserved firstSeenAt Timestamps
**Problem**: Lost track of when viewers first appeared
**Solution**: Mirror function now preserves firstSeenAt
- Merges existing firstSeenAt with new data
- Enables proper NEW badge calculation
- Maintains viewer history across sessions

### 9. ✅ Panel Stability
**Problem**: Panel sometimes closed unexpectedly during navigation
**Solution**: Improved story change detection logic
- Only hides panel when leaving stories or viewing others' stories
- Maintains panel state during story navigation
- Properly handles Instagram's single-page app navigation

## Installation

1. Download `storylister-v15.8.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to test

## Testing Checklist

- [ ] First story loads ALL viewers (matches "Seen by" count)
- [ ] Navigate between stories - correct viewer counts maintained
- [ ] Navigate away and back - viewers load correctly
- [ ] NEW badges appear for fresh viewers
- [ ] NEW badges clear after viewing once
- [ ] Followers filter shows people who follow YOU
- [ ] Following filter shows people YOU follow
- [ ] Non-followers filter shows people who don't follow you
- [ ] Reactions filter shows users with hearts
- [ ] Profile pictures are circular, not rectangular
- [ ] Panel stays open during story navigation
- [ ] Videos play normally without auto-pause issues

## Technical Summary

This version implements ChatGPT's comprehensive patch addressing 9 distinct issues with surgical precision. Each fix targets a specific problem without introducing new complexity. The extension now properly handles Instagram's dynamic content loading, maintains accurate viewer data across navigation, and provides reliable filtering and display of viewer information.