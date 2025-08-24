// Basic plugin architecture with capability model and sandbox isolation
import { EventEmitter } from 'events';

export interface PluginCapability {
  scope: 'read' | 'write' | 'admin';
  resource: 'bubble' | 'cbt' | 'glimmer' | 'setting' | 'search';
  filters?: {
    tags?: string[];
    types?: string[];
    timeRange?: { start: string; end: string };
  };
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: PluginCapability[];
  entryPoint: string;
  sandboxed: boolean;
  quotas: {
    maxApiCalls: number;
    maxStorageSize: number;
    maxExecutionTime: number;
  };
}

export interface PluginContext {
  api: PluginAPI;
  storage: PluginStorage;
  events: PluginEventBus;
  quota: QuotaManager;
}

export interface PluginAPI {
  // Bubble operations
  getBubbles(filter?: any): Promise<any[]>;
  createBubble?(data: any): Promise<any>;
  updateBubble?(id: string, data: any): Promise<void>;
  deleteBubble?(id: string): Promise<void>;
  
  // CBT operations
  getCBTEntries(filter?: any): Promise<any[]>;
  createCBTEntry?(data: any): Promise<any>;
  
  // Search operations
  search(query: string, filter?: any): Promise<any[]>;
  
  // Settings (admin only)
  getSettings?(): Promise<any>;
  updateSettings?(data: any): Promise<void>;
}

export interface PluginStorage {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface PluginEventBus {
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  emit(event: string, data: any): void;
}

export interface QuotaManager {
  checkApiQuota(): boolean;
  checkStorageQuota(size: number): boolean;
  checkExecutionTime(): boolean;
  incrementApiCall(): void;
  incrementStorage(size: number): void;
  startExecution(): void;
  endExecution(): void;
  reset(): void;
  getUsage(): {
    apiCalls: number;
    storageUsed: number;
    executionTime: number;
  };
}

class PluginSandbox {
  private iframe: HTMLIFrameElement | null = null;
  private messageId = 0;
  private pendingMessages = new Map<number, { resolve: Function; reject: Function }>();
  
  constructor(private manifest: PluginManifest, private context: PluginContext) {}

  async initialize(): Promise<void> {
    if (!this.manifest.sandboxed) return;
    
    // Create sandboxed iframe
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    this.iframe.sandbox.add(
      'allow-scripts',
      'allow-same-origin' // Needed for localStorage access
    );
    
    // Setup message handling
    window.addEventListener('message', this.handleMessage.bind(this));
    
    document.body.appendChild(this.iframe);
    
    // Load plugin code
    const pluginCode = await this.loadPluginCode();
    const sandboxHTML = this.createSandboxHTML(pluginCode);
    
    this.iframe.srcdoc = sandboxHTML;
  }

  private async loadPluginCode(): Promise<string> {
    // In a real implementation, this would load from a secure plugin registry
    return `
      // Plugin execution environment
      const pluginAPI = {
        getBubbles: (filter) => parent.postMessage({
          type: 'api-call',
          method: 'getBubbles',
          params: [filter],
          id: Date.now()
        }, '*'),
        
        createBubble: (data) => parent.postMessage({
          type: 'api-call', 
          method: 'createBubble',
          params: [data],
          id: Date.now()
        }, '*'),
        
        search: (query, filter) => parent.postMessage({
          type: 'api-call',
          method: 'search', 
          params: [query, filter],
          id: Date.now()
        }, '*')
      };
      
      const pluginStorage = {
        get: (key) => parent.postMessage({
          type: 'storage-call',
          method: 'get',
          params: [key],
          id: Date.now()
        }, '*'),
        
        set: (key, value) => parent.postMessage({
          type: 'storage-call',
          method: 'set', 
          params: [key, value],
          id: Date.now()
        }, '*')
      };
      
      // Plugin entry point
      ${this.manifest.entryPoint}
    `;
  }

  private createSandboxHTML(pluginCode: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
            .plugin-container { max-width: 100%; }
          </style>
        </head>
        <body>
          <div id="plugin-root" class="plugin-container"></div>
          <script>
            ${pluginCode}
          </script>
        </body>
      </html>
    `;
  }

  private handleMessage(event: MessageEvent): void {
    if (event.source !== this.iframe?.contentWindow) return;
    
    const { type, method, params, id } = event.data;
    
    switch (type) {
      case 'api-call':
        this.handleAPICall(method, params, id);
        break;
      case 'storage-call':
        this.handleStorageCall(method, params, id);
        break;
      case 'event-emit':
        this.context.events.emit(method, params[0]);
        break;
    }
  }

  private async handleAPICall(method: string, params: any[], id: number): Promise<void> {
    try {
      // Check quotas
      if (!this.context.quota.checkApiQuota()) {
        throw new Error('API quota exceeded');
      }
      
      this.context.quota.incrementApiCall();
      
      // Check capabilities
      if (!this.hasCapability(method, params)) {
        throw new Error(`Insufficient capabilities for ${method}`);
      }
      
      // Execute API call
      const result = await (this.context.api as any)[method](...params);
      
      this.iframe?.contentWindow?.postMessage({
        type: 'api-response',
        id,
        result
      }, '*');
      
    } catch (error) {
      this.iframe?.contentWindow?.postMessage({
        type: 'api-error',
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '*');
    }
  }

  private async handleStorageCall(method: string, params: any[], id: number): Promise<void> {
    try {
      if (method === 'set' && !this.context.quota.checkStorageQuota(JSON.stringify(params[1]).length)) {
        throw new Error('Storage quota exceeded');
      }
      
      const result = await (this.context.storage as any)[method](...params);
      
      if (method === 'set') {
        this.context.quota.incrementStorage(JSON.stringify(params[1]).length);
      }
      
      this.iframe?.contentWindow?.postMessage({
        type: 'storage-response',
        id,
        result
      }, '*');
      
    } catch (error) {
      this.iframe?.contentWindow?.postMessage({
        type: 'storage-error',
        id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '*');
    }
  }

  private hasCapability(method: string, params: any[]): boolean {
    const requiredCapability = this.getRequiredCapability(method);
    if (!requiredCapability) return false;
    
    return this.manifest.capabilities.some(cap => 
      cap.scope === requiredCapability.scope && 
      cap.resource === requiredCapability.resource
    );
  }

  private getRequiredCapability(method: string): { scope: string; resource: string } | null {
    const capabilityMap: Record<string, { scope: string; resource: string }> = {
      'getBubbles': { scope: 'read', resource: 'bubble' },
      'createBubble': { scope: 'write', resource: 'bubble' },
      'updateBubble': { scope: 'write', resource: 'bubble' },
      'deleteBubble': { scope: 'write', resource: 'bubble' },
      'getCBTEntries': { scope: 'read', resource: 'cbt' },
      'createCBTEntry': { scope: 'write', resource: 'cbt' },
      'search': { scope: 'read', resource: 'search' },
      'getSettings': { scope: 'admin', resource: 'setting' },
      'updateSettings': { scope: 'admin', resource: 'setting' }
    };
    
    return capabilityMap[method] || null;
  }

  destroy(): void {
    if (this.iframe) {
      document.body.removeChild(this.iframe);
      this.iframe = null;
    }
    window.removeEventListener('message', this.handleMessage);
  }
}

class PluginManager {
  private plugins = new Map<string, PluginSandbox>();
  private eventBus = new EventEmitter();
  private quarantinedPlugins = new Set<string>();

  async loadPlugin(manifest: PluginManifest): Promise<void> {
    if (this.quarantinedPlugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is quarantined`);
    }

    // Validate manifest
    this.validateManifest(manifest);
    
    // Create plugin context
    const context = this.createPluginContext(manifest);
    
    // Create and initialize sandbox
    const sandbox = new PluginSandbox(manifest, context);
    await sandbox.initialize();
    
    this.plugins.set(manifest.id, sandbox);
    
    console.log(`Plugin ${manifest.name} loaded successfully`);
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    const sandbox = this.plugins.get(pluginId);
    if (sandbox) {
      sandbox.destroy();
      this.plugins.delete(pluginId);
      console.log(`Plugin ${pluginId} unloaded`);
    }
  }

  quarantinePlugin(pluginId: string, reason: string): void {
    this.quarantinedPlugins.add(pluginId);
    this.unloadPlugin(pluginId);
    console.warn(`Plugin ${pluginId} quarantined: ${reason}`);
  }

  getLoadedPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  getQuarantinedPlugins(): string[] {
    return Array.from(this.quarantinedPlugins);
  }

  private validateManifest(manifest: PluginManifest): void {
    const required = ['id', 'name', 'version', 'description', 'author', 'capabilities', 'entryPoint'];
    
    for (const field of required) {
      if (!manifest[field as keyof PluginManifest]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
      throw new Error('Plugin must declare at least one capability');
    }
  }

  private createPluginContext(manifest: PluginManifest): PluginContext {
    const quotaManager = new PluginQuotaManager(manifest.quotas);
    
    return {
      api: this.createPluginAPI(manifest),
      storage: this.createPluginStorage(manifest.id),
      events: this.createPluginEventBus(manifest.id),
      quota: quotaManager
    };
  }

  private createPluginAPI(manifest: PluginManifest): PluginAPI {
    // Import bubble store dynamically to avoid circular imports
    const getBubbleStore = () => import('@/stores/bubbleStore').then(m => m.useBubbleStore.getState());
    
    // Create capability-filtered API
    const api: any = {};
    
    manifest.capabilities.forEach(cap => {
      switch (cap.resource) {
        case 'bubble':
          if (cap.scope === 'read') {
            api.getBubbles = async (filter?: any) => {
              const store = await getBubbleStore();
              let bubbles = store.bubbles;
              
              // Apply capability filters
              if (cap.filters?.tags) {
                bubbles = bubbles.filter(b => 
                  b.tags.some(tag => cap.filters!.tags!.includes(typeof tag === 'string' ? tag : tag.name))
                );
              }
              if (cap.filters?.types) {
                bubbles = bubbles.filter(b => 
                  cap.filters!.types!.includes(b.type)
                );
              }
              if (cap.filters?.timeRange) {
                const start = new Date(cap.filters.timeRange.start).getTime();
                const end = new Date(cap.filters.timeRange.end).getTime();
                bubbles = bubbles.filter(b => 
                  b.createdAt >= start && b.createdAt <= end
                );
              }
              
              return bubbles;
            };
          }
          if (cap.scope === 'write') {
            api.createBubble = async (data: any) => {
              const store = await getBubbleStore();
              const bubble = {
                id: crypto.randomUUID(),
                content: data.content || '',
                type: data.type || 'Thought',
                size: data.size || 40,
                x: data.x || Math.random() * 400,
                y: data.y || Math.random() * 400,
                tags: data.tags || [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                completed: false,
                ...data
              };
              await store.addBubble(bubble);
              
              // Emit event for other plugins
              this.eventBus.emit('bubble-created', { bubble, pluginId: manifest.id });
              
              return bubble;
            };
            
            api.updateBubble = async (id: string, data: any) => {
              const store = await getBubbleStore();
              const existing = store.bubbles.find(b => b.id === id);
              if (!existing) throw new Error('Bubble not found');
              
              const updated = { ...existing, ...data, updatedAt: Date.now() };
              await store.updateBubble(updated);
              
              this.eventBus.emit('bubble-updated', { bubble: updated, pluginId: manifest.id });
            };
            
            api.deleteBubble = async (id: string) => {
              const store = await getBubbleStore();
              await store.deleteBubble(id);
              
              this.eventBus.emit('bubble-deleted', { bubbleId: id, pluginId: manifest.id });
            };
          }
          break;
          
        case 'cbt':
          if (cap.scope === 'read') {
            api.getCBTEntries = async (filter?: any) => {
              const store = await getBubbleStore();
              return store.getCBTEntries();
            };
          }
          if (cap.scope === 'write') {
            api.createCBTEntry = async (data: any) => {
              const store = await getBubbleStore();
              const entry = {
                id: crypto.randomUUID(),
                thought: data.thought || '',
                feeling: data.feeling || '',
                evidence: data.evidence || '',
                reframe: data.reframe || '',
                mood: data.mood || 5,
                createdAt: Date.now(),
                ...data
              };
              await store.addCBTEntry(entry);
              
              this.eventBus.emit('cbt-entry-created', { entry, pluginId: manifest.id });
              
              return entry;
            };
          }
          break;
          
        case 'search':
          if (cap.scope === 'read') {
            api.search = async (query: string, filter?: any) => {
              const store = await getBubbleStore();
              const allBubbles = store.bubbles;
              
              // Simple text search implementation
              const results = allBubbles.filter(bubble => 
                bubble.content.toLowerCase().includes(query.toLowerCase()) ||
                bubble.tags.some(tag => (typeof tag === 'string' ? tag : tag.name).toLowerCase().includes(query.toLowerCase()))
              );
              
              return results;
            };
          }
          break;
          
        case 'glimmer':
          if (cap.scope === 'write') {
            api.createGlimmer = async (data: any) => {
              const store = await getBubbleStore();
              const glimmer = {
                id: crypto.randomUUID(),
                type: data.type || 'insight',
                content: data.content || '',
                source: `plugin:${manifest.id}`,
                createdAt: Date.now(),
                dismissed: false,
                ...data
              };
              await store.addGlimmer(glimmer);
              
              this.eventBus.emit('glimmer-created', { glimmer, pluginId: manifest.id });
              
              return glimmer;
            };
          }
          break;
          
        case 'setting':
          if (cap.scope === 'admin') {
            api.getSettings = async () => {
              const store = await getBubbleStore();
              return store.settings;
            };
            
            api.updateSettings = async (data: any) => {
              const store = await getBubbleStore();
              await store.updateSettings(data);
              
              this.eventBus.emit('settings-updated', { settings: data, pluginId: manifest.id });
            };
          }
          break;
      }
    });
    
    return api;
  }

  private createPluginStorage(pluginId: string): PluginStorage {
    const prefix = `plugin-${pluginId}-`;
    
    return {
      async get(key: string) {
        const value = localStorage.getItem(prefix + key);
        return value ? JSON.parse(value) : null;
      },
      
      async set(key: string, value: any) {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      },
      
      async delete(key: string) {
        localStorage.removeItem(prefix + key);
      },
      
      async clear() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
        keys.forEach(k => localStorage.removeItem(k));
      },
      
      async keys() {
        return Object.keys(localStorage)
          .filter(k => k.startsWith(prefix))
          .map(k => k.slice(prefix.length));
      }
    };
  }

  private createPluginEventBus(pluginId: string): PluginEventBus {
    return {
      on: (event: string, handler: (...args: any[]) => void) => {
        this.eventBus.on(`${pluginId}:${event}`, handler);
      },
      
      off: (event: string, handler: (...args: any[]) => void) => {
        this.eventBus.off(`${pluginId}:${event}`, handler);
      },
      
      emit: (event: string, data: any) => {
        this.eventBus.emit(`${pluginId}:${event}`, data);
      }
    };
  }
}

class PluginQuotaManager implements QuotaManager {
  private usage = {
    apiCalls: 0,
    storageUsed: 0,
    executionTime: 0
  };
  private executionStart = 0;

  constructor(private quotas: PluginManifest['quotas']) {}

  checkApiQuota(): boolean {
    return this.usage.apiCalls < this.quotas.maxApiCalls;
  }

  checkStorageQuota(size: number): boolean {
    return this.usage.storageUsed + size <= this.quotas.maxStorageSize;
  }

  checkExecutionTime(): boolean {
    return this.usage.executionTime < this.quotas.maxExecutionTime;
  }

  incrementApiCall(): void {
    this.usage.apiCalls++;
  }

  incrementStorage(size: number): void {
    this.usage.storageUsed += size;
  }

  startExecution(): void {
    this.executionStart = Date.now();
  }

  endExecution(): void {
    if (this.executionStart > 0) {
      this.usage.executionTime += Date.now() - this.executionStart;
      this.executionStart = 0;
    }
  }

  reset(): void {
    this.usage = { apiCalls: 0, storageUsed: 0, executionTime: 0 };
  }

  getUsage() {
    return { ...this.usage };
  }
}

// Global event bus for plugin system
export const globalPluginEventBus = new EventEmitter();

export const pluginManager = new PluginManager();

// Export event types for type safety
export type PluginEvent = 
  | { type: 'bubble-created'; data: { bubble: any; pluginId: string } }
  | { type: 'bubble-updated'; data: { bubble: any; pluginId: string } }
  | { type: 'bubble-deleted'; data: { bubbleId: string; pluginId: string } }
  | { type: 'cbt-entry-created'; data: { entry: any; pluginId: string } }
  | { type: 'glimmer-created'; data: { glimmer: any; pluginId: string } }
  | { type: 'settings-updated'; data: { settings: any; pluginId: string } };