import { storage } from './lib/storage';
import { ExtensionSettings } from './lib/types';

class PopupManager {
  private settings: ExtensionSettings | null = null;

  async init(): Promise<void> {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  private async loadSettings(): Promise<void> {
    try {
      await storage.init();
      this.settings = await storage.getSettings();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = {
        autoLoad: true,
        showOverlay: true,
        defaultSort: 'recent',
        dataRetention: 30,
        isPro: false
      };
    }
  }

  private setupEventListeners(): void {
    // Auto-load toggle
    const autoLoadToggle = document.getElementById('autoLoad') as HTMLInputElement;
    autoLoadToggle?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.autoLoad = autoLoadToggle.checked;
        this.saveSettings();
      }
    });

    // Show overlay toggle
    const showOverlayToggle = document.getElementById('showOverlay') as HTMLInputElement;
    showOverlayToggle?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.showOverlay = showOverlayToggle.checked;
        this.saveSettings();
      }
    });

    // Default sort select
    const defaultSortSelect = document.getElementById('defaultSort') as HTMLSelectElement;
    defaultSortSelect?.addEventListener('change', () => {
      if (this.settings) {
        this.settings.defaultSort = defaultSortSelect.value as any;
        this.saveSettings();
      }
    });

    // Upgrade button
    const upgradeBtn = document.getElementById('upgradeBtn');
    upgradeBtn?.addEventListener('click', () => {
      this.handleUpgrade();
    });

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    exportBtn?.addEventListener('click', () => {
      this.exportData();
    });

    // Clear data button
    const clearBtn = document.getElementById('clearBtn');
    clearBtn?.addEventListener('click', () => {
      this.clearData();
    });

    // Footer links
    document.getElementById('helpLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://storylister.help' });
    });

    document.getElementById('privacyLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://storylister.app/privacy' });
    });

    document.getElementById('feedbackLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'mailto:feedback@storylister.app' });
    });
  }

  private updateUI(): void {
    if (!this.settings) return;

    // Update toggles
    const autoLoadToggle = document.getElementById('autoLoad') as HTMLInputElement;
    if (autoLoadToggle) autoLoadToggle.checked = this.settings.autoLoad;

    const showOverlayToggle = document.getElementById('showOverlay') as HTMLInputElement;
    if (showOverlayToggle) showOverlayToggle.checked = this.settings.showOverlay;

    // Update select
    const defaultSortSelect = document.getElementById('defaultSort') as HTMLSelectElement;
    if (defaultSortSelect) defaultSortSelect.value = this.settings.defaultSort;

    // Update pro status
    const upgradeBtn = document.getElementById('upgradeBtn');
    const proSection = document.querySelector('.pro-section');
    
    if (this.settings.isPro) {
      if (upgradeBtn) {
        upgradeBtn.textContent = 'Pro Active ✓';
        (upgradeBtn as HTMLButtonElement).disabled = true;
        upgradeBtn.classList.add('pro-active');
      }
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.settings) return;
    
    try {
      await storage.saveSettings(this.settings);
      this.showMessage('Settings saved', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showMessage('Failed to save settings', 'error');
    }
  }

  private handleUpgrade(): void {
    // In a real implementation, this would redirect to Stripe or payment processor
    if (confirm('Redirect to upgrade page?')) {
      chrome.tabs.create({ url: 'https://storylister.app/upgrade' });
    }
  }

  private async exportData(): Promise<void> {
    try {
      const data = await storage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `storylister-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showMessage('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showMessage('Export failed', 'error');
    }
  }

  private async clearData(): Promise<void> {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      try {
        await storage.clearAllData();
        this.showMessage('All data cleared', 'success');
      } catch (error) {
        console.error('Clear data failed:', error);
        this.showMessage('Failed to clear data', 'error');
      }
    }
  }

  private showMessage(message: string, type: 'success' | 'error'): void {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = `popup-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      z-index: 1000;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
    `;

    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 2000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const popupManager = new PopupManager();
  popupManager.init();
});
