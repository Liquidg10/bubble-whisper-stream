/**
 * Development logging utility
 * Only logs when DEBUG mode is explicitly enabled
 */

/**
 * Development logger - only active when localStorage.DEBUG === 'true'
 * Use sparingly for debugging specific features
 */
export function devLog(key: string, data?: any): void {
  if (localStorage.getItem('DEBUG') === 'true') {
    const timestamp = new Date().toISOString().substr(11, 12);
    if (data !== undefined) {
      console.log(`[DEV] ${timestamp} ${key}`, data);
    } else {
      console.log(`[DEV] ${timestamp} ${key}`);
    }
  }
}

/**
 * Enable debug logging
 */
export function enableDebugMode(): void {
  localStorage.setItem('DEBUG', 'true');
  devLog('Debug mode enabled');
}

/**
 * Disable debug logging
 */
export function disableDebugMode(): void {
  devLog('Debug mode disabled');
  localStorage.removeItem('DEBUG');
}

/**
 * Check if debug mode is active
 */
export function isDebugMode(): boolean {
  return localStorage.getItem('DEBUG') === 'true';
}

/**
 * Conditional dev log - only logs if condition is true
 */
export function devLogIf(condition: boolean, key: string, data?: any): void {
  if (condition) {
    devLog(key, data);
  }
}

/**
 * Performance timing helper
 */
export function devTime(label: string): () => void {
  if (localStorage.getItem('DEBUG') === 'true') {
    const start = performance.now();
    devLog(`⏱️ START ${label}`);
    
    return () => {
      const duration = performance.now() - start;
      devLog(`⏱️ END ${label}`, `${duration.toFixed(2)}ms`);
    };
  }
  
  // Return no-op function when debug is disabled
  return () => {};
}

/**
 * Error logging with stack trace
 */
export function devError(key: string, error: Error | unknown): void {
  if (localStorage.getItem('DEBUG') === 'true') {
    const timestamp = new Date().toISOString().substr(11, 12);
    console.error(`[DEV] ${timestamp} ERROR ${key}`, error);
    
    if (error instanceof Error && error.stack) {
      console.error(`[DEV] ${timestamp} STACK ${key}`, error.stack);
    }
  }
}