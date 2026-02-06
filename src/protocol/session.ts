/**
 * Session Keys
 * Delegated signing with limited permissions
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { generatePrivateKey, privateKeyToAddress, sign } from '../core/signature.js';
import { keccak256 } from '../core/hash.js';
import { encodeParameters } from '../core/abi.js';
import { SecureKey } from '../core/secure-key.js';

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
  /** @deprecated Access via SessionKeyManager methods instead */
  privateKey: Hex;
  permissions: SessionKeyPermissions;
  owner: Address;              // The account that created this session
  createdAt: number;
  nonce: number;               // Tracks usage
}

/**
 * Internal session key with secure key storage
 */
interface InternalSessionKey {
  publicKey: Address;
  secureKey: SecureKey;
  permissions: SessionKeyPermissions;
  owner: Address;
  createdAt: number;
  nonce: number;
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
  private readonly sessions: Map<Address, InternalSessionKey> = new Map();
  private readonly _ownerSecureKey: SecureKey;
  private readonly ownerAddress: Address;
  private _disposed = false;

  constructor(ownerKey: Hex) {
    this._ownerSecureKey = SecureKey.fromHex(ownerKey);
    this.ownerAddress = privateKeyToAddress(ownerKey);
  }

  /**
   * Check if the manager has been disposed
   */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Create a new session key
   */
  createSession(permissions: SessionKeyPermissions): SessionKey {
    this.assertNotDisposed();
    const privateKey = generatePrivateKey();
    const publicKey = privateKeyToAddress(privateKey);

    const internalSession: InternalSessionKey = {
      publicKey,
      secureKey: SecureKey.fromHex(privateKey),
      permissions: {
        ...permissions,
        validAfter: permissions.validAfter ?? 0,
      },
      owner: this.ownerAddress,
      createdAt: Math.floor(Date.now() / 1000),
      nonce: 0,
    };

    this.sessions.set(publicKey, internalSession);
    return this.toExternalSessionKey(internalSession);
  }

  /**
   * Convert internal session to external SessionKey interface
   */
  private toExternalSessionKey(internal: InternalSessionKey): SessionKey {
    return {
      publicKey: internal.publicKey,
      privateKey: internal.secureKey.exportHex(),
      permissions: internal.permissions,
      owner: internal.owner,
      createdAt: internal.createdAt,
      nonce: internal.nonce,
    };
  }

  /**
   * Get a session key by address
   */
  getSession(address: Address): SessionKey | undefined {
    this.assertNotDisposed();
    const internal = this.sessions.get(address);
    return internal ? this.toExternalSessionKey(internal) : undefined;
  }

  /**
   * Revoke a session key and securely dispose of its key material
   */
  revokeSession(address: Address): boolean {
    this.assertNotDisposed();
    const session = this.sessions.get(address);
    if (session) {
      session.secureKey.dispose();
      return this.sessions.delete(address);
    }
    return false;
  }

  /**
   * List all active sessions
   */
  listSessions(): SessionKey[] {
    this.assertNotDisposed();
    const now = Math.floor(Date.now() / 1000);
    return Array.from(this.sessions.values())
      .filter((s) => s.permissions.validUntil > now)
      .map((s) => this.toExternalSessionKey(s));
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
    this.assertNotDisposed();
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
      const targetLower = action.target.toLowerCase();
      if (!permissions.allowedTargets.some((t) => t.toLowerCase() === targetLower)) {
        return { valid: false, reason: 'Target not in whitelist' };
      }
    }

    // Check target blacklist
    if (permissions.blockedTargets && permissions.blockedTargets.length > 0) {
      const targetLower = action.target.toLowerCase();
      if (permissions.blockedTargets.some((t) => t.toLowerCase() === targetLower)) {
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
    this.assertNotDisposed();
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    const validation = this.validateAction(sessionAddress, action);
    if (!validation.valid) {
      throw new Error(`Invalid action: ${validation.reason}`);
    }

    // Sign with session key using scoped access
    const signature = session.secureKey.use((key) => sign(hash, key));

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
    this.assertNotDisposed();
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

    // Sign with owner key using scoped access
    const signature = this._ownerSecureKey.use((key) => sign(authHash, key));
    // Concatenate r, s, v for the signature
    return `${signature.r}${signature.s.slice(2)}${signature.v.toString(16).padStart(2, '0')}` as Hex;
  }

  /**
   * Export session for storage/transfer
   */
  exportSession(sessionAddress: Address): string {
    this.assertNotDisposed();
    const session = this.sessions.get(sessionAddress);
    if (!session) {
      throw new Error('Session not found');
    }

    return JSON.stringify({
      publicKey: session.publicKey,
      privateKey: session.secureKey.exportHex(),
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
    this.assertNotDisposed();
    const parsed = JSON.parse(data);

    const internalSession: InternalSessionKey = {
      publicKey: parsed.publicKey,
      secureKey: SecureKey.fromHex(parsed.privateKey),
      permissions: {
        ...parsed.permissions,
        maxValue: parsed.permissions.maxValue ? BigInt(parsed.permissions.maxValue) : undefined,
        maxTotalValue: parsed.permissions.maxTotalValue ? BigInt(parsed.permissions.maxTotalValue) : undefined,
      },
      owner: parsed.owner,
      createdAt: parsed.createdAt,
      nonce: parsed.nonce,
    };

    this.sessions.set(internalSession.publicKey, internalSession);
    return this.toExternalSessionKey(internalSession);
  }

  /**
   * Securely dispose of all session keys and the owner key.
   * After calling dispose(), any attempt to use the manager will throw an error.
   */
  dispose(): void {
    if (this._disposed) return;

    // Dispose all session keys
    for (const session of this.sessions.values()) {
      session.secureKey.dispose();
    }
    this.sessions.clear();

    // Dispose owner key
    this._ownerSecureKey.dispose();
    this._disposed = true;
  }

  /**
   * Assert that the manager has not been disposed
   */
  private assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('SessionKeyManager has been disposed and cannot be used');
    }
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
