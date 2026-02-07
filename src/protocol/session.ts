/**
 * Session Keys
 * Delegated signing with limited permissions
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { generatePrivateKey, privateKeyToAddress, sign } from '../core/signature.js';
import { keccak256 } from '../core/hash.js';
import { encodeParameters } from '../core/abi.js';
import { addressEquals } from '../core/address.js';

export interface SessionKeyPermissions {
  // Time constraints
  validUntil: number;          // Unix timestamp
  validAfter?: number;         // Unix timestamp (default: 0)

  // Value constraints
  maxValue?: bigint;           // Max ETH per transaction
  maxTotalValue?: bigint;      // Max total ETH

  // Target constraints
  allowedTargets?: Address[];  // Whitelist of allowed addresses
  blockedTargets?: Address[];  // Blacklist of addresses

  // Function constraints
  allowedSelectors?: Hex[];    // Whitelist of function selectors

  // Rate limiting
  maxTransactions?: number;    // Max number of transactions
  cooldownPeriod?: number;     // Seconds between transactions
}

export interface SessionKey {
  publicKey: Address;
  privateKey: Hex;
  permissions: SessionKeyPermissions;
  owner: Address;              // The account that created this session
  createdAt: number;
  nonce: number;               // Tracks usage
}

export interface SessionKeySignature {
  sessionKey: Address;
  signature: Hex;
  permissions: SessionKeyPermissions;
}

/**
 * Session Key Manager
 * Creates and manages session keys for delegated signing
 */
export class SessionKeyManager {
  private readonly sessions: Map<Address, SessionKey> = new Map();
  private readonly ownerKey: Hex;
  private readonly ownerAddress: Address;

  constructor(ownerKey: Hex) {
    this.ownerKey = ownerKey;
    this.ownerAddress = privateKeyToAddress(ownerKey);
  }

  /**
   * Create a new session key
   */
  createSession(permissions: SessionKeyPermissions): SessionKey {
    const privateKey = generatePrivateKey();
    const publicKey = privateKeyToAddress(privateKey);

    const session: SessionKey = {
      publicKey,
      privateKey,
      permissions: {
        ...permissions,
        validAfter: permissions.validAfter ?? 0,
      },
      owner: this.ownerAddress,
      createdAt: Math.floor(Date.now() / 1000),
      nonce: 0,
    };

    this.sessions.set(publicKey, session);
    return session;
  }

  /**
   * Get a session key by address
   */
  getSession(address: Address): SessionKey | undefined {
    return this.sessions.get(address);
  }

  /**
   * Revoke a session key
   */
  revokeSession(address: Address): boolean {
    return this.sessions.delete(address);
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionKey[] {
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.sessions.values()).filter(
      (s) => s.permissions.validUntil > now
    );
  }

  /**
   * Check if a session key can perform an action
   */
  validateAction(
    sessionAddress: Address,
    action: {
      target: Address;
      value: bigint;
      selector?: Hex;
    }
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    const now = Math.floor(Date.now() / 1000);
    const { permissions } = session;

    // Check time validity
    if (now < (permissions.validAfter ?? 0)) {
      return { valid: false, reason: 'Session not yet valid' };
    }
    if (now > permissions.validUntil) {
      return { valid: false, reason: 'Session expired' };
    }

    // Check value limit
    if (permissions.maxValue && action.value > permissions.maxValue) {
      return { valid: false, reason: 'Value exceeds limit' };
    }

    // Check target whitelist
    if (permissions.allowedTargets && permissions.allowedTargets.length > 0) {
      if (!permissions.allowedTargets.some((t) => addressEquals(t, action.target))) {
        return { valid: false, reason: 'Target not in whitelist' };
      }
    }

    // Check target blacklist
    if (permissions.blockedTargets && permissions.blockedTargets.length > 0) {
      if (permissions.blockedTargets.some((t) => addressEquals(t, action.target))) {
        return { valid: false, reason: 'Target is blocked' };
      }
    }

    // Check function selector whitelist
    if (permissions.allowedSelectors && action.selector) {
      if (!permissions.allowedSelectors.includes(action.selector)) {
        return { valid: false, reason: 'Function not allowed' };
      }
    }

    // Check transaction count
    if (permissions.maxTransactions && session.nonce >= permissions.maxTransactions) {
      return { valid: false, reason: 'Transaction limit reached' };
    }

    return { valid: true };
  }

  /**
   * Sign with a session key
   */
  signWithSession(
    sessionAddress: Address,
    hash: Hash,
    action: {
      target: Address;
      value: bigint;
      selector?: Hex;
    }
  ): SessionKeySignature {
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    const validation = this.validateAction(sessionAddress, action);
    if (!validation.valid) {
      throw new Error(`Invalid action: ${validation.reason}`);
    }

    // Sign with session key
    const signature = sign(hash, session.privateKey);

    // Increment nonce
    session.nonce++;

    // Concatenate r, s, v for the signature
    const sigHex = `${signature.r}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, '0')}` as Hex;

    return {
      sessionKey: sessionAddress,
      signature: sigHex,
      permissions: session.permissions,
    };
  }

  /**
   * Encode session key permissions for on-chain verification
   */
  encodePermissions(permissions: SessionKeyPermissions): Hex {
    return encodeParameters(
      [
        'uint48',   // validUntil
        'uint48',   // validAfter
        'uint256',  // maxValue
        'uint256',  // maxTotalValue
        'address[]', // allowedTargets
        'bytes4[]', // allowedSelectors
        'uint32',   // maxTransactions
        'uint32',   // cooldownPeriod
      ],
      [
        BigInt(permissions.validUntil),
        BigInt(permissions.validAfter ?? 0),
        permissions.maxValue ?? 0n,
        permissions.maxTotalValue ?? 0n,
        permissions.allowedTargets ?? [],
        permissions.allowedSelectors ?? [],
        BigInt(permissions.maxTransactions ?? 0),
        BigInt(permissions.cooldownPeriod ?? 0),
      ]
    );
  }

  /**
   * Create owner authorization for a session key
   * This signature proves the owner authorized this session
   */
  authorizeSession(sessionAddress: Address): Hex {
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    // Create authorization hash
    const permissionsHash = keccak256(this.encodePermissions(session.permissions));
    const authHash = keccak256(
      encodeParameters(
        ['address', 'address', 'bytes32'],
        [session.owner, sessionAddress, permissionsHash]
      )
    );

    // Sign with owner key
    const signature = sign(authHash, this.ownerKey);
    // Concatenate r, s, v for the signature
    return `${signature.r}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, '0')}` as Hex;
  }

  /**
   * Export session for storage/transfer
   */
  exportSession(sessionAddress: Address): string {
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    return JSON.stringify({
      publicKey: session.publicKey,
      privateKey: session.privateKey,
      permissions: {
        ...session.permissions,
        maxValue: session.permissions.maxValue?.toString(),
        maxTotalValue: session.permissions.maxTotalValue?.toString(),
      },
      owner: session.owner,
      createdAt: session.createdAt,
      nonce: session.nonce,
    });
  }

  /**
   * Import session from storage
   */
  importSession(data: string): SessionKey {
    const parsed = JSON.parse(data);

    const session: SessionKey = {
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
      permissions: {
        ...parsed.permissions,
        maxValue: parsed.permissions.maxValue ? BigInt(parsed.permissions.maxValue) : undefined,
        maxTotalValue: parsed.permissions.maxTotalValue ? BigInt(parsed.permissions.maxTotalValue) : undefined,
      },
      owner: parsed.owner,
      createdAt: parsed.createdAt,
      nonce: parsed.nonce,
    };

    this.sessions.set(session.publicKey, session);
    return session;
  }
}

/**
 * Create a session key manager
 */
export function createSessionKeyManager(ownerKey: Hex): SessionKeyManager {
  return new SessionKeyManager(ownerKey);
}

/**
 * Create a simple session key (without manager)
 */
export function createSessionKey(permissions: SessionKeyPermissions): {
  privateKey: Hex;
  address: Address;
  permissions: SessionKeyPermissions;
} {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAddress(privateKey);

  return {
    privateKey,
    address,
    permissions,
  };
}
