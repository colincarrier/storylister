import { Viewer, ViewEvent, Snapshot, ExtensionSettings, AnalyticsData } from './types';

class StorylistStorage {
  private dbName = 'storylister-db';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Viewers store
        if (!db.objectStoreNames.contains('viewers')) {
          const viewersStore = db.createObjectStore('viewers', { keyPath: 'username' });
          viewersStore.createIndex('displayName', 'displayName', { unique: false });
          viewersStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        }
        
        // View events store
        if (!db.objectStoreNames.contains('viewEvents')) {
          const eventsStore = db.createObjectStore('viewEvents', { keyPath: ['storyId', 'viewer.username', 'viewedAt'] });
          eventsStore.createIndex('storyId', 'storyId', { unique: false });
          eventsStore.createIndex('viewedAt', 'viewedAt', { unique: false });
        }
        
        // Snapshots store
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshotsStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapshotsStore.createIndex('storyId', 'storyId', { unique: false });
          snapshotsStore.createIndex('capturedAt', 'capturedAt', { unique: false });
        }
        
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  async saveViewer(viewer: Viewer): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['viewers'], 'readwrite');
    const store = transaction.objectStore('viewers');
    
    // Update viewer with current timestamp
    const updatedViewer = { ...viewer, lastSeen: Date.now() };
    
    return new Promise((resolve, reject) => {
      const request = store.put(updatedViewer);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getViewers(): Promise<Viewer[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['viewers'], 'readonly');
    const store = transaction.objectStore('viewers');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async saveViewEvent(event: ViewEvent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['viewEvents'], 'readwrite');
    const store = transaction.objectStore('viewEvents');
    
    return new Promise((resolve, reject) => {
      const request = store.add(event);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['snapshots'], 'readwrite');
    const store = transaction.objectStore('snapshots');
    
    return new Promise((resolve, reject) => {
      const request = store.add(snapshot);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSnapshots(): Promise<Snapshot[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['snapshots'], 'readonly');
    const store = transaction.objectStore('snapshots');
    const index = store.index('capturedAt');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result.reverse());
    });
  }

  async getSettings(): Promise<ExtensionSettings> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    return new Promise((resolve, reject) => {
      const request = store.get('general');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const defaultSettings: ExtensionSettings = {
          autoLoad: true,
          showOverlay: true,
          defaultSort: 'recent',
          dataRetention: 30,
          isPro: false
        };
        resolve(request.result?.value || defaultSettings);
      };
    });
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'general', value: settings });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async exportData(): Promise<string> {
    const [viewers, snapshots, settings] = await Promise.all([
      this.getViewers(),
      this.getSnapshots(),
      this.getSettings()
    ]);
    
    return JSON.stringify({
      viewers,
      snapshots,
      settings,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const storeNames = ['viewers', 'viewEvents', 'snapshots'];
    const transaction = this.db.transaction(storeNames, 'readwrite');
    
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = storeNames.length;
      
      const onComplete = () => {
        completed++;
        if (completed === total) resolve();
      };
      
      storeNames.forEach(storeName => {
        const request = transaction.objectStore(storeName).clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = onComplete;
      });
    });
  }
}

export const storage = new StorylistStorage();
