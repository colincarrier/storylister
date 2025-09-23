// popup.js
const SETTINGS_KEY = 'storylister_settings';
const $ = (id) => document.getElementById(id);

function loadSettings() {
  chrome.storage.sync.get([SETTINGS_KEY], (obj) => {
    const s = obj[SETTINGS_KEY] || {};
    $('sl-handle').value = s.accountHandle || '';
    $('sl-auto').checked = !!s.autoOpen;
    $('sl-pro').checked = !!s.proMode;
  });
}

function save(partial) {
  chrome.storage.sync.get([SETTINGS_KEY], (obj) => {
    const next = { ...(obj[SETTINGS_KEY] || {}), ...partial };
    chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  });
}

$('sl-handle').addEventListener('change', (e) => {
  save({ accountHandle: (e.target.value || '').replace(/^@/, '') });
});

$('sl-auto').addEventListener('change', (e) => {
  save({ autoOpen: !!e.target.checked });
});

$('sl-pro').addEventListener('change', (e) => {
  save({ proMode: !!e.target.checked });
});

$('sl-erase').addEventListener('click', () => {
  // Clear handle and (if Free) erase tags for that handle in the page context
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.postMessage({ type: 'SL_CLEAR_ACCOUNT_HANDLE' }, '*')
    });
  });
  save({ accountHandle: '' }); // also clear in sync storage
  setTimeout(loadSettings, 200);
});

// Add toggle button handler
$('sl-toggle').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    
    // Send message to content script to toggle the panel
    chrome.tabs.sendMessage(tabId, { cmd: 'sl:toggle' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Toggle failed:', chrome.runtime.lastError);
      } else {
        console.log('Panel toggled:', response);
      }
    });
  });
});

document.addEventListener('DOMContentLoaded', loadSettings);