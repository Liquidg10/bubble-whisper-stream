import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Make vi globally available
global.vi = vi;

// Node 22+ exposes an experimental built-in `localStorage`/`sessionStorage` global
// (stabilized further in later Node versions). Without a `--localstorage-file` path
// configured, Node's own global shadows jsdom's window.localStorage but is missing
// basic methods (getItem/setItem/clear/etc all throw "is not a function"), which
// broke every test in this suite that touches localStorage. Replace both globals
// with a simple in-memory Storage-like shim up front so jsdom's window.localStorage
// (and any test-local `global.localStorage = {...}` override) works as expected.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(target, 'sessionStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Web Speech API
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
    speaking: false,
    pending: false,
    paused: false,
  },
});

// Mock IndexedDB
const mockIDBRequest = {
  result: null,
  error: null,
  onsuccess: null,
  onerror: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', {
  writable: true,
  value: {
    open: vi.fn(() => mockIDBRequest),
    deleteDatabase: vi.fn(() => mockIDBRequest),
  },
});