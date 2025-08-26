/**
 * Structured logging utility for the application
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  prefix: string;
}

class Logger {
  private config: LogConfig = {
    enabled: process.env.NODE_ENV !== 'production',
    level: 'info',
    prefix: '[Bubble Universe]'
  };

  configure(config: Partial<LogConfig>) {
    this.config = { ...this.config, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    return levels[level] >= levels[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): [string, ...any[]] {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${this.config.prefix} [${level.toUpperCase()}] ${timestamp} ${message}`;
    return [formattedMessage, ...args];
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.debug(...this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.info(...this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', message, ...args));
    }
  }

  // Convenience method for atomic operations
  atomic(operation: string, details?: any) {
    this.info(`Atomic operation: ${operation}`, details);
  }
}

export const logger = new Logger();