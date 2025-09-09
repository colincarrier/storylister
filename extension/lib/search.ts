import { Viewer, SearchFilters } from './types';

export class ViewerSearch {
  private viewers: Viewer[] = [];
  private filteredViewers: Viewer[] = [];

  updateViewers(viewers: Viewer[]): void {
    this.viewers = viewers;
    this.filteredViewers = viewers;
  }

  search(filters: SearchFilters): Viewer[] {
    let results = [...this.viewers];

    // Text search
    if (filters.query.trim()) {
      const query = filters.query.toLowerCase();
      results = results.filter(viewer => 
        viewer.username.toLowerCase().includes(query) ||
        viewer.displayName?.toLowerCase().includes(query)
      );
    }

    // Type filter
    switch (filters.type) {
      case 'followers':
        results = results.filter(viewer => viewer.isFollower === true);
        break;
      case 'non-followers':
        results = results.filter(viewer => viewer.isFollower === false);
        break;
      case 'frequent':
        results = results.filter(viewer => (viewer.viewCount || 0) > 5);
        break;
      case 'flagged':
        // Implementation would depend on flagging system
        break;
    }

    // Sort
    switch (filters.sort) {
      case 'recent':
        results.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        break;
      case 'oldest':
        results.sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
        break;
      case 'a-z':
        results.sort((a, b) => a.username.localeCompare(b.username));
        break;
      case 'active':
        results.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        break;
    }

    this.filteredViewers = results;
    return results;
  }

  getFilteredViewers(): Viewer[] {
    return this.filteredViewers;
  }

  fuzzySearch(query: string): Viewer[] {
    if (!query.trim()) return this.viewers;
    
    const searchTerms = query.toLowerCase().split(' ');
    
    return this.viewers.filter(viewer => {
      const searchText = `${viewer.username} ${viewer.displayName || ''}`.toLowerCase();
      return searchTerms.every(term => searchText.includes(term));
    });
  }
}
