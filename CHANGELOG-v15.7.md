# Storylister v15.7 - NEW Badge for Fresh Viewers

## Release Date: September 25, 2025

## New Feature

### ✨ NEW Badge - Track Viewers Who Appeared Since Last Check

This version adds a simple but powerful feature: a **NEW** badge that shows next to viewers who appeared after you last checked that story.

## How It Works

1. **Automatic Tracking**: When you close the viewer panel, the extension remembers the timestamp
2. **New Viewer Detection**: When you reopen the panel, any viewers who appeared after that timestamp show a green "NEW" badge
3. **Per-Story Tracking**: Each story tracks its own "last seen" time independently

## What You'll See

- Green **NEW** pill badge next to usernames of viewers who are new since your last check
- The badge appears inline after the username, before any verification checkmark
- Clean, subtle design that doesn't clutter the interface

## Technical Details

- Uses existing `firstSeenAt` timestamps already tracked in storage
- Adds new `lastSeenAt` field to track when you last viewed each story's panel
- Compares timestamps to determine new viewers: `firstSeenAt > lastSeenAt`
- No performance impact - just a simple timestamp comparison

## Installation

1. Download `storylister-v15.7.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to test

## Testing the Feature

1. Open a story and check the viewers
2. Close the panel
3. Wait for new viewers to appear
4. Reopen the panel - new viewers will have the **NEW** badge

## Note

First time viewing any story won't show NEW badges (nothing to compare against yet). The feature activates after your first view of each story.