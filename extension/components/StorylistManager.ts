import { ViewerSearch } from '../lib/search';
import { analytics } from '../lib/analytics';
import { storage } from '../lib/storage';
import { Viewer, SearchFilters, Snapshot } from '../lib/types';

export class StorylistManager {
  private container: HTMLElement | null = null;
  private viewers: Viewer[] = [];
  private search = new ViewerSearch();
  private sessionId = Date.now().toString();
  private currentStoryId = '';
  private isVisible = false;

  async init(): Promise<void> {
    await storage.init();
    this.detectStoryViewer();
    this.setupMutationObserver();
  }

  private detectStoryViewer(): void {
    // Look for Instagram's story viewer dialog
    const checkForDialog = () => {
      const dialog = document.querySelector('[role="dialog"]');
      const seenByText = document.querySelector('*:contains("Seen by")');
      
      if (dialog && seenByText && !this.isVisible) {
        this.currentStoryId = this.extractStoryId();
        this.injectStorylistOverlay(dialog as HTMLElement);
      } else if (!dialog && this.isVisible) {
        this.hideStorylistOverlay();
      }
    };

    // Check immediately and set up interval
    checkForDialog();
    setInterval(checkForDialog, 1000);
  }

  private extractStoryId(): string {
    const url = window.location.href;
    const match = url.match(/stories\/([^\/]+)\/([^\/\?]+)/);
    return match ? `${match[1]}_${match[2]}` : Date.now().toString();
  }

  private injectStorylistOverlay(dialog: HTMLElement): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.className = 'storylister-overlay';
    this.container.innerHTML = this.generateOverlayHTML();
    
    // Position overlay to the right of the dialog
    this.container.style.cssText = `
      position: fixed;
      top: ${dialog.offsetTop}px;
      left: ${dialog.offsetLeft + dialog.offsetWidth + 16}px;
      z-index: 9999;
      width: 320px;
      max-height: 500px;
      font-family: var(--font-sans);
    `;

    document.body.appendChild(this.container);
    this.isVisible = true;
    this.setupEventListeners();
    this.indexExistingViewers();
  }

  private generateOverlayHTML(): string {
    return `
      <div class="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
        <!-- Header -->
        <div class="p-3 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-5 h-5 rounded bg-purple-600 flex items-center justify-center">
              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2"/>
              </svg>
            </div>
            <span class="text-sm font-medium">Storylister</span>
          </div>
          <div class="flex items-center space-x-1">
            <div class="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Pro</div>
            <button class="p-1 hover:bg-gray-200 rounded text-gray-500" id="storylister-close">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Search and Controls -->
        <div class="p-3 space-y-3">
          <!-- Search Bar -->
          <div class="relative">
            <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input 
              type="text" 
              placeholder="Search viewers..." 
              id="storylister-search"
              class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
          </div>

          <!-- Filters Row -->
          <div class="flex items-center justify-between text-xs">
            <select id="storylister-filter" class="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="all">All viewers</option>
              <option value="followers">Followers only</option>
              <option value="non-followers">Non-followers</option>
              <option value="frequent">Frequent viewers</option>
            </select>
            <select id="storylister-sort" class="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-purple-500">
              <option value="recent">Recent first</option>
              <option value="oldest">Oldest first</option>
              <option value="a-z">A-Z</option>
              <option value="active">Most active</option>
            </select>
          </div>

          <!-- Stats Bar -->
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span id="storylister-stats">Loaded 0 / 0 viewers</span>
            <div class="flex items-center space-x-2">
              <div class="w-12 bg-gray-200 rounded-full h-1">
                <div id="storylister-progress" class="w-0 bg-purple-600 h-1 rounded-full transition-all"></div>
              </div>
              <span id="storylister-percentage">0%</span>
            </div>
          </div>

          <!-- Pro Actions -->
          <div class="flex space-x-2">
            <button id="storylister-capture" class="flex-1 px-3 py-2 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors">
              📸 Capture Snapshot
            </button>
            <button id="storylister-analytics" class="px-3 py-2 border border-gray-300 rounded-md text-xs hover:bg-gray-50 transition-colors">
              📊 Analytics
            </button>
          </div>
        </div>

        <!-- Results -->
        <div id="storylister-results" class="max-h-64 overflow-y-auto border-t border-gray-200">
          <div class="p-4 text-center text-gray-500 text-sm">
            No viewers loaded yet. Scroll in the Instagram dialog to index viewers.
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('#storylister-close') as HTMLButtonElement;
    closeBtn?.addEventListener('click', () => this.hideStorylistOverlay());

    // Search input
    const searchInput = this.container.querySelector('#storylister-search') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => this.handleSearch((e.target as HTMLInputElement).value));

    // Filter select
    const filterSelect = this.container.querySelector('#storylister-filter') as HTMLSelectElement;
    filterSelect?.addEventListener('change', () => this.updateResults());

    // Sort select
    const sortSelect = this.container.querySelector('#storylister-sort') as HTMLSelectElement;
    sortSelect?.addEventListener('change', () => this.updateResults());

    // Capture button
    const captureBtn = this.container.querySelector('#storylister-capture') as HTMLButtonElement;
    captureBtn?.addEventListener('click', () => this.captureSnapshot());

    // Analytics button
    const analyticsBtn = this.container.querySelector('#storylister-analytics') as HTMLButtonElement;
    analyticsBtn?.addEventListener('click', () => this.showAnalytics());
  }

  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const profileLinks = element.querySelectorAll('a[href*="/"]');
            
            profileLinks.forEach((link) => {
              const href = (link as HTMLAnchorElement).href;
              const match = href.match(/instagram\.com\/([^\/\?]+)\/?$/);
              
              if (match && match[1] && !match[1].includes('/')) {
                this.indexViewer(link as HTMLAnchorElement);
              }
            });
          }
        });
      });
    });

    // Observe the dialog content for new viewer entries
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      observer.observe(dialog, { childList: true, subtree: true });
    }
  }

  private indexExistingViewers(): void {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;

    const profileLinks = dialog.querySelectorAll('a[href*="/"]');
    profileLinks.forEach((link) => {
      const href = (link as HTMLAnchorElement).href;
      const match = href.match(/instagram\.com\/([^\/\?]+)\/?$/);
      
      if (match && match[1] && !match[1].includes('/')) {
        this.indexViewer(link as HTMLAnchorElement);
      }
    });
  }

  private indexViewer(link: HTMLAnchorElement): void {
    const href = link.href;
    const usernameMatch = href.match(/instagram\.com\/([^\/\?]+)\/?$/);
    
    if (!usernameMatch) return;
    
    const username = usernameMatch[1];
    
    // Skip if already indexed
    if (this.viewers.find(v => v.username === username)) return;

    // Extract viewer data from DOM
    const container = link.closest('div');
    if (!container) return;

    const displayNameElement = container.querySelector('div:nth-child(2) > div:first-child');
    const avatarElement = container.querySelector('img');
    const timeElement = container.querySelector('div:last-child');

    const viewer: Viewer = {
      username,
      displayName: displayNameElement?.textContent || undefined,
      profilePic: (avatarElement as HTMLImageElement)?.src || undefined,
      isFollower: this.detectFollowerStatus(container),
      isVerified: this.detectVerificationStatus(container),
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      viewCount: 1
    };

    this.viewers.push(viewer);
    this.search.updateViewers(this.viewers);
    
    // Save to storage
    storage.saveViewer(viewer);
    
    this.updateStats();
    this.updateResults();
  }

  private detectFollowerStatus(container: Element): boolean {
    // This would need to be implemented based on Instagram's UI indicators
    // Look for follower badges or other indicators
    return false; // Default to false
  }

  private detectVerificationStatus(container: Element): boolean {
    // Look for verification badge
    const verificationIcon = container.querySelector('[aria-label*="Verified"]');
    return !!verificationIcon;
  }

  private handleSearch(query: string): void {
    this.updateResults();
  }

  private updateResults(): void {
    if (!this.container) return;

    const searchInput = this.container.querySelector('#storylister-search') as HTMLInputElement;
    const filterSelect = this.container.querySelector('#storylister-filter') as HTMLSelectElement;
    const sortSelect = this.container.querySelector('#storylister-sort') as HTMLSelectElement;
    const resultsContainer = this.container.querySelector('#storylister-results');

    if (!resultsContainer) return;

    const filters: SearchFilters = {
      query: searchInput?.value || '',
      type: (filterSelect?.value as any) || 'all',
      sort: (sortSelect?.value as any) || 'recent'
    };

    const results = this.search.search(filters);
    
    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="p-4 text-center text-gray-500 text-sm">
          ${this.viewers.length === 0 ? 'No viewers loaded yet.' : 'No viewers match your search.'}
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = results.map(viewer => `
      <div class="p-3 border-b border-gray-100 hover:bg-gray-50 flex items-center space-x-3 cursor-pointer">
        <div class="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
          ${viewer.profilePic ? `<img src="${viewer.profilePic}" alt="${viewer.username}" class="w-full h-full object-cover">` : ''}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-900 truncate">
            ${viewer.username}
            ${viewer.isVerified ? '<span class="text-blue-500 ml-1">✓</span>' : ''}
          </div>
          ${viewer.displayName ? `<div class="text-xs text-gray-500 truncate">${viewer.displayName}</div>` : ''}
        </div>
        <div class="text-xs text-gray-400">
          ${viewer.lastSeen ? this.formatTimeAgo(viewer.lastSeen) : 'now'}
        </div>
      </div>
    `).join('');
  }

  private updateStats(): void {
    if (!this.container) return;

    const statsElement = this.container.querySelector('#storylister-stats');
    const progressElement = this.container.querySelector('#storylister-progress') as HTMLElement;
    const percentageElement = this.container.querySelector('#storylister-percentage');

    if (statsElement) {
      // Try to get total count from Instagram's dialog
      const seenByElement = document.querySelector('*:contains("Seen by")');
      const totalMatch = seenByElement?.textContent?.match(/Seen by ([\d,]+)/);
      const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : this.viewers.length;
      
      statsElement.textContent = `Loaded ${this.viewers.length} / ${totalCount} viewers`;
      
      const percentage = totalCount > 0 ? (this.viewers.length / totalCount) * 100 : 0;
      
      if (progressElement) {
        progressElement.style.width = `${Math.min(percentage, 100)}%`;
      }
      
      if (percentageElement) {
        percentageElement.textContent = `${Math.round(percentage)}%`;
      }
    }
  }

  private async captureSnapshot(): Promise<void> {
    const snapshot: Snapshot = {
      id: Date.now().toString(),
      storyId: this.currentStoryId,
      capturedAt: Date.now(),
      viewers: [...this.viewers],
      totalCount: this.viewers.length,
      loadedCount: this.viewers.length
    };

    await storage.saveSnapshot(snapshot);
    
    // Show success message
    this.showMessage('Snapshot captured successfully!', 'success');
  }

  private async showAnalytics(): Promise<void> {
    const analyticsData = await analytics.generateAnalytics();
    
    // Create analytics modal (simplified version)
    const modal = document.createElement('div');
    modal.className = 'storylister-analytics-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      items-center: center;
      justify-content: center;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold">Analytics Dashboard</h3>
            <button class="p-2 hover:bg-gray-100 rounded-full" onclick="this.closest('.storylister-analytics-modal').remove()">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-2xl font-bold">${analyticsData.totalViewers}</div>
              <div class="text-sm text-gray-600">Total Viewers</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-2xl font-bold">${analyticsData.frequentViewers}</div>
              <div class="text-sm text-gray-600">Frequent Viewers</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-2xl font-bold">${analyticsData.uniqueViewers}</div>
              <div class="text-sm text-gray-600">Unique Viewers</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-2xl font-bold">${analyticsData.returnRate.toFixed(1)}%</div>
              <div class="text-sm text-gray-600">Return Rate</div>
            </div>
          </div>
          
          <div class="space-y-4">
            <h4 class="font-medium">Top Viewers</h4>
            ${analyticsData.topViewers.map(({ viewer, consistency, totalViews }) => `
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full bg-gray-300"></div>
                  <div>
                    <div class="font-medium text-sm">${viewer.username}</div>
                    <div class="text-xs text-gray-500">Viewed ${totalViews} times</div>
                  </div>
                </div>
                <div class="text-sm font-medium text-purple-600">${consistency.toFixed(1)}%</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  private showMessage(message: string, type: 'success' | 'error'): void {
    const toast = document.createElement('div');
    toast.className = `storylister-toast ${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10001;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
    `;
    toast.textContent = message;

    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  private formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  private hideStorylistOverlay(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.isVisible = false;
    }
  }
}
