# Storylister Chrome Extension - Installation Guide

## Quick Installation (Developer Mode)

1. **Open Chrome Extensions Page**
   - Open Chrome and navigate to `chrome://extensions/`
   - OR click the three dots menu → More tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to your project folder
   - Select the `extension/dist-simple` folder
   - Click "Open"

4. **Verify Installation**
   - You should see "Storylister" appear in your extensions list
   - The extension icon should appear in your Chrome toolbar
   - Click the icon to open the settings popup

## How to Test

1. **Go to Instagram**
   - Navigate to https://www.instagram.com
   - Log into your account

2. **View a Story with Viewers**
   - Click on any story (yours or someone else's)
   - Click "Seen by X" at the bottom to open the viewer list

3. **Watch Storylister Activate**
   - A purple Storylister panel should appear on the right side
   - The panel will automatically start indexing viewers as they load
   - Try the search, filters, and sort options

## Features to Test

- **Search**: Type usernames or display names in the search box
- **Filters**: Use the dropdown to filter by viewer type
- **Sorting**: Sort viewers alphabetically or by recent activity  
- **Capture**: Save a snapshot of current viewers
- **Export**: Download all data as JSON

## Troubleshooting

- **Panel doesn't appear**: Refresh the Instagram page and try again
- **No viewers indexed**: Make sure the Instagram viewer dialog is open
- **Extension not working**: Check the Chrome DevTools console for errors

## How It Works

The extension:
1. Detects when you're viewing Instagram stories
2. Monitors for the "Seen by" viewer dialog
3. Automatically indexes viewer information as it loads
4. Provides search and filtering on top of Instagram's interface
5. Stores all data locally (nothing is sent to external servers)

## Privacy

- All data stays on your device
- No external API calls or data collection
- Uses only Instagram's publicly visible viewer information
- Respects Instagram's rate limits and UI patterns