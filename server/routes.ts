import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve chrome-extension files for preview
  app.use('/chrome-extension', express.static(path.join(process.cwd(), 'chrome-extension')));
  
  // Extension preview route
  app.get('/extension-preview', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storylister Extension Preview</title>
  <link rel="stylesheet" href="/chrome-extension/content.css">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .mock-instagram {
      background: white;
      min-height: 100vh;
      position: relative;
    }
    .mock-story-area {
      padding: 20px;
      background: #000;
      color: white;
      height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .mock-controls {
      position: fixed;
      top: 10px;
      left: 10px;
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
    }
    button {
      padding: 8px 16px;
      margin: 5px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #f5f5f5;
    }
  </style>
</head>
<body>
  <div class="mock-controls">
    <button onclick="togglePanel()">Toggle Panel</button>
    <button onclick="updateMockData()">Update Mock Data</button>
    <button onclick="clearData()">Clear Data</button>
  </div>

  <div class="mock-instagram">
    <div class="mock-story-area">
      <h2>Instagram Story Preview Area</h2>
    </div>
    <div id="storylister-right-rail"></div>
  </div>

  <script>
    // Mock Chrome storage API
    window.chrome = {
      storage: {
        sync: {
          get: (keys, callback) => {
            const data = {
              pro: false,
              autoOpen: true,
              accountHandle: 'testuser'
            };
            callback(data);
          },
          set: (data, callback) => {
            console.log('Chrome storage set:', data);
            if (callback) callback();
          }
        }
      },
      runtime: {
        getURL: (path) => '/chrome-extension/' + path,
        sendMessage: (msg) => console.log('Message sent:', msg)
      }
    };

    // Mock localStorage data with sample viewers
    const mockViewers = [
      { username: 'alice_doe', full_name: 'Alice Doe', profile_pic_url: 'https://ui-avatars.com/api/?name=Alice+Doe', is_verified: true, followed_by_viewer: true },
      { username: 'bob_smith', full_name: 'Bob Smith', profile_pic_url: 'https://ui-avatars.com/api/?name=Bob+Smith', is_verified: false, followed_by_viewer: false },
      { username: 'charlie_wilson', full_name: 'Charlie Wilson', profile_pic_url: 'https://ui-avatars.com/api/?name=Charlie+Wilson', is_verified: false, followed_by_viewer: true },
      { username: 'diana_jones', full_name: 'Diana Jones', profile_pic_url: 'https://ui-avatars.com/api/?name=Diana+Jones', is_verified: true, followed_by_viewer: false },
      { username: 'eve_taylor', full_name: 'Eve Taylor', profile_pic_url: 'https://ui-avatars.com/api/?name=Eve+Taylor', is_verified: false, followed_by_viewer: true }
    ];

    const storyData = {
      '12345': {
        viewers: mockViewers.map((v, idx) => [v.username, { ...v, originalIndex: idx, viewedAt: Date.now() - idx * 60000 }]),
        fetchedAt: Date.now(),
        generation: 1
      }
    };

    localStorage.setItem('panel_story_store', JSON.stringify(storyData));
    localStorage.setItem('panel_story_store_hash', JSON.stringify({ sid: '12345', sizes: [['12345', 5]] }));

    // Helper functions
    function togglePanel() {
      const rail = document.getElementById('storylister-right-rail');
      rail.classList.toggle('active');
      
      // Dispatch show event if activating
      if (rail.classList.contains('active')) {
        window.dispatchEvent(new CustomEvent('storylister:show_panel'));
        window.dispatchEvent(new CustomEvent('storylister:active_media', { detail: { storyId: '12345' } }));
      } else {
        window.dispatchEvent(new CustomEvent('storylister:hide_panel'));
      }
    }

    function updateMockData() {
      // Add a new viewer
      const newViewer = {
        username: 'new_user_' + Date.now(),
        full_name: 'New User',
        profile_pic_url: 'https://ui-avatars.com/api/?name=New+User',
        is_verified: Math.random() > 0.5,
        followed_by_viewer: Math.random() > 0.5
      };
      
      mockViewers.push(newViewer);
      const updatedData = {
        '12345': {
          viewers: mockViewers.map((v, idx) => [v.username, { ...v, originalIndex: idx, viewedAt: Date.now() - idx * 60000 }]),
          fetchedAt: Date.now(),
          generation: 1
        }
      };
      
      localStorage.setItem('panel_story_store', JSON.stringify(updatedData));
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: '12345' } }));
    }

    function clearData() {
      localStorage.removeItem('panel_story_store');
      localStorage.removeItem('panel_story_store_hash');
      window.dispatchEvent(new CustomEvent('storylister:data_updated', { detail: { storyId: '12345' } }));
    }
  </script>
  
  <!-- Load the actual extension script -->
  <script src="/chrome-extension/content.js"></script>
  
  <script>
    // Auto-show panel after load
    setTimeout(() => {
      togglePanel();
    }, 500);
  </script>
</body>
</html>`);
  });
  
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const httpServer = createServer(app);

  return httpServer;
}
