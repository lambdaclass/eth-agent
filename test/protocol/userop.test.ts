import { describe, it, expect } from 'vitest';
import {
  createUserOp,
  packUserOp,
  getUserOpHash,
  encodeUserOp,
  decodeUserOp,
  ENTRY_POINT_V07,
  ENTRY_POINT_V06,
} from '../../src/protocol/userop.js';
import type { Address, Hex } from '../../src/core/types.js';

describe('UserOperation', () => {
  const testSender = '0x1234567890123456789012345678901234567890' as Address;

  describe('createUserOp', () => {
    it('creates UserOp with defaults', () => {
      const op = createUserOp({ sender: testSender });

      expect(op.sender).toBe(testSender);
      expect(op.nonce).toBe(0n);
      expect(op.initCode).toBe('0x');
      expect(op.callData).toBe('0x');
      expect(op.callGasLimit).toBe(0n);
      expect(op.verificationGasLimit).toBe(0n);
      expect(op.preVerificationGas).toBe(0n);
      expect(op.maxFeePerGas).toBe(0n);
      expect(op.maxPriorityFeePerGas).toBe(0n);
      expect(op.paymasterAndData).toBe('0x');
      expect(op.signature).toBe('0x');
    });

    it('creates UserOp with custom values', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 5n,
        initCode: '0xabcdef' as Hex,
        callData: '0x123456' as Hex,
        callGasLimit: 100000n,
        verificationGasLimit: 50000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
        paymasterAndData: '0xpaymaster' as Hex,
        signature: '0xsig' as Hex,
      });

      expect(op.sender).toBe(testSender);
      expect(op.nonce).toBe(5n);
      expect(op.initCode).toBe('0xabcdef');
      expect(op.callData).toBe('0x123456');
      expect(op.callGasLimit).toBe(100000n);
      expect(op.verificationGasLimit).toBe(50000n);
      expect(op.preVerificationGas).toBe(21000n);
      expect(op.maxFeePerGas).toBe(30000000000n);
      expect(op.maxPriorityFeePerGas).toBe(2000000000n);
      expect(op.paymasterAndData).toBe('0xpaymaster');
      expect(op.signature).toBe('0xsig');
    });
  });

  describe('packUserOp', () => {
    it('packs UserOp for v0.7 EntryPoint', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 1n,
        callGasLimit: 100000n,
        verificationGasLimit: 50000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
      });

      const packed = packUserOp(op);

      expect(packed.sender).toBe(testSender);
      expect(packed.nonce).toBe(1n);
      expect(packed.initCode).toBe('0x');
      expect(packed.callData).toBe('0x');
      expect(packed.preVerificationGas).toBe(21000n);
      expect(packed.paymasterAndData).toBe('0x');
      expect(packed.signature).toBe('0x');

      // accountGasLimits should be 32 bytes (verificationGasLimit || callGasLimit)
      expect(packed.accountGasLimits.length).toBe(66); // 0x + 64 hex chars

      // gasFees should be 32 bytes (maxPriorityFeePerGas || maxFeePerGas)
      expect(packed.gasFees.length).toBe(66);
    });

    it('preserves values in packed format', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 100n,
        initCode: '0xabc' as Hex,
        callData: '0xdef' as Hex,
      });

      const packed = packUserOp(op);

      expect(packed.sender).toBe(op.sender);
      expect(packed.nonce).toBe(op.nonce);
      expect(packed.initCode).toBe(op.initCode);
      expect(packed.callData).toBe(op.callData);
    });
  });

  describe('getUserOpHash', () => {
    it('computes hash for UserOp', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 0n,
        callData: '0x' as Hex,
        callGasLimit: 100000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1500000000n,
      });

      const hash = getUserOpHash(op, ENTRY_POINT_V07, 1);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('produces different hash for different sender', () => {
      const op1 = createUserOp({
        sender: testSender,
        nonce: 0n,
      });
      const op2 = createUserOp({
        sender: '0x0000000000000000000000000000000000000001' as Address,
        nonce: 0n,
      });

      const hash1 = getUserOpHash(op1, ENTRY_POINT_V07, 1);
      const hash2 = getUserOpHash(op2, ENTRY_POINT_V07, 1);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different nonce', () => {
      const op1 = createUserOp({ sender: testSender, nonce: 0n });
      const op2 = createUserOp({ sender: testSender, nonce: 1n });

      const hash1 = getUserOpHash(op1, ENTRY_POINT_V07, 1);
      const hash2 = getUserOpHash(op2, ENTRY_POINT_V07, 1);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different chainId', () => {
      const op = createUserOp({ sender: testSender });

      const hash1 = getUserOpHash(op, ENTRY_POINT_V07, 1);
      const hash2 = getUserOpHash(op, ENTRY_POINT_V07, 5);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different entryPoint', () => {
      const op = createUserOp({ sender: testSender });

      const hash1 = getUserOpHash(op, ENTRY_POINT_V07, 1);
      const hash2 = getUserOpHash(op, ENTRY_POINT_V06, 1);

      expect(hash1).not.toBe(hash2);
    });

    it('produces consistent hash', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 5n,
        callData: '0x12345678' as Hex,
      });

      const hash1 = getUserOpHash(op, ENTRY_POINT_V07, 1);
      const hash2 = getUserOpHash(op, ENTRY_POINT_V07, 1);

      expect(hash1).toBe(hash2);
    });
  });

  describe('encodeUserOp', () => {
    it('encodes UserOp for RPC', () => {
      const op = createUserOp({
        sender: testSender,
        nonce: 5n,
        initCode: '0xabc' as Hex,
        callData: '0xdef' as Hex,
        callGasLimit: 100000n,
        verificationGasLimit: 50000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
        paymasterAndData: '0x' as Hex,
        signature: '0xsig' as Hex,
      });

      const encoded = encodeUserOp(op);

      expect(encoded.sender).toBe(testSender);
      expect(encoded.nonce).toBe('0x5');
      expect(encoded.initCode).toBe('0xabc');
      expect(encoded.callData).toBe('0xdef');
      expect(encoded.callGasLimit).toBe('0x186a0');
      expect(encoded.verificationGasLimit).toBe('0xc350');
      expect(encoded.preVerificationGas).toBe('0x5208');
      expect(encoded.maxFeePerGas).toBe('0x6fc23ac00');
      expect(encoded.maxPriorityFeePerGas).toBe('0x77359400');
      expect(encoded.paymasterAndData).toBe('0x');
      expect(encoded.signature).toBe('0xsig');
    });

    it('handles zero values', () => {
      const op = createUserOp({ sender: testSender });
      const encoded = encodeUserOp(op);

      expect(encoded.nonce).toBe('0x0');
      expect(encoded.callGasLimit).toBe('0x0');
    });
  });

  describe('decodeUserOp', () => {
    it('decodes UserOp from RPC response', () => {
      const data = {
        sender: testSender,
        nonce: '0x5',
        initCode: '0xabc',
        callData: '0xdef',
        callGasLimit: '0x186a0',
        verificationGasLimit: '0xc350',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x6fc23ac00',
        maxPriorityFeePerGas: '0x77359400',
        paymasterAndData: '0x',
        signature: '0xsig',
      };

      const op = decodeUserOp(data);

      expect(op.sender).toBe(testSender);
      expect(op.nonce).toBe(5n);
      expect(op.initCode).toBe('0xabc');
      expect(op.callData).toBe('0xdef');
      expect(op.callGasLimit).toBe(100000n);
      expect(op.verificationGasLimit).toBe(50000n);
      expect(op.preVerificationGas).toBe(21000n);
      expect(op.maxFeePerGas).toBe(30000000000n);
      expect(op.maxPriorityFeePerGas).toBe(2000000000n);
      expect(op.paymasterAndData).toBe('0x');
      expect(op.signature).toBe('0xsig');
    });

    it('handles missing fields with defaults', () => {
      const data = {
        sender: testSender,
      };

      const op = decodeUserOp(data);

      expect(op.sender).toBe(testSender);
      expect(op.nonce).toBe(0n);
      expect(op.initCode).toBe('0x');
      expect(op.callData).toBe('0x');
    });

    it('roundtrips encode/decode', () => {
      const original = createUserOp({
        sender: testSender,
        nonce: 42n,
        initCode: '0x123' as Hex,
        callData: '0x456' as Hex,
        callGasLimit: 200000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 50000n,
        maxFeePerGas: 50000000000n,
        maxPriorityFeePerGas: 3000000000n,
        paymasterAndData: '0x789' as Hex,
        signature: '0xabc' as Hex,
      });

      const encoded = encodeUserOp(original);
      const decoded = decodeUserOp(encoded);

      expect(decoded.sender).toBe(original.sender);
      expect(decoded.nonce).toBe(original.nonce);
      expect(decoded.initCode).toBe(original.initCode);
      expect(decoded.callData).toBe(original.callData);
      expect(decoded.callGasLimit).toBe(original.callGasLimit);
      expect(decoded.verificationGasLimit).toBe(original.verificationGasLimit);
      expect(decoded.preVerificationGas).toBe(original.preVerificationGas);
      expect(decoded.maxFeePerGas).toBe(original.maxFeePerGas);
      expect(decoded.maxPriorityFeePerGas).toBe(original.maxPriorityFeePerGas);
      expect(decoded.paymasterAndData).toBe(original.paymasterAndData);
      expect(decoded.signature).toBe(original.signature);
    });
  });

  describe('constants', () => {
    it('exports correct EntryPoint v0.7 address', () => {
      expect(ENTRY_POINT_V07).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032');
    });

    it('exports correct EntryPoint v0.6 address', () => {
      expect(ENTRY_POINT_V06).toBe('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
    });
  });
});
