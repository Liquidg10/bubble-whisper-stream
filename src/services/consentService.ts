// Consent Management Service
// Handles user consent for different intelligence features with proper versioning

import { ConsentRecord } from '@/types/bubble';
import { storageService } from './storage';

class ConsentService {
  private db: IDBDatabase | null = null;

  async initialize() {
    if (!this.db) {
      await storageService.initialize();
      this.db = (storageService as any).db;
    }
  }

  async grantConsent(feature: string, version: string = '1.0'): Promise<void> {
    await this.initialize();
    
    const consent: ConsentRecord = {
      id: crypto.randomUUID(),
      feature,
      granted: true,
      timestamp: Date.now(),
      version
    };

    const transaction = this.db!.transaction(['consent_records'], 'readwrite');
    const store = transaction.objectStore('consent_records');
    await this.promisifyRequest(store.add(consent));
  }

  async revokeConsent(feature: string): Promise<void> {
    await this.initialize();
    
    const consent: ConsentRecord = {
      id: crypto.randomUUID(),
      feature,
      granted: false,
      timestamp: Date.now(),
      version: '1.0'
    };

    const transaction = this.db!.transaction(['consent_records'], 'readwrite');
    const store = transaction.objectStore('consent_records');
    await this.promisifyRequest(store.add(consent));
  }

  async hasConsent(feature: string): Promise<boolean> {
    await this.initialize();
    
    const transaction = this.db!.transaction(['consent_records'], 'readonly');
    const store = transaction.objectStore('consent_records');
    const index = store.index('feature');
    const records = await this.promisifyRequest(index.getAll(feature));
    
    if (records.length === 0) return false;
    
    // Get most recent consent record
    const latest = records.sort((a, b) => b.timestamp - a.timestamp)[0];
    return latest.granted;
  }

  async requestConsent(feature: string, description: string): Promise<boolean> {
    // In a real app, this would show a consent dialog
    // For now, just return true for testing
    await this.grantConsent(feature);
    return true;
  }

  async recordConsent(feature: string, options: { purpose: string; dataUsage: string; retention: string }): Promise<void> {
    await this.grantConsent(feature);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const consentService = new ConsentService();