# Storylister v15.3 - Surgical Patches Applied

## Release Date: September 24, 2025

## Overview

This release applies ChatGPT's recommended surgical patches to fix critical issues without introducing the problems from v16. All patches are minimal and targeted.

## Applied Surgical Patches

### 1. Content-Backend.js - Core Stability Fixes

**Stable Story Tracking**
- Uses `location.pathname` as the only story key (works for ALL stories)
- Maps `mediaId → pathname` to prevent chunk misrouting
- Fixes "first story not loading viewers" issue

**No Programmatic Pausing**
- Removed forced video pausing that caused loops
- Instagram naturally pauses when dialog opens
- Tracks user manual plays to avoid re-pausing

**Injection Safety**
- Uses `chrome.runtime.getURL('injected.js')` instead of inline injection
- Avoids CSP "unsafe-inline" violations
- Guards against extension context invalidation

**Smart Pagination**
- Waits up to 5 seconds for "Seen by" button
- Auto-opens once per story (no spam clicking)
- Bounded scrolling stops at target count (±1)
- Throttled observer at 200ms prevents CPU thrashing

### 2. Injected.js - Lean Data Extraction

**Friendship Status**
- Extracts `follows_viewer` (they follow you)
- Extracts `followed_by_viewer` (you follow them)
- Uses fallback fields for compatibility

**Reactions Support**
- Captures reaction emojis from existing fields
- No new API calls - uses data already received
- Supports multiple reaction field formats

**Profile Pics**
- Validates absolute URLs only (prevents DNS storms)
- Filters out relative/invalid image paths

### 3. Content.js - UI Enhancements

**Fixed Filters**
- "❤️ Reacts" filter works with reaction field
- "Following" = you follow them (correct logic)
- "Followers" = they follow you (correct logic)
- "Non-followers" = neither follows the other

**Clickable Profiles**
- Usernames link to Instagram profiles
- Avatars link to Instagram profiles
- Opens in new tab with proper security attributes

**Tag Persistence**
- Tags stored per Instagram account owner
- Uses `sl_tags_{owner}` key format
- Persists across story navigation
- Dual storage: localStorage + chrome.storage

### 4. Content.css - Interaction Fixes

**Tag Button**
- Entire button is clickable (not just icon)
- Uses `pointer-events: none` on children
- Prevents click event stealing

**Z-Index Layering**
- Panel at z-index 2147483646
- Instagram dialogs at 2147483647
- Prevents panel from blocking IG controls

**Constrained Height**
- Panel limited to viewport height
- Results scroll within container
- No overflow beyond screen bounds

## Technical Improvements

### Data Integrity
- Map-based deduplication by lowercased username
- Debounced localStorage mirroring (250ms)
- `__aliases` system preserves data across refreshes
- Proper mediaId to pathname mapping

### Performance
- Throttled DOM observer (200ms)
- Bounded pagination (6 second max)
- No global event blocking
- No keyboard capture outside panel

## What This Release Does NOT Do

Per ChatGPT's warnings, this release avoids:
- ❌ Inline script injection (CSP violation)
- ❌ Global event capture/stopPropagation
- ❌ Forced video pausing
- ❌ Unconditional keyboard listeners
- ❌ Any new API calls

## Installation

1. Download `storylister-v15.3.zip`
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Remove any previous version
6. Click "Load unpacked" and select the extracted folder
7. Visit Instagram stories to use the extension

## Validation Checklist

✅ First story auto-loads viewers (no numeric ID required)  
✅ Viewer counts match "Seen by N" (±1 tolerance)  
✅ No data mixing between stories (pathname-based keys)  
✅ Videos pause naturally when dialog opens  
✅ ❤️ Reacts filter shows only viewers with reactions  
✅ Following/Followers filters work correctly  
✅ Tags persist per account and across navigation  
✅ Usernames and avatars link to profiles  
✅ Tag button fully clickable  
✅ No CSP violations in console  

## Note

This version implements ONLY the surgical fixes recommended by ChatGPT analysis, avoiding the overreach that caused issues in v16. Each change is minimal, targeted, and addresses a specific bug.