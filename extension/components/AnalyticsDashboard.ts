import { AnalyticsData, Viewer } from '../lib/types';
import { analytics } from '../lib/analytics';
import { storage } from '../lib/storage';

export class AnalyticsDashboard {
  private container: HTMLElement | null = null;
  private isVisible = false;

  async show(): Promise<void> {
    if (this.isVisible) return;

    const analyticsData = await analytics.generateAnalytics();
    this.createModal(analyticsData);
    this.isVisible = true;
  }

  hide(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.isVisible = false;
    }
  }

  private createModal(data: AnalyticsData): void {
    this.container = document.createElement('div');
    this.container.className = 'storylister-analytics-modal';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    `;

    this.container.innerHTML = this.generateModalHTML(data);
    document.body.appendChild(this.container);
    this.setupEventListeners();
  }

  private generateModalHTML(data: AnalyticsData): string {
    return `
      <div class="analytics-content" style="
        background: white;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        max-width: 800px;
        width: 100%;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <!-- Header -->
        <div style="
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <div>
            <h2 style="
              margin: 0;
              font-size: 24px;
              font-weight: 600;
              color: #111827;
            ">Analytics Dashboard</h2>
            <p style="
              margin: 4px 0 0 0;
              color: #6b7280;
              font-size: 14px;
            ">Viewer engagement insights and trends</p>
          </div>
          <button class="close-analytics" style="
            padding: 8px;
            border: none;
            background: #f3f4f6;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            transition: background-color 0.2s;
          " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div style="
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        ">
          <!-- Stats Grid -->
          <div style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
          ">
            ${this.generateStatsCards(data)}
          </div>

          <!-- Charts Section -->
          <div style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 32px;
          ">
            <!-- Top Viewers -->
            <div style="
              background: #f9fafb;
              border-radius: 8px;
              padding: 20px;
            ">
              <h3 style="
                margin: 0 0 16px 0;
                font-size: 18px;
                font-weight: 600;
                color: #111827;
              ">Most Active Viewers</h3>
              <div style="max-height: 300px; overflow-y: auto;">
                ${this.generateTopViewers(data.topViewers)}
              </div>
            </div>

            <!-- Engagement Trends -->
            <div style="
              background: #f9fafb;
              border-radius: 8px;
              padding: 20px;
            ">
              <h3 style="
                margin: 0 0 16px 0;
                font-size: 18px;
                font-weight: 600;
                color: #111827;
              ">Engagement Summary</h3>
              ${this.generateEngagementSummary(data)}
            </div>
          </div>

          <!-- Actions -->
          <div style="
            display: flex;
            gap: 12px;
            justify-content: center;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
          ">
            <button class="export-csv" style="
              padding: 8px 16px;
              background: #8b5cf6;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: background-color 0.2s;
            " onmouseover="this.style.background='#7c3aed'" onmouseout="this.style.background='#8b5cf6'">
              📊 Export CSV
            </button>
            <button class="refresh-analytics" style="
              padding: 8px 16px;
              background: #f3f4f6;
              color: #374151;
              border: 1px solid #d1d5db;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: background-color 0.2s;
            " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private generateStatsCards(data: AnalyticsData): string {
    const stats = [
      {
        label: 'Total Viewers',
        value: data.totalViewers.toLocaleString(),
        change: '+12%',
        changeType: 'positive'
      },
      {
        label: 'Frequent Viewers',
        value: data.frequentViewers.toLocaleString(),
        change: '+8%',
        changeType: 'positive'
      },
      {
        label: 'Unique Viewers',
        value: data.uniqueViewers.toLocaleString(),
        change: '-3%',
        changeType: 'negative'
      },
      {
        label: 'Return Rate',
        value: `${data.returnRate.toFixed(1)}%`,
        change: '+5%',
        changeType: 'positive'
      }
    ];

    return stats.map(stat => `
      <div style="
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
      ">
        <div style="
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 4px;
        ">${stat.value}</div>
        <div style="
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 8px;
        ">${stat.label}</div>
        <div style="
          font-size: 12px;
          color: ${stat.changeType === 'positive' ? '#059669' : '#dc2626'};
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span>${stat.changeType === 'positive' ? '↗️' : '↘️'}</span>
          ${stat.change} from last week
        </div>
      </div>
    `).join('');
  }

  private generateTopViewers(topViewers: AnalyticsData['topViewers']): string {
    if (topViewers.length === 0) {
      return `
        <div style="
          text-align: center;
          color: #6b7280;
          font-size: 14px;
          padding: 20px;
        ">
          No viewer data available yet.<br>
          Capture some snapshots to see analytics!
        </div>
      `;
    }

    return topViewers.slice(0, 10).map((item, index) => `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        ${index < topViewers.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''}
      ">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(45deg, #8b5cf6, #3b82f6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 12px;
            flex-shrink: 0;
          ">${item.viewer.username.charAt(0).toUpperCase()}</div>
          <div style="min-width: 0; flex: 1;">
            <div style="
              font-weight: 500;
              font-size: 14px;
              color: #111827;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">${item.viewer.username}${item.viewer.isVerified ? ' ✓' : ''}</div>
            <div style="
              font-size: 12px;
              color: #6b7280;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">${item.totalViews} views • ${item.consistency.toFixed(1)}% consistency</div>
          </div>
        </div>
        <div style="
          font-size: 14px;
          font-weight: 600;
          color: #8b5cf6;
          margin-left: 8px;
        ">#${index + 1}</div>
      </div>
    `).join('');
  }

  private generateEngagementSummary(data: AnalyticsData): string {
    const metrics = [
      {
        label: 'Average Engagement',
        value: data.topViewers.length > 0 
          ? `${(data.topViewers.reduce((sum, v) => sum + v.consistency, 0) / data.topViewers.length).toFixed(1)}%`
          : '0%'
      },
      {
        label: 'Top Performer',
        value: data.topViewers.length > 0 
          ? `${data.topViewers[0].viewer.username} (${data.topViewers[0].consistency.toFixed(1)}%)`
          : 'No data'
      },
      {
        label: 'Verified Viewers',
        value: `${data.topViewers.filter(v => v.viewer.isVerified).length} / ${data.topViewers.length}`
      },
      {
        label: 'Follower Ratio',
        value: data.topViewers.length > 0 
          ? `${((data.topViewers.filter(v => v.viewer.isFollower).length / data.topViewers.length) * 100).toFixed(1)}%`
          : '0%'
      }
    ];

    return metrics.map(metric => `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #e5e7eb;
      ">
        <span style="
          font-size: 14px;
          color: #6b7280;
        ">${metric.label}</span>
        <span style="
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        ">${metric.value}</span>
      </div>
    `).join('');
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('.close-analytics');
    closeBtn?.addEventListener('click', () => this.hide());

    // Export CSV button
    const exportBtn = this.container.querySelector('.export-csv');
    exportBtn?.addEventListener('click', () => this.exportCSV());

    // Refresh button
    const refreshBtn = this.container.querySelector('.refresh-analytics');
    refreshBtn?.addEventListener('click', () => this.refresh());

    // Click outside to close
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.hide();
      }
    });

    // Escape key to close
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  private async exportCSV(): Promise<void> {
    try {
      const analyticsData = await analytics.generateAnalytics();
      const csvData = analytics.exportAnalyticsData(analyticsData);
      
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `storylister-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showToast('Analytics data exported successfully!', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showToast('Failed to export analytics data', 'error');
    }
  }

  private async refresh(): Promise<void> {
    try {
      const analyticsData = await analytics.generateAnalytics();
      
      // Update the modal content
      const content = this.container?.querySelector('.analytics-content');
      if (content) {
        content.innerHTML = this.generateModalHTML(analyticsData).match(/<div class="analytics-content"[^>]*>([\s\S]*)<\/div>$/)?.[1] || '';
        this.setupEventListeners();
      }
      
      this.showToast('Analytics refreshed successfully!', 'success');
    } catch (error) {
      console.error('Refresh failed:', error);
      this.showToast('Failed to refresh analytics', 'error');
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10002;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
      animation: slideIn 0.3s ease-out;
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

export const analyticsDashboard = new AnalyticsDashboard();
