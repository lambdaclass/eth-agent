import { describe, it, expect, beforeEach } from 'vitest';
import { SessionKeyManager, createSessionKey, createSessionKeyManager } from '../../src/protocol/session.js';
import { generatePrivateKey, privateKeyToAddress } from '../../src/core/signature.js';
import { ETH } from '../../src/core/units.js';
import type { Address, Hex } from '../../src/core/types.js';

describe('SessionKeyManager', () => {
  let manager: SessionKeyManager;
  let ownerKey: `0x${string}`;

  beforeEach(() => {
    ownerKey = generatePrivateKey();
    manager = new SessionKeyManager(ownerKey);
  });

  describe('createSession', () => {
    it('creates a session with permissions', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      expect(session.publicKey).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(session.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(session.permissions.validUntil).toBeGreaterThan(Date.now() / 1000);
      expect(session.permissions.maxValue).toBe(ETH(1));
      expect(session.owner).toBe(privateKeyToAddress(ownerKey));
      expect(session.nonce).toBe(0);
    });

    it('sets validAfter to 0 by default', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      expect(session.permissions.validAfter).toBe(0);
    });
  });

  describe('getSession', () => {
    it('returns session by address', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      const retrieved = manager.getSession(session.publicKey);
      expect(retrieved).toEqual(session);
    });

    it('returns undefined for unknown address', () => {
      const result = manager.getSession('0x1234567890123456789012345678901234567890');
      expect(result).toBeUndefined();
    });
  });

  describe('revokeSession', () => {
    it('removes a session', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      const revoked = manager.revokeSession(session.publicKey);
      expect(revoked).toBe(true);

      const retrieved = manager.getSession(session.publicKey);
      expect(retrieved).toBeUndefined();
    });

    it('returns false for unknown session', () => {
      const revoked = manager.revokeSession('0x1234567890123456789012345678901234567890');
      expect(revoked).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('returns active sessions', () => {
      const session1 = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });
      const session2 = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 7200,
      });

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions).toContainEqual(session1);
      expect(sessions).toContainEqual(session2);
    });

    it('excludes expired sessions', () => {
      manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) - 100, // Already expired
      });
      const validSession = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      const sessions = manager.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual(validSession);
    });
  });

  describe('validateAction', () => {
    it('validates within limits', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890',
        value: ETH(0.5),
      });

      expect(result.valid).toBe(true);
    });

    it('returns invalid for unknown session', () => {
      const result = manager.validateAction(
        '0x1234567890123456789012345678901234567890' as Address,
        { target: '0xabcd567890123456789012345678901234567890' as Address, value: 0n }
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session not found');
    });

    it('rejects session not yet valid', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const session = manager.createSession({
        validUntil: futureTime + 7200,
        validAfter: futureTime, // Not valid until 1 hour from now
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: 0n,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session not yet valid');
    });

    it('rejects function selector not in whitelist', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        allowedSelectors: ['0xa9059cbb' as Hex, '0x095ea7b3' as Hex], // transfer, approve
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: 0n,
        selector: '0x23b872dd' as Hex, // transferFrom - not allowed
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Function not allowed');
    });

    it('allows function selector in whitelist', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        allowedSelectors: ['0xa9059cbb' as Hex], // transfer
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: 0n,
        selector: '0xa9059cbb' as Hex,
      });

      expect(result.valid).toBe(true);
    });

    it('rejects value over limit', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890',
        value: ETH(2),
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Value exceeds limit');
    });

    it('rejects expired session', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) - 100,
      });

      const result = manager.validateAction(session.publicKey, {
        target: '0x1234567890123456789012345678901234567890',
        value: 0n,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session expired');
    });

    it('rejects blocked target', () => {
      const blockedTarget = '0xbad0000000000000000000000000000000000000';
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        blockedTargets: [blockedTarget],
      });

      const result = manager.validateAction(session.publicKey, {
        target: blockedTarget,
        value: 0n,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Target is blocked');
    });

    it('validates whitelisted target', () => {
      const allowedTarget = '0x1234567890123456789012345678901234567890';
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        allowedTargets: [allowedTarget],
      });

      const validResult = manager.validateAction(session.publicKey, {
        target: allowedTarget,
        value: 0n,
      });
      expect(validResult.valid).toBe(true);

      const invalidResult = manager.validateAction(session.publicKey, {
        target: '0xabcd567890123456789012345678901234567890',
        value: 0n,
      });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.reason).toBe('Target not in whitelist');
    });

    it('enforces transaction limit', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxTransactions: 2,
      });

      const testHash = '0x' + '11'.repeat(32) as `0x${string}`;
      const actionParams = {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: 0n,
      };

      // Sign twice to use up the transaction limit
      manager.signWithSession(session.publicKey, testHash, actionParams);
      manager.signWithSession(session.publicKey, testHash, actionParams);

      const result = manager.validateAction(session.publicKey, actionParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Transaction limit reached');
    });
  });

  describe('export/import', () => {
    it('exports and imports session', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      const exported = manager.exportSession(session.publicKey);

      // Create new manager and import
      const newOwnerKey = generatePrivateKey();
      const newManager = new SessionKeyManager(newOwnerKey);
      const imported = newManager.importSession(exported);

      expect(imported.publicKey).toBe(session.publicKey);
      expect(imported.privateKey).toBe(session.privateKey);
      expect(imported.permissions.maxValue).toBe(ETH(1));
    });

    it('throws when exporting unknown session', () => {
      expect(() =>
        manager.exportSession('0x1234567890123456789012345678901234567890' as Address)
      ).toThrow('Session not found');
    });

    it('imports session with maxTotalValue', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
        maxTotalValue: ETH(10),
      });

      const exported = manager.exportSession(session.publicKey);
      const newManager = new SessionKeyManager(generatePrivateKey());
      const imported = newManager.importSession(exported);

      expect(imported.permissions.maxTotalValue).toBe(ETH(10));
    });
  });

  describe('signWithSession', () => {
    it('signs hash with session key', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      const testHash = '0x' + '11'.repeat(32) as `0x${string}`;
      const signature = manager.signWithSession(session.publicKey, testHash, {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: ETH(0.5),
      });

      expect(signature.sessionKey).toBe(session.publicKey);
      expect(signature.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(signature.permissions).toEqual(session.permissions);
    });

    it('increments nonce after signing', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      expect(session.nonce).toBe(0);

      const testHash = '0x' + '11'.repeat(32) as `0x${string}`;
      manager.signWithSession(session.publicKey, testHash, {
        target: '0x1234567890123456789012345678901234567890' as Address,
        value: 0n,
      });

      // Fetch the session again to get the updated nonce
      const updatedSession = manager.getSession(session.publicKey);
      expect(updatedSession?.nonce).toBe(1);
    });

    it('throws for unknown session', () => {
      const testHash = '0x' + '11'.repeat(32) as `0x${string}`;

      expect(() =>
        manager.signWithSession(
          '0x1234567890123456789012345678901234567890' as Address,
          testHash,
          { target: '0xabcd567890123456789012345678901234567890' as Address, value: 0n }
        )
      ).toThrow('Session not found');
    });

    it('throws for invalid action', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        maxValue: ETH(1),
      });

      const testHash = '0x' + '11'.repeat(32) as `0x${string}`;

      expect(() =>
        manager.signWithSession(session.publicKey, testHash, {
          target: '0x1234567890123456789012345678901234567890' as Address,
          value: ETH(2), // Exceeds limit
        })
      ).toThrow('Invalid action: Value exceeds limit');
    });
  });

  describe('encodePermissions', () => {
    it('encodes permissions for on-chain verification', () => {
      const permissions = {
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        validAfter: Math.floor(Date.now() / 1000),
        maxValue: ETH(1),
        maxTotalValue: ETH(10),
        allowedTargets: ['0x1234567890123456789012345678901234567890' as Address],
        allowedSelectors: ['0xa9059cbb' as Hex],
        maxTransactions: 100,
        cooldownPeriod: 60,
      };

      const encoded = manager.encodePermissions(permissions);

      expect(encoded).toMatch(/^0x/);
      expect(encoded.length).toBeGreaterThan(2);
    });

    it('handles minimal permissions', () => {
      const permissions = {
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      };

      const encoded = manager.encodePermissions(permissions);

      expect(encoded).toMatch(/^0x/);
    });
  });

  describe('authorizeSession', () => {
    it('creates owner authorization signature', () => {
      const session = manager.createSession({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });

      const authorization = manager.authorizeSession(session.publicKey);

      expect(authorization).toMatch(/^0x/);
      // Should be 65 bytes (r: 32, s: 32, v: 1)
      expect(authorization.length).toBe(2 + 65 * 2);
    });

    it('throws for unknown session', () => {
      expect(() =>
        manager.authorizeSession('0x1234567890123456789012345678901234567890' as Address)
      ).toThrow('Session not found');
    });
  });
});

describe('createSessionKey', () => {
  it('creates a session key without manager', () => {
    const key = createSessionKey({
      validUntil: Math.floor(Date.now() / 1000) + 3600,
      maxValue: ETH(1),
    });

    expect(key.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(key.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(key.permissions.validUntil).toBeGreaterThan(Date.now() / 1000);
  });
});

describe('createSessionKeyManager', () => {
  it('creates a session key manager instance', () => {
    const ownerKey = generatePrivateKey();
    const manager = createSessionKeyManager(ownerKey);

    expect(manager).toBeInstanceOf(SessionKeyManager);

    // Test that it works
    const session = manager.createSession({
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(session.owner).toBe(privateKeyToAddress(ownerKey));
  });
});
