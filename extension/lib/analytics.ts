import { Viewer, ViewEvent, AnalyticsData } from './types';
import { storage } from './storage';

export class ViewerAnalytics {
  async generateAnalytics(): Promise<AnalyticsData> {
    const viewers = await storage.getViewers();
    const snapshots = await storage.getSnapshots();
    
    const totalViewers = viewers.length;
    const frequentViewers = viewers.filter(v => (v.viewCount || 0) >= 3).length;
    const uniqueViewers = new Set(viewers.map(v => v.username)).size;
    
    // Calculate return rate based on viewers with multiple views
    const returnViewers = viewers.filter(v => (v.viewCount || 0) > 1).length;
    const returnRate = totalViewers > 0 ? (returnViewers / totalViewers) * 100 : 0;

    // Generate top viewers based on consistency and activity
    const topViewers = viewers
      .map(viewer => {
        const consistency = this.calculateConsistency(viewer, snapshots);
        return {
          viewer,
          consistency,
          totalViews: viewer.viewCount || 0
        };
      })
      .sort((a, b) => b.consistency - a.consistency)
      .slice(0, 10);

    return {
      totalViewers,
      frequentViewers,
      uniqueViewers,
      returnRate,
      topViewers
    };
  }

  private calculateConsistency(viewer: Viewer, snapshots: any[]): number {
    if (snapshots.length === 0) return 0;
    
    const viewerAppearances = snapshots.filter(snapshot => 
      snapshot.viewers.some((v: Viewer) => v.username === viewer.username)
    ).length;
    
    return (viewerAppearances / snapshots.length) * 100;
  }

  calculateEngagementScore(viewer: Viewer): number {
    const recency = this.calculateRecencyScore(viewer);
    const consistency = viewer.viewCount || 0;
    const velocity = this.calculateVelocityScore(viewer);
    
    return (0.5 * recency) + (0.3 * consistency) + (0.2 * velocity);
  }

  private calculateRecencyScore(viewer: Viewer): number {
    if (!viewer.lastSeen) return 0;
    
    const hoursSinceLastSeen = (Date.now() - viewer.lastSeen) / (1000 * 60 * 60);
    
    // Score decreases with time, max score for views within 1 hour
    if (hoursSinceLastSeen <= 1) return 100;
    if (hoursSinceLastSeen <= 24) return 80;
    if (hoursSinceLastSeen <= 72) return 60;
    return 30;
  }

  private calculateVelocityScore(viewer: Viewer): number {
    // This would need more sophisticated tracking of view timing
    // For now, return a simple score based on view frequency
    const viewCount = viewer.viewCount || 0;
    return Math.min(viewCount * 10, 100);
  }

  exportAnalyticsData(analytics: AnalyticsData): string {
    const csvHeaders = [
      'Username',
      'Display Name',
      'Consistency %',
      'Total Views',
      'Engagement Score',
      'Is Follower',
      'Is Verified',
      'Last Seen'
    ];

    const csvRows = analytics.topViewers.map(({ viewer, consistency, totalViews }) => [
      viewer.username,
      viewer.displayName || '',
      consistency.toFixed(1),
      totalViews,
      this.calculateEngagementScore(viewer).toFixed(1),
      viewer.isFollower ? 'Yes' : 'No',
      viewer.isVerified ? 'Yes' : 'No',
      viewer.lastSeen ? new Date(viewer.lastSeen).toISOString() : ''
    ]);

    return [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
  }
}

export const analytics = new ViewerAnalytics();
