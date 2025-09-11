import { useEffect, useRef } from 'react';
import '@/styles/extension-preview.css';

export default function ExtensionPreview() {
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  
  useEffect(() => {
    // Set up the preview environment before loading script
    (window as any).STORYLISTER_PREVIEW_MODE = true;
    
    // Mock chrome.runtime.getURL for assets
    if (!(window as any).chrome) {
      (window as any).chrome = {
        runtime: {
          getURL: (path: string) => {
            return `/extension/dist/${path}`;
          }
        }
      };
    }
    
    // Remove any existing script first
    const existingScript = document.querySelector('script[data-storylister-extension]');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Delete the old extension object to force reload
    delete (window as any).storylistExtension;
    
    // Load script with cache-busting parameter
    const script = document.createElement('script');
    script.src = `/extension/dist/content.js?v=${Date.now()}`;
    script.setAttribute('data-storylister-extension', 'true');
    script.onload = () => {
      console.log('Extension script loaded in preview mode (refreshed)');
      // Initialize the extension
      const extension = (window as any).storylistExtension;
      if (extension) {
        extension.init();
      }
    };
    script.onerror = (error) => {
      console.error('Failed to load extension script:', error);
    };
    document.body.appendChild(script);
    scriptRef.current = script;
    
    // Cleanup on unmount
    return () => {
      const rightRail = document.getElementById('storylister-right-rail');
      if (rightRail) {
        rightRail.remove();
      }
      // Don't delete window properties as they may be used by other components
    };
  }, []);

  return (
    <div className="extension-preview-container">
      <div className="instagram-mockup">
        <div className="instagram-header">
          <div className="ig-logo">Instagram</div>
          <div className="ig-nav">Stories Preview</div>
        </div>
        <div className="instagram-story">
          <img src="https://picsum.photos/400/700" alt="Story" />
          <div className="story-overlay">
            <div className="story-header">
              <div className="story-user">
                <img src="https://i.pravatar.cc/40?u=youruser" alt="Your Profile" />
                <span>yourusername</span>
                <span className="story-time">2h</span>
              </div>
            </div>
            <div className="story-bottom">
              <div className="story-viewers">
                <span>👁 Seen by 100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* The extension will inject its right rail here */}
      <div id="extension-mount-point"></div>
    </div>
  );
}