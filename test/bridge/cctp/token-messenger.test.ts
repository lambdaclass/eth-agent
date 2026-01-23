import { describe, it, expect } from 'vitest';
import {
  TOKEN_MESSENGER_ABI,
  MESSAGE_SENT_ABI,
} from '../../../src/bridge/cctp/token-messenger.js';

describe('TokenMessenger', () => {
  describe('TOKEN_MESSENGER_ABI', () => {
    it('should have depositForBurn function', () => {
      const depositForBurn = TOKEN_MESSENGER_ABI.find(
        (item) => item.type === 'function' && item.name === 'depositForBurn'
      );
      expect(depositForBurn).toBeDefined();
      expect(depositForBurn?.inputs).toHaveLength(4);
      expect(depositForBurn?.inputs?.[0]?.name).toBe('amount');
      expect(depositForBurn?.inputs?.[1]?.name).toBe('destinationDomain');
      expect(depositForBurn?.inputs?.[2]?.name).toBe('mintRecipient');
      expect(depositForBurn?.inputs?.[3]?.name).toBe('burnToken');
    });

    it('should have localMessageTransmitter function', () => {
      const localMessageTransmitter = TOKEN_MESSENGER_ABI.find(
        (item) => item.type === 'function' && item.name === 'localMessageTransmitter'
      );
      expect(localMessageTransmitter).toBeDefined();
      expect(localMessageTransmitter?.stateMutability).toBe('view');
    });

    it('should have DepositForBurn event', () => {
      const event = TOKEN_MESSENGER_ABI.find(
        (item) => item.type === 'event' && item.name === 'DepositForBurn'
      );
      expect(event).toBeDefined();
      expect(event?.inputs).toHaveLength(8);

      // Check indexed inputs
      const nonceInput = event?.inputs?.find((i) => i.name === 'nonce');
      expect(nonceInput?.indexed).toBe(true);

      const burnTokenInput = event?.inputs?.find((i) => i.name === 'burnToken');
      expect(burnTokenInput?.indexed).toBe(true);

      const depositorInput = event?.inputs?.find((i) => i.name === 'depositor');
      expect(depositorInput?.indexed).toBe(true);
    });
  });

  describe('MESSAGE_SENT_ABI', () => {
    it('should have MessageSent event', () => {
      const event = MESSAGE_SENT_ABI.find(
        (item) => item.type === 'event' && item.name === 'MessageSent'
      );
      expect(event).toBeDefined();
      expect(event?.inputs).toHaveLength(1);
      expect(event?.inputs?.[0]?.name).toBe('message');
      expect(event?.inputs?.[0]?.type).toBe('bytes');
    });
  });
});
