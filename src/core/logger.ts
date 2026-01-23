/**
 * Logger Interface
 * Provides structured logging abstraction for the library
 */

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log context - additional metadata for log entries
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Logger interface that consumers can implement
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/**
 * No-op logger that silently discards all log messages
 * Useful when logging is not needed
 */
/* eslint-disable @typescript-eslint/no-empty-function */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
/* eslint-enable @typescript-eslint/no-empty-function */

/**
 * Console logger that outputs to console with structured context
 * Default logger when none is provided
 */
export const consoleLogger: Logger = {
  debug(message: string, context?: LogContext): void {
    if (context) {
      console.debug(`[DEBUG] ${message}`, context);
    } else {
      console.debug(`[DEBUG] ${message}`);
    }
  },
  info(message: string, context?: LogContext): void {
    if (context) {
      console.info(`[INFO] ${message}`, context);
    } else {
      console.info(`[INFO] ${message}`);
    }
  },
  warn(message: string, context?: LogContext): void {
    if (context) {
      console.warn(`[WARN] ${message}`, context);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error(message: string, context?: LogContext): void {
    if (context) {
      console.error(`[ERROR] ${message}`, context);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },
};

/**
 * Create a prefixed logger that adds a component prefix to all messages
 */
export function createPrefixedLogger(logger: Logger, prefix: string): Logger {
  return {
    debug(message: string, context?: LogContext): void {
      logger.debug(`[${prefix}] ${message}`, context);
    },
    info(message: string, context?: LogContext): void {
      logger.info(`[${prefix}] ${message}`, context);
    },
    warn(message: string, context?: LogContext): void {
      logger.warn(`[${prefix}] ${message}`, context);
    },
    error(message: string, context?: LogContext): void {
      logger.error(`[${prefix}] ${message}`, context);
    },
  };
}
