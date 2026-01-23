import { describe, it, expect } from 'vitest';
import {
  decodeMessageHeader,
  decodeBurnMessageBody,
  MESSAGE_TRANSMITTER_ABI,
} from '../../../src/bridge/cctp/message-transmitter.js';
import type { Hex } from '../../../src/core/types.js';

describe('MessageTransmitter', () => {
  describe('MESSAGE_TRANSMITTER_ABI', () => {
    it('should have receiveMessage function', () => {
      const receiveMessage = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'function' && item.name === 'receiveMessage'
      );
      expect(receiveMessage).toBeDefined();
      expect(receiveMessage?.inputs).toHaveLength(2);
    });

    it('should have usedNonces function', () => {
      const usedNonces = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'function' && item.name === 'usedNonces'
      );
      expect(usedNonces).toBeDefined();
    });

    it('should have localDomain function', () => {
      const localDomain = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'function' && item.name === 'localDomain'
      );
      expect(localDomain).toBeDefined();
    });

    it('should have MessageReceived event', () => {
      const event = MESSAGE_TRANSMITTER_ABI.find(
        (item) => item.type === 'event' && item.name === 'MessageReceived'
      );
      expect(event).toBeDefined();
    });
  });

  describe('decodeMessageHeader', () => {
    it('should decode a valid message header', () => {
      // Create a sample message bytes (header only)
      // version(4) + sourceDomain(4) + destDomain(4) + nonce(8) + sender(32) + recipient(32) + destCaller(32)
      // Total: 116 bytes = 232 hex chars
      const version = '00000000'; // version 0
      const sourceDomain = '00000000'; // domain 0 (Ethereum)
      const destDomain = '00000003'; // domain 3 (Arbitrum)
      const nonce = '0000000000000001'; // nonce 1
      const sender = '0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      const recipient = '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';
      const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';

      const messageBytes: Hex = `0x${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}`;

      const result = decodeMessageHeader(messageBytes);

      expect(result.version).toBe(0);
      expect(result.sourceDomain).toBe(0);
      expect(result.destinationDomain).toBe(3);
      expect(result.nonce).toBe(1n);
      expect(result.sender).toBe(`0x${sender}`);
      expect(result.recipient).toBe(`0x${recipient}`);
    });

    it('should decode nonce correctly for large values', () => {
      const version = '00000000';
      const sourceDomain = '00000001'; // domain 1
      const destDomain = '00000002'; // domain 2
      const nonce = '00000001ffffffff'; // large nonce
      const sender = '0000000000000000000000001111111111111111111111111111111111111111';
      const recipient = '0000000000000000000000002222222222222222222222222222222222222222';
      const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';

      const messageBytes: Hex = `0x${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}`;

      const result = decodeMessageHeader(messageBytes);

      expect(result.nonce).toBe(0x1ffffffffn);
      expect(result.sourceDomain).toBe(1);
      expect(result.destinationDomain).toBe(2);
    });
  });

  describe('decodeBurnMessageBody', () => {
    it('should decode a valid burn message', () => {
      // Full message: header (116 bytes) + body
      // Header
      const version = '00000000';
      const sourceDomain = '00000000';
      const destDomain = '00000003';
      const nonce = '0000000000000001';
      const sender = '0000000000000000000000001234567890abcdef1234567890abcdef12345678';
      const recipient = '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';
      const destCaller = '0000000000000000000000000000000000000000000000000000000000000000';

      // Body: version(4) + burnToken(32) + mintRecipient(32) + amount(32) + messageSender(32)
      const bodyVersion = '00000000';
      const burnToken = '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC address
      const mintRecipient = '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const amount = '0000000000000000000000000000000000000000000000000000000005f5e100'; // 100 USDC (100000000)
      const messageSender = '000000000000000000000000cafebabecafebabecafebabecafebabecafebabe';

      const messageBytes: Hex = `0x${version}${sourceDomain}${destDomain}${nonce}${sender}${recipient}${destCaller}${bodyVersion}${burnToken}${mintRecipient}${amount}${messageSender}`;

      const result = decodeBurnMessageBody(messageBytes);

      expect(result.burnToken.toLowerCase()).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      expect(result.mintRecipient.toLowerCase()).toBe('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(result.amount).toBe(100000000n);
      expect(result.messageSender.toLowerCase()).toBe('0xcafebabecafebabecafebabecafebabecafebabe');
    });

    it('should handle large amounts', () => {
      // Full message with large amount
      const header = '00000000' + '00000000' + '00000003' + '0000000000000001' +
        '0000000000000000000000001234567890abcdef1234567890abcdef12345678' +
        '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12' +
        '0000000000000000000000000000000000000000000000000000000000000000';

      const body = '00000000' +
        '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
        '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' +
        '00000000000000000000000000000000000000000000d3c21bcecceda1000000' + // 1 trillion USDC
        '000000000000000000000000cafebabecafebabecafebabecafebabecafebabe';

      const messageBytes: Hex = `0x${header}${body}`;

      const result = decodeBurnMessageBody(messageBytes);

      expect(result.amount).toBe(1000000000000000000000000n);
    });
  });
});
