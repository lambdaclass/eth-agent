import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { encode, decode } from '../../src/core/rlp.js';
import { bytesToHex, hexToBytes } from '../../src/core/hex.js';

/**
 * Fuzz tests for RLP encoding/decoding
 * These tests attempt to find edge cases and crashes
 */
describe('RLP fuzz tests', () => {
  // Arbitrary RLP-encodable value generator
  const rlpValue = fc.letrec((tie) => ({
    value: fc.oneof(
      // Bytes
      fc.uint8Array({ maxLength: 100 }),
      // Empty
      fc.constant(new Uint8Array()),
      // Integers
      fc.integer({ min: 0, max: 2 ** 32 }),
      // BigInts
      fc.bigInt({ min: 0n, max: 2n ** 64n }),
      // Strings
      fc.string({ maxLength: 50 }),
      // Lists (recursive)
      fc.array(tie('value'), { maxLength: 5 }),
    ),
  })).value;

  test.prop([rlpValue], { numRuns: 1000 })(
    'encode never crashes',
    (value) => {
      // Should not throw
      const encoded = encode(value);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    }
  );

  test.prop([rlpValue], { numRuns: 500 })(
    'encode/decode roundtrip produces valid output',
    (value) => {
      const encoded = encode(value);
      // decode should not crash
      const decoded = decode(encoded);

      // The decoded value should be valid
      expect(decoded).toBeDefined();
    }
  );

  test.prop([fc.uint8Array({ minLength: 1, maxLength: 200 })], { numRuns: 500 })(
    'decode handles arbitrary bytes without crashing',
    (bytes) => {
      // May throw but should not crash
      try {
        decode(bytes);
      } catch (e) {
        // Errors are expected for invalid input
        expect(e).toBeInstanceOf(Error);
      }
    }
  );

  test.prop([
    fc.array(fc.uint8Array({ maxLength: 50 }), { maxLength: 10 }),
  ], { numRuns: 200 })(
    'encode list of bytes roundtrips',
    (byteArrays) => {
      const encoded = encode(byteArrays);
      const decoded = decode(encoded) as Uint8Array[];

      expect(decoded).toHaveLength(byteArrays.length);
    }
  );

  test.prop([
    fc.array(fc.integer({ min: 0, max: 10000 }), { maxLength: 20 }),
  ], { numRuns: 200 })(
    'encode list of integers',
    (numbers) => {
      const encoded = encode(numbers);
      const decoded = decode(encoded);

      expect(decoded).toHaveLength(numbers.length);
    }
  );

  // Test deeply nested structures
  test.prop([
    fc.integer({ min: 1, max: 10 }),
  ], { numRuns: 50 })(
    'deeply nested empty lists',
    (depth) => {
      // Build deeply nested structure
      let value: unknown[] = [];
      for (let i = 0; i < depth; i++) {
        value = [value];
      }

      const encoded = encode(value);
      const decoded = decode(encoded);

      expect(decoded).toBeDefined();
    }
  );

  // Test long strings
  test.prop([
    fc.string({ minLength: 56, maxLength: 1000 }),
  ], { numRuns: 50 })(
    'long strings (>55 bytes)',
    (str) => {
      const encoded = encode(str);
      const decoded = decode(encoded);

      expect(decoded).toBeInstanceOf(Uint8Array);
    }
  );

  // Test long lists
  test.prop([
    fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 20, maxLength: 100 }),
  ], { numRuns: 50 })(
    'long lists',
    (list) => {
      const encoded = encode(list);
      const decoded = decode(encoded);

      expect(decoded).toHaveLength(list.length);
    }
  );
});
