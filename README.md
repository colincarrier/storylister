# Storylister Chrome Extension

A Chrome extension that enhances Instagram's story viewer functionality with search, filtering, analytics, and snapshot capabilities while maintaining platform compliance.

## 🎯 Overview

Storylister transforms Instagram's story viewer experience by adding powerful search, filtering, and analytics capabilities directly within the Instagram interface. The extension operates client-side only to maintain compliance with Instagram's terms of service.

## ✨ Features

### Free Features
- **🔍 Real-time Search**: Fuzzy search through story viewers by username or display name
- **🎛️ Smart Filtering**: Filter by followers, verified users, frequent viewers
- **📊 Sort Options**: Sort by recent activity, alphabetical, or engagement
- **📈 Load Progress**: Visual indicator of how many viewers have been loaded
- **👤 User-driven Interface**: No automated scrolling or background data collection

### Pro Features
- **📸 Snapshot Capture**: Save viewer lists at any point during the 48-hour window
- **📊 Analytics Dashboard**: Viewer consistency, engagement patterns, and trends
- **📜 Viewer History**: Track viewer patterns over time
- **📥 CSV Export**: Export analytics data for external analysis
- **📝 Custom Notes**: Add notes and tags to viewers

## 🚀 Installation

### For Users

1. **Download from Chrome Web Store** (Coming Soon)
   - Visit the Chrome Web Store
   - Search for "Storylister"
   - Click "Add to Chrome"

2. **Manual Installation** (Developer Mode)
   - Download the latest release from GitHub
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension folder

### For Developers

1. **Clone the Repository**
   ```bash
   git clone https://github.com/storylister/chrome-extension.git
   cd chrome-extension/extension
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Extension**
   ```bash
   npm run build
   