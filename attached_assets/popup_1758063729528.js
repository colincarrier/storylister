// Popup script for Storylister Chrome Extension

// Check if we're on Instagram
function checkStatus() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            const statusDiv = document.getElementById('extension-status');
            const currentTabDiv = document.getElementById('current-tab');
            
            if (currentTab && currentTab.url && currentTab.url.includes('instagram.com')) {
                statusDiv.className = 'status active';
                statusDiv.innerHTML = '<strong>✓ Active on Instagram</strong><br>Ready to enhance your story viewing experience!';
                
                if (currentTab.url.includes('/stories/')) {
                    statusDiv.innerHTML = '<strong>🎯 Story detected!</strong><br>Click "Seen by" to start using Storylister';
                }
            } else {
                statusDiv.className = 'status inactive';
                statusDiv.innerHTML = '<strong>⚠ Not on Instagram</strong><br>Navigate to Instagram to use Storylister';
            }
            
            currentTabDiv.textContent = 'Current page: ' + (currentTab && currentTab.url ? currentTab.url : 'Unknown');
        });
    } else {
        const statusDiv = document.getElementById('extension-status');
        statusDiv.className = 'status active';
        statusDiv.innerHTML = '<strong>Extension Loaded</strong><br>Navigate to Instagram stories to begin';
    }
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    // Open Instagram in current tab
    document.getElementById('open-instagram').addEventListener('click', function() {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.update(tabs[0].id, {url: 'https://www.instagram.com'});
                window.close();
            });
        }
    });

    // Refresh current tab
    document.getElementById('refresh-tab').addEventListener('click', function() {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.reload(tabs[0].id);
                window.close();
            });
        }
    });

    // Check status when popup opens
    checkStatus();
    
    // Update status when tab changes
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onUpdated.addListener(checkStatus);
        chrome.tabs.onActivated.addListener(checkStatus);
    }
});