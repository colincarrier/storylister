# Storylister v1.14.0 - Critical Bug Fixes

## Release Date: September 23, 2025

## Fixed Issues

### 1. Filter Field Mappings
- **Issue**: Follower/following filters were using incorrect field names from Instagram API
- **Fix**: Corrected field mappings to properly identify followers and accounts you follow
  - `follows_viewer` → "they follow you" (your follower)
  - `followed_by_viewer` → "you follow them"
  - Added fallback field names for compatibility

### 2. Story Change Detection
- **Issue**: Data from previous stories was mixing with current story
- **Fix**: Added story change event listener to reset panel and reload correct data
  - Clears viewer list on story change
  - Loads cached data for the new story
  - Prevents data mixing between stories

### 3. Duplicate React Button
- **Issue**: Two React filter buttons appearing in UI
- **Fix**: Removed duplicate React button from the top row
  - Single React button now properly displays with correct filter icon

### 4. Video Pause Override
- **Issue**: Extension repeatedly pausing Instagram videos
- **Fix**: Added user override tracking
  - Tracks when user manually resumes playback
  - Respects user's pause/play decisions
  - Prevents fighting with user over video control

### 5. Popup Panel Integration  
- **Issue**: Extension icon click not toggling the panel
- **Fix**: Added proper Chrome runtime message handling
  - New "Toggle Panel" button in popup
  - Clicking extension icon opens popup with toggle control
  - Panel properly shows/hides based on user interaction

## Technical Improvements

- Enhanced story ID tracking with pathname mapping
- Improved data routing to prevent cross-story contamination
- Added Chrome runtime message listener for popup communication
- Better error handling and logging for debugging

## Installation

1. Download `storylister-v1.14.0.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select the extracted folder
6. Visit Instagram stories to use the extension

## Note

This version fixes critical issues that were causing browser hangs and functional problems. All users should update to this version immediately.