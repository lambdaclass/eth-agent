import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  noopLogger,
  consoleLogger,
  createPrefixedLogger,
  type Logger,
} from '../../src/core/logger.js';

describe('Logger', () => {
  describe('noopLogger', () => {
    it('has all required methods', () => {
      expect(typeof noopLogger.debug).toBe('function');
      expect(typeof noopLogger.info).toBe('function');
      expect(typeof noopLogger.warn).toBe('function');
      expect(typeof noopLogger.error).toBe('function');
    });

    it('does not throw when called', () => {
      expect(() => noopLogger.debug('test')).not.toThrow();
      expect(() => noopLogger.info('test', { key: 'value' })).not.toThrow();
      expect(() => noopLogger.warn('test')).not.toThrow();
      expect(() => noopLogger.error('test', { error: 'something' })).not.toThrow();
    });
  });

  describe('consoleLogger', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs debug messages', () => {
      consoleLogger.debug('debug message');
      expect(debugSpy).toHaveBeenCalledWith('[DEBUG] debug message');
    });

    it('logs debug messages with context', () => {
      consoleLogger.debug('debug message', { key: 'value' });
      expect(debugSpy).toHaveBeenCalledWith('[DEBUG] debug message', { key: 'value' });
    });

    it('logs info messages', () => {
      consoleLogger.info('info message');
      expect(infoSpy).toHaveBeenCalledWith('[INFO] info message');
    });

    it('logs info messages with context', () => {
      consoleLogger.info('info message', { count: 42 });
      expect(infoSpy).toHaveBeenCalledWith('[INFO] info message', { count: 42 });
    });

    it('logs warn messages', () => {
      consoleLogger.warn('warn message');
      expect(warnSpy).toHaveBeenCalledWith('[WARN] warn message');
    });

    it('logs warn messages with context', () => {
      consoleLogger.warn('warn message', { level: 'high' });
      expect(warnSpy).toHaveBeenCalledWith('[WARN] warn message', { level: 'high' });
    });

    it('logs error messages', () => {
      consoleLogger.error('error message');
      expect(errorSpy).toHaveBeenCalledWith('[ERROR] error message');
    });

    it('logs error messages with context', () => {
      consoleLogger.error('error message', { error: 'test error' });
      expect(errorSpy).toHaveBeenCalledWith('[ERROR] error message', { error: 'test error' });
    });
  });

  describe('createPrefixedLogger', () => {
    it('prefixes all log messages', () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const prefixedLogger = createPrefixedLogger(mockLogger, 'MyComponent');

      prefixedLogger.debug('debug');
      expect(mockLogger.debug).toHaveBeenCalledWith('[MyComponent] debug', undefined);

      prefixedLogger.info('info', { key: 'value' });
      expect(mockLogger.info).toHaveBeenCalledWith('[MyComponent] info', { key: 'value' });

      prefixedLogger.warn('warn');
      expect(mockLogger.warn).toHaveBeenCalledWith('[MyComponent] warn', undefined);

      prefixedLogger.error('error', { err: 'test' });
      expect(mockLogger.error).toHaveBeenCalledWith('[MyComponent] error', { err: 'test' });
    });

    it('can be nested for hierarchical prefixes', () => {
      const mockLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const parent = createPrefixedLogger(mockLogger, 'Parent');
      const child = createPrefixedLogger(parent, 'Child');

      child.info('message');
      expect(mockLogger.info).toHaveBeenCalledWith('[Parent] [Child] message', undefined);
    });
  });
});
