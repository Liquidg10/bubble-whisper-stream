
// Log function signature
type LogFn = (...args: unknown[]) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

const noop: LogFn = () => {};

const createDefaultLogger = (): Logger => {
  // Silence info/debug logs in production by default
  if (import.meta.env.PROD) {
    return {
      info: noop,
      warn: noop,
      error: console.error.bind(console),
      debug: noop,
    };
  }

  return {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: (console.debug || console.log).bind(console),
  };
};

let currentLogger: Logger = createDefaultLogger();

export const logger: Logger = {
  info: (...args) => currentLogger.info(...args),
  warn: (...args) => currentLogger.warn(...args),
  error: (...args) => currentLogger.error(...args),
  debug: (...args) => currentLogger.debug(...args),
};

// Allow overriding logger implementation (e.g., send to external service)
export const setLogger = (custom: Partial<Logger>) => {
  currentLogger = { ...currentLogger, ...custom };
};

export type { Logger as LoggerType };
