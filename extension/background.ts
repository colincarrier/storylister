// Background script for Storylister Chrome extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('Storylister extension installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSettings':
      // Handle settings requests
      chrome.storage.local.get(['storylisterSettings'], (result) => {
        sendResponse(result.storylisterSettings || {});
      });
      return true;
      
    case 'saveSettings':
      // Handle settings updates
      chrome.storage.local.set({ 
        storylisterSettings: request.settings 
      }, () => {
        sendResponse({ success: true });
      });
      return true;
      
    case 'exportData':
      // Handle data export
      chrome.storage.local.get(null, (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
          url: url,
          filename: `storylister-export-${new Date().toISOString().split('T')[0]}.json`
        });
        
        sendResponse({ success: true });
      });
      return true;
  }
});

// Monitor tab updates to inject content script when needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      tab.url && 
      tab.url.includes('instagram.com')) {
    
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => {
      // Script might already be injected
      console.log('Content script injection skipped:', err.message);
    });
  }
});
