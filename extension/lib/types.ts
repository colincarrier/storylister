export interface Viewer {
  username: string;
  displayName?: string;
  profilePic?: string;
  isFollower?: boolean;
  isVerified?: boolean;
  lastSeen?: number;
  firstSeen?: number;
  viewCount?: number;
}

export interface ViewEvent {
  storyId: string;
  viewedAt: number;
  ordinal?: number;
  viewer: Viewer;
  sessionId: string;
}

export interface Snapshot {
  id: string;
  storyId: string;
  capturedAt: number;
  viewers: Viewer[];
  totalCount: number;
  loadedCount: number;
}

export interface AnalyticsData {
  totalViewers: number;
  frequentViewers: number;
  uniqueViewers: number;
  returnRate: number;
  topViewers: Array<{
    viewer: Viewer;
    consistency: number;
    totalViews: number;
  }>;
}

export interface ExtensionSettings {
  autoLoad: boolean;
  showOverlay: boolean;
  defaultSort: 'recent' | 'alphabetical' | 'active';
  dataRetention: number; // days
  isPro: boolean;
}

export interface SearchFilters {
  query: string;
  type: 'all' | 'followers' | 'non-followers' | 'frequent' | 'flagged';
  sort: 'recent' | 'oldest' | 'a-z' | 'active';
}
