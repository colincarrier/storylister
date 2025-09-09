// Web Worker for performance-optimized viewer indexing
import { Viewer } from './lib/types';

interface WorkerMessage {
  type: 'INDEX_VIEWER' | 'SEARCH' | 'GET_STATS';
  data?: any;
}

interface WorkerResponse {
  type: 'VIEWER_INDEXED' | 'SEARCH_RESULTS' | 'STATS_UPDATE';
  data?: any;
}

class ViewerIndexWorker {
  private viewers: Map<string, Viewer> = new Map();
  private searchIndex: Map<string, Set<string>> = new Map();

  handleMessage(message: WorkerMessage): WorkerResponse | null {
    switch (message.type) {
      case 'INDEX_VIEWER':
        return this.indexViewer(message.data);
      
      case 'SEARCH':
        return this.search(message.data);
      
      case 'GET_STATS':
        return this.getStats();
      
      default:
        return null;
    }
  }

  private indexViewer(viewer: Viewer): WorkerResponse {
    // Store the viewer
    this.viewers.set(viewer.username, viewer);

    // Build search index
    const searchTerms = [
      viewer.username.toLowerCase(),
      ...(viewer.displayName ? viewer.displayName.toLowerCase().split(' ') : [])
    ];

    searchTerms.forEach(term => {
      if (!this.searchIndex.has(term)) {
        this.searchIndex.set(term, new Set());
      }
      this.searchIndex.get(term)!.add(viewer.username);
    });

    return {
      type: 'VIEWER_INDEXED',
      data: { 
        viewer,
        totalCount: this.viewers.size 
      }
    };
  }

  private search(query: string): WorkerResponse {
    if (!query.trim()) {
      return {
        type: 'SEARCH_RESULTS',
        data: Array.from(this.viewers.values())
      };
    }

    const searchTerms = query.toLowerCase().split(' ').filter(t => t.length > 0);
    const matchingUsernames = new Set<string>();

    // Find usernames that match all search terms
    searchTerms.forEach((term, index) => {
      const termMatches = new Set<string>();

      // Exact matches
      if (this.searchIndex.has(term)) {
        this.searchIndex.get(term)!.forEach(username => termMatches.add(username));
      }

      // Partial matches
      this.searchIndex.forEach((usernames, indexedTerm) => {
        if (indexedTerm.includes(term)) {
          usernames.forEach(username => termMatches.add(username));
        }
      });

      if (index === 0) {
        termMatches.forEach(username => matchingUsernames.add(username));
      } else {
        // Intersection with previous matches
        const intersection = new Set<string>();
        matchingUsernames.forEach(username => {
          if (termMatches.has(username)) {
            intersection.add(username);
          }
        });
        matchingUsernames.clear();
        intersection.forEach(username => matchingUsernames.add(username));
      }
    });

    const results = Array.from(matchingUsernames)
      .map(username => this.viewers.get(username)!)
      .filter(Boolean);

    return {
      type: 'SEARCH_RESULTS',
      data: results
    };
  }

  private getStats(): WorkerResponse {
    const totalViewers = this.viewers.size;
    const viewerArray = Array.from(this.viewers.values());
    
    const verified = viewerArray.filter(v => v.isVerified).length;
    const followers = viewerArray.filter(v => v.isFollower).length;
    const frequent = viewerArray.filter(v => (v.viewCount || 0) > 3).length;

    return {
      type: 'STATS_UPDATE',
      data: {
        total: totalViewers,
        verified,
        followers,
        frequent
      }
    };
  }
}

// Worker instance
const worker = new ViewerIndexWorker();

// Listen for messages from main thread
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const response = worker.handleMessage(event.data);
  if (response) {
    self.postMessage(response);
  }
});

export {};
