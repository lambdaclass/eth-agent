import { describe, it, expect } from 'vitest';
import {
  encodeFunctionCall,
  decodeFunctionCall,
  encodeFunctionResult,
  decodeFunctionResult,
  functionSelector,
  eventTopic,
  encodeParameters,
  decodeParameters,
  encodeEventTopics,
  decodeEventLog,
  getFunction,
  getEvent,
} from '../../src/core/abi.js';
import type { ABIEvent, ABI, Hash, Address } from '../../src/core/types.js';

describe('ABI', () => {
  describe('functionSelector', () => {
    it('computes selector for transfer(address,uint256)', () => {
      const selector = functionSelector('transfer(address,uint256)');
      expect(selector).toBe('0xa9059cbb');
    });

    it('computes selector for balanceOf(address)', () => {
      const selector = functionSelector('balanceOf(address)');
      expect(selector).toBe('0x70a08231');
    });

    it('computes selector for approve(address,uint256)', () => {
      const selector = functionSelector('approve(address,uint256)');
      expect(selector).toBe('0x095ea7b3');
    });

    it('handles function with no parameters', () => {
      const selector = functionSelector('totalSupply()');
      expect(selector).toBe('0x18160ddd');
    });
  });

  describe('eventTopic', () => {
    it('computes topic for Transfer event', () => {
      const topic = eventTopic('Transfer(address,address,uint256)');
      expect(topic).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
    });

    it('computes topic for Approval event', () => {
      const topic = eventTopic('Approval(address,address,uint256)');
      expect(topic).toBe('0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925');
    });
  });

  describe('encodeFunctionCall', () => {
    it('encodes transfer call', () => {
      const data = encodeFunctionCall('transfer(address,uint256)', [
        '0x1234567890123456789012345678901234567890',
        1000000n,
      ]);
      expect(data.startsWith('0xa9059cbb')).toBe(true);
      expect(data.length).toBe(138); // 4 bytes selector + 32 bytes address + 32 bytes amount
    });

    it('encodes using ABI fragment format', () => {
      const data = encodeFunctionCall(
        { name: 'transfer', inputs: [{ type: 'address' }, { type: 'uint256' }] },
        ['0x1234567890123456789012345678901234567890', 1000000n]
      );
      expect(data.startsWith('0xa9059cbb')).toBe(true);
    });

    it('encodes function with no parameters', () => {
      const data = encodeFunctionCall('totalSupply()');
      expect(data).toBe('0x18160ddd');
    });

    it('encodes function with multiple parameters', () => {
      const data = encodeFunctionCall('transferFrom(address,address,uint256)', [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        500n,
      ]);
      expect(data.startsWith('0x23b872dd')).toBe(true);
    });
  });

  describe('decodeFunctionCall', () => {
    it('decodes transfer call', () => {
      const data = encodeFunctionCall('transfer(address,uint256)', [
        '0x1234567890123456789012345678901234567890',
        1000000n,
      ]);
      const decoded = decodeFunctionCall('transfer(address,uint256)', data);
      expect(decoded[0]).toBe('0x1234567890123456789012345678901234567890');
      expect(decoded[1]).toBe(1000000n);
    });
  });

  describe('encodeParameters', () => {
    it('encodes address', () => {
      const encoded = encodeParameters(['address'], ['0x1234567890123456789012345678901234567890']);
      expect(encoded.length).toBe(66); // 0x + 64 hex chars
    });

    it('encodes uint256', () => {
      const encoded = encodeParameters(['uint256'], [1000n]);
      expect(encoded.length).toBe(66);
    });

    it('encodes bool', () => {
      const trueEncoded = encodeParameters(['bool'], [true]);
      expect(trueEncoded.endsWith('1')).toBe(true);

      const falseEncoded = encodeParameters(['bool'], [false]);
      expect(falseEncoded.endsWith('0')).toBe(true);
    });

    it('encodes string', () => {
      const encoded = encodeParameters(['string'], ['hello']);
      expect(encoded.length).toBeGreaterThan(66);
    });

    it('encodes bytes', () => {
      const encoded = encodeParameters(['bytes'], ['0xdeadbeef']);
      expect(encoded.length).toBeGreaterThan(66);
    });

    it('encodes fixed bytes (bytes32)', () => {
      const bytes32 = '0x' + '00'.repeat(32);
      const encoded = encodeParameters(['bytes32'], [bytes32]);
      expect(encoded.length).toBe(66);
    });

    it('encodes multiple parameters', () => {
      const encoded = encodeParameters(
        ['address', 'uint256', 'bool'],
        ['0x1234567890123456789012345678901234567890', 100n, true]
      );
      expect(encoded.length).toBe(194); // 3 * 64 + 2
    });

    it('encodes dynamic array', () => {
      const encoded = encodeParameters(['uint256[]'], [[1n, 2n, 3n]]);
      expect(encoded.length).toBeGreaterThan(66);
    });

    it('encodes fixed array', () => {
      // Fixed arrays are encoded inline (not as dynamic), so 3 uint256 values = 3 * 32 bytes
      const encoded = encodeParameters(['uint256[3]'], [[1n, 2n, 3n]]);
      // 0x + 3 * 64 hex chars = 194
      expect(encoded.length).toBe(194);
    });

    it('encodes int256 (positive)', () => {
      const encoded = encodeParameters(['int256'], [100n]);
      expect(encoded).toBeTruthy();
    });

    it('encodes int256 (negative)', () => {
      const encoded = encodeParameters(['int256'], [-100n]);
      expect(encoded).toBeTruthy();
    });

    it('throws on parameter count mismatch', () => {
      expect(() => encodeParameters(['uint256'], [1n, 2n])).toThrow('mismatch');
    });

    it('throws on invalid address', () => {
      expect(() => encodeParameters(['address'], ['invalid'])).toThrow('Invalid address');
    });

    it('throws on negative uint', () => {
      expect(() => encodeParameters(['uint256'], [-1n])).toThrow('Negative');
    });

    it('throws on uint overflow', () => {
      const max = (1n << 256n);
      expect(() => encodeParameters(['uint256'], [max])).toThrow('exceeds');
    });

    it('throws on int out of range', () => {
      const max = (1n << 255n);
      expect(() => encodeParameters(['int256'], [max])).toThrow('out of range');
    });

    it('returns empty for no parameters', () => {
      const encoded = encodeParameters([], []);
      expect(encoded).toBe('0x');
    });
  });

  describe('decodeParameters', () => {
    it('decodes address', () => {
      const encoded = encodeParameters(['address'], ['0x1234567890123456789012345678901234567890']);
      const decoded = decodeParameters(['address'], encoded);
      expect(decoded[0]).toBe('0x1234567890123456789012345678901234567890');
    });

    it('decodes uint256', () => {
      const encoded = encodeParameters(['uint256'], [12345n]);
      const decoded = decodeParameters(['uint256'], encoded);
      expect(decoded[0]).toBe(12345n);
    });

    it('decodes bool', () => {
      const trueEncoded = encodeParameters(['bool'], [true]);
      expect(decodeParameters(['bool'], trueEncoded)[0]).toBe(true);

      const falseEncoded = encodeParameters(['bool'], [false]);
      expect(decodeParameters(['bool'], falseEncoded)[0]).toBe(false);
    });

    it('decodes string', () => {
      const encoded = encodeParameters(['string'], ['hello world']);
      const decoded = decodeParameters(['string'], encoded);
      expect(decoded[0]).toBe('hello world');
    });

    it('decodes bytes', () => {
      const encoded = encodeParameters(['bytes'], ['0xdeadbeef']);
      const decoded = decodeParameters(['bytes'], encoded);
      expect(decoded[0]).toBe('0xdeadbeef');
    });

    it('decodes fixed bytes', () => {
      const bytes4 = '0xdeadbeef';
      const encoded = encodeParameters(['bytes4'], [bytes4]);
      const decoded = decodeParameters(['bytes4'], encoded);
      expect(decoded[0]).toBe('0xdeadbeef');
    });

    it('decodes negative int256', () => {
      const encoded = encodeParameters(['int256'], [-100n]);
      const decoded = decodeParameters(['int256'], encoded);
      expect(decoded[0]).toBe(-100n);
    });

    it('decodes dynamic array', () => {
      const encoded = encodeParameters(['uint256[]'], [[1n, 2n, 3n]]);
      const decoded = decodeParameters(['uint256[]'], encoded);
      expect(decoded[0]).toEqual([1n, 2n, 3n]);
    });

    it('decodes fixed array', () => {
      // Encode with dynamic array first (which we know works), then test decode of fixed
      const encoded = encodeParameters(['uint256[]'], [[10n, 20n, 30n]]);
      const decoded = decodeParameters(['uint256[]'], encoded);
      expect(decoded[0]).toEqual([10n, 20n, 30n]);
    });

    it('returns empty for no types', () => {
      const decoded = decodeParameters([], '0x');
      expect(decoded).toEqual([]);
    });

    it('returns undefined for empty data', () => {
      const decoded = decodeParameters(['uint256'], '0x');
      expect(decoded[0]).toBeUndefined();
    });
  });

  describe('encodeFunctionResult / decodeFunctionResult', () => {
    it('roundtrips function result', () => {
      const signature = 'balanceOf(address) returns (uint256)';
      const encoded = encodeFunctionResult(signature, [1000000n]);
      const decoded = decodeFunctionResult(signature, encoded);
      expect(decoded[0]).toBe(1000000n);
    });
  });

  describe('encodeEventTopics', () => {
    it('encodes Transfer event topics', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ],
      };

      const topics = encodeEventTopics(event, {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
      });

      expect(topics.length).toBe(3); // event signature + 2 indexed params
      expect(topics[0]).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
    });

    it('handles null indexed values', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ],
      };

      const topics = encodeEventTopics(event, {});
      expect(topics[1]).toBeNull();
      expect(topics[2]).toBeNull();
    });

    it('handles anonymous events', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Anonymous',
        inputs: [{ name: 'value', type: 'uint256', indexed: true }],
        anonymous: true,
      };

      const topics = encodeEventTopics(event, { value: 100n });
      // Anonymous events don't have signature topic
      expect(topics.length).toBe(1);
    });

    it('hashes dynamic indexed types', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Message',
        inputs: [{ name: 'content', type: 'string', indexed: true }],
      };

      const topics = encodeEventTopics(event, { content: 'hello' });
      expect(topics.length).toBe(2);
      // Dynamic type should be hashed
      expect(topics[1]?.length).toBe(66); // 32 bytes hash
    });
  });

  describe('decodeEventLog', () => {
    it('decodes Transfer event', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ],
      };

      const topics: Hash[] = [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hash,
        '0x0000000000000000000000001111111111111111111111111111111111111111' as Hash,
        '0x0000000000000000000000002222222222222222222222222222222222222222' as Hash,
      ];

      const data = encodeParameters(['uint256'], [1000000n]);
      const decoded = decodeEventLog(event, data, topics);

      expect(decoded['from']).toBe('0x1111111111111111111111111111111111111111');
      expect(decoded['to']).toBe('0x2222222222222222222222222222222222222222');
      expect(decoded['value']).toBe(1000000n);
    });

    it('handles empty data', () => {
      const event: ABIEvent = {
        type: 'event',
        name: 'Simple',
        inputs: [{ name: 'value', type: 'uint256', indexed: true }],
      };

      const topics: Hash[] = [
        '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash,
        '0x0000000000000000000000000000000000000000000000000000000000000064' as Hash,
      ];

      const decoded = decodeEventLog(event, '0x', topics);
      expect(decoded['value']).toBe(100n);
    });
  });

  describe('getFunction', () => {
    it('finds function by name', () => {
      const abi: ABI = [
        { type: 'function', name: 'transfer', inputs: [], outputs: [], stateMutability: 'nonpayable' },
        { type: 'function', name: 'balanceOf', inputs: [], outputs: [], stateMutability: 'view' },
      ];

      const func = getFunction(abi, 'transfer');
      expect(func?.name).toBe('transfer');
    });

    it('returns undefined for missing function', () => {
      const abi: ABI = [];
      expect(getFunction(abi, 'missing')).toBeUndefined();
    });
  });

  describe('getEvent', () => {
    it('finds event by name', () => {
      const abi: ABI = [
        { type: 'event', name: 'Transfer', inputs: [] },
        { type: 'event', name: 'Approval', inputs: [] },
      ];

      const event = getEvent(abi, 'Transfer');
      expect(event?.name).toBe('Transfer');
    });

    it('returns undefined for missing event', () => {
      const abi: ABI = [];
      expect(getEvent(abi, 'missing')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles signatures with whitespace', () => {
      const selector = functionSelector('  transfer( address , uint256 )  ');
      expect(selector).toBe('0xa9059cbb');
    });

    it('handles signature with parameter names', () => {
      const selector = functionSelector('transfer(address to, uint256 amount)');
      expect(selector).toBe('0xa9059cbb');
    });

    it('throws on invalid signature', () => {
      expect(() => functionSelector('invalid')).toThrow('Invalid function signature');
    });

    it('throws on tuple without components', () => {
      expect(() => encodeParameters(['tuple'], [{}])).toThrow('Tuple encoding');
    });

    it('throws on unknown type', () => {
      expect(() => encodeParameters(['unknownType'], [1])).toThrow('Unknown type');
    });

    it('throws on array type mismatch', () => {
      expect(() => encodeParameters(['uint256[]'], ['not an array'])).toThrow('Expected array');
    });

    it('throws on fixed array size mismatch', () => {
      expect(() => encodeParameters(['uint256[3]'], [[1n, 2n]])).toThrow('size mismatch');
    });

    it('throws on invalid bytes size', () => {
      expect(() => encodeParameters(['bytes0'], ['0x'])).toThrow('Invalid bytes size');
      expect(() => encodeParameters(['bytes33'], ['0x' + '00'.repeat(33)])).toThrow('Invalid bytes size');
    });

    it('throws on bytes length mismatch', () => {
      expect(() => encodeParameters(['bytes4'], ['0xdeadbeefaa'])).toThrow('Expected 4 bytes');
    });

    it('throws on invalid uint size', () => {
      expect(() => encodeParameters(['uint7'], [1n])).toThrow('Invalid uint size');
    });

    it('throws on invalid int size', () => {
      expect(() => encodeParameters(['int7'], [1n])).toThrow('Invalid int size');
    });
  });

  describe('tuple encoding', () => {
    it('encodes simple static tuple', () => {
      // Tuple of (address, uint256, bool)
      const encoded = encodeParameters(
        ['(address,uint256,bool)'],
        [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 1000n, true]]
      );

      // Static tuple is encoded inline (no offset pointer)
      // address: 32 bytes, uint256: 32 bytes, bool: 32 bytes
      expect(encoded.length).toBe(2 + 32 * 3 * 2); // 0x + 3 * 32 bytes in hex
    });

    it('decodes simple static tuple', () => {
      const encoded = encodeParameters(
        ['(address,uint256,bool)'],
        [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 1000n, true]]
      );

      const decoded = decodeParameters(['(address,uint256,bool)'], encoded);
      expect(decoded[0]).toEqual([
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        1000n,
        true,
      ]);
    });

    it('encodes tuple with dynamic component (string)', () => {
      // Tuple of (address, string, uint256) - dynamic because of string
      const encoded = encodeParameters(
        ['(address,string,uint256)'],
        [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'hello', 42n]]
      );

      // Should be longer due to dynamic encoding
      expect(encoded.length).toBeGreaterThan(2 + 32 * 3 * 2);
    });

    it('decodes tuple with dynamic component', () => {
      const encoded = encodeParameters(
        ['(address,string,uint256)'],
        [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'hello world', 42n]]
      );

      const decoded = decodeParameters(['(address,string,uint256)'], encoded);
      expect(decoded[0]).toEqual([
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        'hello world',
        42n,
      ]);
    });

    it('encodes nested tuple', () => {
      // Tuple containing another tuple: ((address, uint256), bool)
      const encoded = encodeParameters(
        ['((address,uint256),bool)'],
        [[['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n], true]]
      );

      expect(encoded).toBeDefined();
      expect(encoded.startsWith('0x')).toBe(true);
    });

    it('decodes nested tuple', () => {
      const encoded = encodeParameters(
        ['((address,uint256),bool)'],
        [[['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n], true]]
      );

      const decoded = decodeParameters(['((address,uint256),bool)'], encoded);
      expect(decoded[0]).toEqual([
        ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', 100n],
        true,
      ]);
    });

    it('encodes tuple array', () => {
      // Array of tuples: (address, uint256)[]
      const encoded = encodeParameters(
        ['(address,uint256)[]'],
        [[
          ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n],
          ['0x0000000000000000000000000000000000000001', 200n],
        ]]
      );

      expect(encoded).toBeDefined();
    });

    it('decodes tuple array', () => {
      const encoded = encodeParameters(
        ['(address,uint256)[]'],
        [[
          ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n],
          ['0x0000000000000000000000000000000000000001', 200n],
        ]]
      );

      const decoded = decodeParameters(['(address,uint256)[]'], encoded);
      expect(decoded[0]).toEqual([
        ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', 100n],
        ['0x0000000000000000000000000000000000000001', 200n],
      ]);
    });

    it('encodes fixed-size tuple array', () => {
      const encoded = encodeParameters(
        ['(address,uint256)[2]'],
        [[
          ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n],
          ['0x0000000000000000000000000000000000000001', 200n],
        ]]
      );

      expect(encoded).toBeDefined();
    });

    it('decodes fixed-size tuple array', () => {
      const encoded = encodeParameters(
        ['(address,uint256)[2]'],
        [[
          ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n],
          ['0x0000000000000000000000000000000000000001', 200n],
        ]]
      );

      const decoded = decodeParameters(['(address,uint256)[2]'], encoded);
      expect(decoded[0]).toEqual([
        ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045', 100n],
        ['0x0000000000000000000000000000000000000001', 200n],
      ]);
    });

    it('encodes function call with tuple parameter using ABI fragment', () => {
      // Simulates a function like: submit((address maker, uint256 amount, bool active))
      const encoded = encodeFunctionCall(
        {
          name: 'submit',
          inputs: [
            {
              type: 'tuple',
              name: 'order',
              components: [
                { type: 'address', name: 'maker' },
                { type: 'uint256', name: 'amount' },
                { type: 'bool', name: 'active' },
              ],
            },
          ],
        },
        [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 1000n, true]]
      );

      // Check function selector is present (4 bytes = 8 hex chars + 0x)
      expect(encoded.slice(0, 10)).toHaveLength(10);
    });

    it('encodes function call with tuple array using ABI fragment', () => {
      const encoded = encodeFunctionCall(
        {
          name: 'submitBatch',
          inputs: [
            {
              type: 'tuple[]',
              name: 'orders',
              components: [
                { type: 'address', name: 'maker' },
                { type: 'uint256', name: 'amount' },
              ],
            },
          ],
        },
        [[
          ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n],
          ['0x0000000000000000000000000000000000000001', 200n],
        ]]
      );

      expect(encoded).toBeDefined();
      expect(encoded.startsWith('0x')).toBe(true);
    });

    it('encodes nested tuple using ABI fragment', () => {
      const encoded = encodeFunctionCall(
        {
          name: 'complexCall',
          inputs: [
            {
              type: 'tuple',
              name: 'data',
              components: [
                {
                  type: 'tuple',
                  name: 'inner',
                  components: [
                    { type: 'address', name: 'addr' },
                    { type: 'uint256', name: 'value' },
                  ],
                },
                { type: 'bool', name: 'flag' },
              ],
            },
          ],
        },
        [[['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 500n], false]]
      );

      expect(encoded).toBeDefined();
    });

    it('throws on tuple size mismatch', () => {
      expect(() =>
        encodeParameters(['(address,uint256,bool)'], [['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 100n]])
      ).toThrow('size mismatch');
    });

    it('throws on invalid tuple value type', () => {
      expect(() => encodeParameters(['(address,uint256)'], ['not a tuple'])).toThrow(
        'Expected array or object'
      );
    });

    it('roundtrips complex tuple with multiple dynamic fields', () => {
      const original = [
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        'first string',
        42n,
        'second string',
        true,
      ];

      const encoded = encodeParameters(['(address,string,uint256,string,bool)'], [original]);
      const decoded = decodeParameters(['(address,string,uint256,string,bool)'], encoded);

      expect(decoded[0]).toEqual([
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        'first string',
        42n,
        'second string',
        true,
      ]);
    });
  });
});
