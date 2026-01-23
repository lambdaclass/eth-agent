/**
 * Pattern matching tests
 */

import { describe, it, expect } from 'vitest';
import {
  match,
  matchResult,
  P_gt,
  P_lt,
  P_between,
  P_oneOf,
  P_string,
  isCode,
} from '../../src/core/match.js';
import { ok, err, type Result } from '../../src/core/result.js';

describe('match', () => {
  describe('basic pattern matching', () => {
    it('should match primitive values', () => {
      const result = match(42)
        .with(42, () => 'forty-two')
        .with(0, () => 'zero')
        .otherwise(() => 'other');

      expect(result).toBe('forty-two');
    });

    it('should use otherwise for non-matching patterns', () => {
      const result = match(100)
        .with(42, () => 'forty-two')
        .with(0, () => 'zero')
        .otherwise(() => 'other');

      expect(result).toBe('other');
    });

    it('should match object patterns', () => {
      type Shape = { type: 'circle'; radius: number } | { type: 'square'; side: number };

      const shape: Shape = { type: 'circle', radius: 5 };

      const result = match(shape)
        .with({ type: 'circle' }, (s) => `Circle with radius ${s.radius}`)
        .with({ type: 'square' }, (s) => `Square with side ${s.side}`)
        .otherwise(() => 'unknown');

      expect(result).toBe('Circle with radius 5');
    });

    it('should match nested object patterns', () => {
      const obj = { user: { name: 'Alice', age: 30 } };

      const result = match(obj)
        .with({ user: { name: 'Alice' } }, () => 'Found Alice')
        .with({ user: { name: 'Bob' } }, () => 'Found Bob')
        .otherwise(() => 'Unknown user');

      expect(result).toBe('Found Alice');
    });
  });

  describe('predicate patterns', () => {
    it('should match with function predicates', () => {
      const result = match(42)
        .when((x) => x > 50, () => 'large')
        .when((x) => x > 10, () => 'medium')
        .otherwise(() => 'small');

      expect(result).toBe('medium');
    });
  });

  describe('exhaustive matching', () => {
    it('should execute first matching case', () => {
      const result = match('hello')
        .with('hello', () => 'greeting')
        .with('goodbye', () => 'farewell')
        .exhaustive();

      expect(result).toBe('greeting');
    });

    it('should throw on non-exhaustive match', () => {
      expect(() => {
        match('unknown')
          .with('hello', () => 'greeting')
          .exhaustive();
      }).toThrow('Non-exhaustive match');
    });
  });

  describe('run method', () => {
    it('should return undefined for non-matching patterns', () => {
      const result = match(100)
        .with(42, () => 'forty-two')
        .run();

      expect(result).toBeUndefined();
    });

    it('should return matched value', () => {
      const result = match(42)
        .with(42, () => 'forty-two')
        .run();

      expect(result).toBe('forty-two');
    });
  });
});

describe('matchResult', () => {
  it('should handle Ok case', () => {
    const result: Result<number, Error> = ok(42);

    const output = matchResult(result)
      .ok((value) => `Success: ${value}`)
      .err((error) => `Error: ${error.message}`)
      .run();

    expect(output).toBe('Success: 42');
  });

  it('should handle Err case', () => {
    const result: Result<number, Error> = err(new Error('Failed'));

    const output = matchResult(result)
      .ok((value) => `Success: ${value}`)
      .err((error) => `Error: ${error.message}`)
      .run();

    expect(output).toBe('Error: Failed');
  });

  it('should match specific error patterns', () => {
    type AppError = { code: 'NOT_FOUND' } | { code: 'UNAUTHORIZED' } | { code: 'UNKNOWN' };
    const result: Result<number, AppError> = err({ code: 'NOT_FOUND' });

    const output = matchResult(result)
      .ok((value) => `Success: ${value}`)
      .errWith({ code: 'NOT_FOUND' }, () => 'Resource not found')
      .errWith({ code: 'UNAUTHORIZED' }, () => 'Access denied')
      .err(() => 'Unknown error')
      .run();

    expect(output).toBe('Resource not found');
  });

  it('should fall back to general err handler', () => {
    type AppError = { code: 'NOT_FOUND' } | { code: 'UNKNOWN' };
    const result: Result<number, AppError> = err({ code: 'UNKNOWN' });

    const output = matchResult(result)
      .ok((value) => `Success: ${value}`)
      .errWith({ code: 'NOT_FOUND' }, () => 'Resource not found')
      .err((e) => `Other error: ${e.code}`)
      .run();

    expect(output).toBe('Other error: UNKNOWN');
  });
});

describe('pattern helpers', () => {
  describe('P_gt', () => {
    it('should match values greater than threshold', () => {
      expect(P_gt(10)(15)).toBe(true);
      expect(P_gt(10)(10)).toBe(false);
      expect(P_gt(10)(5)).toBe(false);
    });

    it('should work with bigint', () => {
      expect(P_gt(10n)(15n)).toBe(true);
      expect(P_gt(10n)(5n)).toBe(false);
    });
  });

  describe('P_lt', () => {
    it('should match values less than threshold', () => {
      expect(P_lt(10)(5)).toBe(true);
      expect(P_lt(10)(10)).toBe(false);
      expect(P_lt(10)(15)).toBe(false);
    });
  });

  describe('P_between', () => {
    it('should match values in range', () => {
      expect(P_between(5, 15)(10)).toBe(true);
      expect(P_between(5, 15)(5)).toBe(true);
      expect(P_between(5, 15)(15)).toBe(true);
      expect(P_between(5, 15)(4)).toBe(false);
      expect(P_between(5, 15)(16)).toBe(false);
    });
  });

  describe('P_oneOf', () => {
    it('should match values in list', () => {
      const matcher = P_oneOf('a', 'b', 'c');
      expect(matcher('a')).toBe(true);
      expect(matcher('b')).toBe(true);
      expect(matcher('d')).toBe(false);
    });
  });

  describe('P_string', () => {
    it('should match strings', () => {
      expect(P_string()('hello')).toBe(true);
      expect(P_string()(42)).toBe(false);
      expect(P_string()(null)).toBe(false);
    });
  });
});

describe('isCode', () => {
  it('should narrow discriminated union by code', () => {
    type Error = { code: 'A'; dataA: string } | { code: 'B'; dataB: number };
    const err: Error = { code: 'A', dataA: 'hello' };

    if (isCode(err, 'A')) {
      // TypeScript should narrow this
      expect(err.dataA).toBe('hello');
    }
  });
});
