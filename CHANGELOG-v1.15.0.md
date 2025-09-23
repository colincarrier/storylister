# Storylister v1.15.0 - Surgical Patch Set

## Release Date: September 23, 2025

## Critical Fixes Applied

### 1. Killed Runtime Error (content.js)
- **Issue**: Reference to non-existent `handleBundledData` function causing UI update failures
- **Fix**: Removed the broken function call that was preventing data updates from displaying

### 2. Fixed Reaction Flow End-to-End
- **Injected.js**: Enhanced reaction normalization with better emoji detection and friendship status mapping
- **Content.js**: Added `reacted` boolean field for efficient filtering alongside raw `reaction` data
- **Result**: "❤️ Reacts" filter now properly shows only viewers who reacted to your story

### 3. Fixed Tag Persistence & Clickability  
- **Storage**: Dual-layer persistence using localStorage (fast) + chrome.storage (durable)
- **Per-Owner Tags**: Tags now persist per story owner, not globally
- **CSS Fix**: Made entire tag pill clickable, not just the icon (pointer-events fix)
- **Result**: Tags reliably persist across refreshes and story navigation

### 4. Fixed Story Data Isolation
- **MediaId Mapping**: Added `idToKey` map to route viewer data to correct story
- **Pathname Keys**: Using pathname as storage key for first-story stability
- **Auto-Open**: Simplified auto-open logic to work reliably on first story
- **Result**: No more data mixing between stories or "waiting..." loops

### 5. Enhanced Video Pause Control
- **Dialog-Aware**: Only pauses videos when viewer dialog is actually open
- **User Override**: Respects when user manually plays video
- **Timing**: Added 1.2s delay to avoid fighting with Instagram's player
- **Result**: Videos can be played normally when dialog is closed

### 6. Fixed Popup Integration
- **Message Handler**: Added support for both `sl:toggle` and `STORYLISTER_TOGGLE` messages
- **Event Dispatch**: Properly triggers panel show/hide events
- **Response Protocol**: Fixed Chrome's async response requirements
- **Result**: Extension icon properly toggles panel on your stories

## Technical Improvements

- Removed duplicate reaction property in viewer objects
- Fixed filter field mappings (isFollower vs youFollow semantics)  
- Added story change event listener for panel reset
- Improved pagination with bounded scrolling (6 second max)
- Enhanced profile pic validation (only accept http(s) URLs)

## Verification Checklist

✅ First story opens and populates within ~1-2 seconds  
✅ Reacts filter shows only rows with reactions  
✅ Followers/Following filters work without API calls  
✅ Tagging persists per owner across refreshes  
✅ Videos play when dialog closed, pause when open  
✅ Story navigation doesn't leak data between stories  
✅ Extension icon toggles panel on story pages  

## Installation

1. Download `storylister-v1.15.0.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select the extracted folder
6. Visit Instagram stories to use the extension

## Note

This version implements a comprehensive surgical patch set addressing all critical issues from v1.14.0. The fixes focus on stability, data integrity, and user experience improvements without changing the core architecture.