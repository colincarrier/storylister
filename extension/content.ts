import { StorylistManager } from './components/StorylistManager';

// Initialize Storylister when the page loads
let storylistManager: StorylistManager | null = null;

async function initStorylist() {
  if (storylistManager) return;
  
  storylistManager = new StorylistManager();
  await storylistManager.init();
}

// Check if we're on Instagram
if (window.location.hostname === 'www.instagram.com') {
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStorylist);
  } else {
    initStorylist();
  }
}

// Handle navigation changes (Instagram is a SPA)
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    // Reinitialize if we navigate to a different page
    if (currentUrl.includes('/stories/')) {
      initStorylist();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Export for testing
(window as any).storylistManager = storylistManager;
