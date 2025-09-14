/**
 * Phase 4A: Enhanced Offline Image Caching
 * Caches bubble attachments and images for offline access
 */

interface CachedImage {
  id: string;
  url: string;
  blob: Blob;
  timestamp: number;
  size: number;
  bubbleId?: string;
}

interface CacheStats {
  totalSize: number;
  imageCount: number;
  lastCleanup: number;
  maxSize: number; // 50MB default
}

class OfflineImageCaching {
  private dbName = 'bubble-image-cache';
  private version = 1;
  private maxCacheSize = 50 * 1024 * 1024; // 50MB
  private maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images', { keyPath: 'id' });
          store.createIndex('bubbleId', 'bubbleId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'id' });
        }
      };
    });
  }

  async cacheImage(url: string, bubbleId?: string): Promise<string | null> {
    try {
      // Check if already cached
      const existing = await this.getCachedImage(url);
      if (existing) return existing.url;

      // Fetch image
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      
      const blob = await response.blob();
      const id = this.generateImageId(url);
      
      // Store in cache
      await this.storeImage({
        id,
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
        bubbleId
      });

      // Cleanup if necessary
      await this.cleanupIfNeeded();

      // Return blob URL for immediate use
      return URL.createObjectURL(blob);
    } catch (error) {
      console.warn('Failed to cache image:', error);
      return null;
    }
  }

  async getCachedImage(url: string): Promise<CachedImage | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const id = this.generateImageId(url);
        
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
          const result = getRequest.result;
          if (result && this.isImageValid(result)) {
            resolve(result);
          } else {
            resolve(null);
          }
        };
        
        getRequest.onerror = () => resolve(null);
      };
      
      request.onerror = () => resolve(null);
    });
  }

  async getCachedImageUrl(url: string): Promise<string | null> {
    const cached = await this.getCachedImage(url);
    if (cached) {
      return URL.createObjectURL(cached.blob);
    }
    return null;
  }

  async preloadBubbleImages(bubbleIds: string[]): Promise<void> {
    // This would integrate with bubble store to preload all images for specific bubbles
    console.log('Preloading images for bubbles:', bubbleIds);
    // Implementation would fetch bubble data and cache all associated images
  }

  async getCacheStats(): Promise<CacheStats> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['images', 'stats'], 'readonly');
        const imageStore = transaction.objectStore('images');
        const statsStore = transaction.objectStore('stats');
        
        let totalSize = 0;
        let imageCount = 0;
        
        const cursor = imageStore.openCursor();
        cursor.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            totalSize += cursor.value.size;
            imageCount++;
            cursor.continue();
          } else {
            // Get stored stats for last cleanup time
            const statsRequest = statsStore.get('cache-stats');
            statsRequest.onsuccess = () => {
              const stats = statsRequest.result || { lastCleanup: 0 };
              resolve({
                totalSize,
                imageCount,
                lastCleanup: stats.lastCleanup,
                maxSize: this.maxCacheSize
              });
            };
          }
        };
        
        cursor.onerror = () => resolve({
          totalSize: 0,
          imageCount: 0,
          lastCleanup: 0,
          maxSize: this.maxCacheSize
        });
      };
      
      request.onerror = () => resolve({
        totalSize: 0,
        imageCount: 0,
        lastCleanup: 0,
        maxSize: this.maxCacheSize
      });
    });
  }

  private async storeImage(image: CachedImage): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        const addRequest = store.put(image);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => reject(addRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  private async cleanupIfNeeded(): Promise<void> {
    const stats = await this.getCacheStats();
    
    if (stats.totalSize > this.maxCacheSize) {
      await this.performCleanup();
    }
  }

  private async performCleanup(): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['images', 'stats'], 'readwrite');
        const imageStore = transaction.objectStore('images');
        const statsStore = transaction.objectStore('stats');
        
        // Get all images sorted by timestamp (oldest first)
        const index = imageStore.index('timestamp');
        const cursor = index.openCursor();
        const oldImages: string[] = [];
        
        cursor.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const image = cursor.value;
            const age = Date.now() - image.timestamp;
            
            // Mark old images for deletion
            if (age > this.maxAge) {
              oldImages.push(image.id);
            }
            
            cursor.continue();
          } else {
            // Delete old images
            oldImages.forEach(id => {
              imageStore.delete(id);
            });
            
            // Update cleanup timestamp
            statsStore.put({
              id: 'cache-stats',
              lastCleanup: Date.now()
            });
            
            console.log(`🖼️ Cleaned up ${oldImages.length} old cached images`);
            resolve();
          }
        };
        
        cursor.onerror = () => resolve();
      };
      
      request.onerror = () => resolve();
    });
  }

  private generateImageId(url: string): string {
    // Simple hash function for URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `img_${hash.toString(36)}`;
  }

  private isImageValid(image: CachedImage): boolean {
    const age = Date.now() - image.timestamp;
    return age <= this.maxAge;
  }
}

export const offlineImageCaching = new OfflineImageCaching();