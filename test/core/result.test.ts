/**
 * Result type tests
 */

import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  match,
  fromPromise,
  fromThrowable,
  combine,
  ResultAsync,
} from '../../src/core/result.js';

describe('Result', () => {
  describe('ok and err', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should create Err result', () => {
      const result = err('error');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('error');
    });
  });

  describe('isOk and isErr', () => {
    it('should identify Ok', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should identify Err', () => {
      const result = err('error');
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('unwrap', () => {
    it('should unwrap Ok', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw on Err', () => {
      const result = err('error');
      expect(() => unwrap(result)).toThrow('error');
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('should return default for Err', () => {
      const result = err('error');
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('map', () => {
    it('should transform Ok value', () => {
      const result = ok(42);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped) && mapped.value).toBe(84);
    });

    it('should pass through Err', () => {
      const result = err<number, string>('error');
      const mapped = map(result, (x) => x * 2);
      expect(isErr(mapped) && mapped.error).toBe('error');
    });
  });

  describe('mapErr', () => {
    it('should pass through Ok', () => {
      const result = ok<number, string>(42);
      const mapped = mapErr(result, (e) => e.toUpperCase());
      expect(isOk(mapped) && mapped.value).toBe(42);
    });

    it('should transform Err', () => {
      const result = err<number, string>('error');
      const mapped = mapErr(result, (e) => e.toUpperCase());
      expect(isErr(mapped) && mapped.error).toBe('ERROR');
    });
  });

  describe('andThen', () => {
    it('should chain Ok results', () => {
      const result = ok(42);
      const chained = andThen(result, (x) => ok(x * 2));
      expect(isOk(chained) && chained.value).toBe(84);
    });

    it('should short-circuit on Err', () => {
      const result = err<number, string>('error');
      const chained = andThen(result, (x) => ok(x * 2));
      expect(isErr(chained) && chained.error).toBe('error');
    });

    it('should propagate Err from chained function', () => {
      const result = ok(42);
      const chained = andThen(result, () => err<number, string>('chained error'));
      expect(isErr(chained) && chained.error).toBe('chained error');
    });
  });

  describe('match', () => {
    it('should execute ok handler for Ok', () => {
      const result = ok(42);
      const output = match(result, {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(output).toBe('value: 42');
    });

    it('should execute err handler for Err', () => {
      const result = err('failed');
      const output = match(result, {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(output).toBe('error: failed');
    });
  });

  describe('fromPromise', () => {
    it('should convert resolved promise to Ok', async () => {
      const result = await fromPromise(Promise.resolve(42));
      expect(isOk(result) && result.value).toBe(42);
    });

    it('should convert rejected promise to Err', async () => {
      const result = await fromPromise(Promise.reject(new Error('failed')));
      expect(isErr(result)).toBe(true);
    });

    it('should use custom error mapper', async () => {
      const result = await fromPromise(
        Promise.reject(new Error('failed')),
        (e) => `Mapped: ${(e as Error).message}`
      );
      expect(isErr(result) && result.error).toBe('Mapped: failed');
    });
  });

  describe('fromThrowable', () => {
    it('should convert non-throwing function to Ok', () => {
      const result = fromThrowable(() => 42);
      expect(isOk(result) && result.value).toBe(42);
    });

    it('should convert throwing function to Err', () => {
      const result = fromThrowable(() => {
        throw new Error('failed');
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('combine', () => {
    it('should combine multiple Ok results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combine(results);
      expect(isOk(combined) && combined.value).toEqual([1, 2, 3]);
    });

    it('should return first Err', () => {
      const results = [ok(1), err('second failed'), ok(3)];
      const combined = combine(results);
      expect(isErr(combined) && combined.error).toBe('second failed');
    });
  });
});

describe('ResultAsync', () => {
  describe('fromPromise', () => {
    it('should wrap resolved promise', async () => {
      const result = await ResultAsync.fromPromise(Promise.resolve(42));
      expect(isOk(result) && result.value).toBe(42);
    });

    it('should wrap rejected promise', async () => {
      const result = await ResultAsync.fromPromise(Promise.reject('error'));
      expect(isErr(result) && result.error).toBe('error');
    });
  });

  describe('ok and err', () => {
    it('should create Ok ResultAsync', async () => {
      const result = await ResultAsync.ok(42);
      expect(isOk(result) && result.value).toBe(42);
    });

    it('should create Err ResultAsync', async () => {
      const result = await ResultAsync.err('error');
      expect(isErr(result) && result.error).toBe('error');
    });
  });

  describe('map', () => {
    it('should transform async Ok', async () => {
      const result = await ResultAsync.ok(42).map((x) => x * 2);
      expect(isOk(result) && result.value).toBe(84);
    });
  });

  describe('mapErr', () => {
    it('should transform async Err', async () => {
      const result = await ResultAsync.err<number, string>('error').mapErr((e) => e.toUpperCase());
      expect(isErr(result) && result.error).toBe('ERROR');
    });
  });

  describe('andThen', () => {
    it('should chain async results', async () => {
      const result = await ResultAsync.ok(42)
        .andThen((x) => ResultAsync.ok(x * 2));
      expect(isOk(result) && result.value).toBe(84);
    });
  });

  describe('match', () => {
    it('should match async Ok', async () => {
      const output = await ResultAsync.ok(42).match({
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(output).toBe('value: 42');
    });
  });

  describe('unwrap', () => {
    it('should unwrap async Ok', async () => {
      const value = await ResultAsync.ok(42).unwrap();
      expect(value).toBe(42);
    });
  });

  describe('unwrapOr', () => {
    it('should return value for Ok', async () => {
      const value = await ResultAsync.ok(42).unwrapOr(0);
      expect(value).toBe(42);
    });

    it('should return default for Err', async () => {
      const value = await ResultAsync.err<number, string>('error').unwrapOr(0);
      expect(value).toBe(0);
    });
  });

  describe('isOk and isErr', () => {
    it('should check async Ok', async () => {
      const result = ResultAsync.ok(42);
      expect(await result.isOk()).toBe(true);
      expect(await result.isErr()).toBe(false);
    });

    it('should check async Err', async () => {
      const result = ResultAsync.err('error');
      expect(await result.isOk()).toBe(false);
      expect(await result.isErr()).toBe(true);
    });
  });
});
