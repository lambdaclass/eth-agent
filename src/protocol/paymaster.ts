/**
 * ERC-4337 Paymaster
 * Gas sponsorship for UserOperations
 */

import type { Address, Hash, Hex } from '../core/types.js';
import type { UserOperation } from './userop.js';
import { encodeUserOp } from './userop.js';
import { concatHex, padHex, numberToHex } from '../core/hex.js';
import { keccak256 } from '../core/hash.js';
import { sign } from '../core/signature.js';
import { encodeParameters } from '../core/abi.js';

export interface PaymasterConfig {
  address: Address;
  url?: string;           // Paymaster service URL
  apiKey?: string;        // API key for paymaster service
}

export interface PaymasterResult {
  paymasterAndData: Hex;
  preVerificationGas?: bigint;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
}

export interface PaymasterStub {
  paymasterAndData: Hex;
}

/**
 * Paymaster interface
 */
export interface Paymaster {
  /**
   * Get paymaster data for a UserOperation
   */
  getPaymasterData(op: UserOperation): Promise<PaymasterResult>;

  /**
   * Get a stub for gas estimation
   */
  getPaymasterStub(op: UserOperation): Promise<PaymasterStub>;
}

/**
 * Verifying Paymaster - sponsors gas based on signature
 */
export class VerifyingPaymaster implements Paymaster {
  private readonly address: Address;
  private readonly signerKey: Hex;
  private readonly validUntil: number;
  private readonly validAfter: number;

  constructor(config: {
    address: Address;
    signerKey: Hex;
    validUntil?: number;
    validAfter?: number;
  }) {
    this.address = config.address;
    this.signerKey = config.signerKey;
    this.validUntil = config.validUntil ?? Math.floor(Date.now() / 1000) + 3600; // 1 hour
    this.validAfter = config.validAfter ?? 0;
  }

  async getPaymasterData(op: UserOperation): Promise<PaymasterResult> {
    // Create hash to sign
    const hash = this.getHash(op);
    const signature = sign(hash, this.signerKey);

    // Pack: paymaster address (20) + validUntil (6) + validAfter (6) + signature (r + s + v)
    const sigBytes = concatHex(signature.r, signature.s, numberToHex(signature.v) as Hex);
    const paymasterAndData = concatHex(
      this.address,
      padHex(numberToHex(this.validUntil), 6),
      padHex(numberToHex(this.validAfter), 6),
      sigBytes
    );

    return { paymasterAndData };
  }

  async getPaymasterStub(_op: UserOperation): Promise<PaymasterStub> {
    // Return stub with dummy signature for gas estimation
    const dummySignature = '0x' + 'ff'.repeat(65);
    const paymasterAndData = concatHex(
      this.address,
      padHex(numberToHex(this.validUntil), 6),
      padHex(numberToHex(this.validAfter), 6),
      dummySignature as Hex
    );

    return { paymasterAndData };
  }

  private getHash(op: UserOperation): Hash {
    // Hash the relevant fields
    const encoded = encodeParameters(
      ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint48', 'uint48'],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        BigInt(this.validUntil),
        BigInt(this.validAfter),
      ]
    );

    return keccak256(encoded);
  }
}

/**
 * Remote Paymaster - calls external service
 */
export class RemotePaymaster implements Paymaster {
  private readonly url: string;
  private readonly apiKey?: string;
  private readonly entryPoint: Address;

  constructor(config: {
    url: string;
    apiKey?: string;
    entryPoint: Address;
  }) {
    this.url = config.url;
    if (config.apiKey !== undefined) {
      this.apiKey = config.apiKey;
    }
    this.entryPoint = config.entryPoint;
  }

  async getPaymasterData(op: UserOperation): Promise<PaymasterResult> {
    const response = await this.call('pm_sponsorUserOperation', [
      encodeUserOp(op),
      this.entryPoint,
    ]);

    const result: PaymasterResult = {
      paymasterAndData: response['paymasterAndData'] as Hex,
    };
    if (response['preVerificationGas']) {
      result.preVerificationGas = BigInt(response['preVerificationGas'] as string);
    }
    if (response['verificationGasLimit']) {
      result.verificationGasLimit = BigInt(response['verificationGasLimit'] as string);
    }
    if (response['callGasLimit']) {
      result.callGasLimit = BigInt(response['callGasLimit'] as string);
    }
    return result;
  }

  async getPaymasterStub(op: UserOperation): Promise<PaymasterStub> {
    const response = await this.call('pm_getPaymasterStubData', [
      encodeUserOp(op),
      this.entryPoint,
    ]);

    return {
      paymasterAndData: response['paymasterAndData'] as Hex,
    };
  }

  private async call(method: string, params: unknown[]): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    const json = await response.json() as { result?: Record<string, unknown>; error?: { message: string } };

    if (json.error) {
      throw new Error(`Paymaster error: ${json.error.message}`);
    }

    return json.result ?? {};
  }
}

/**
 * ERC20 Paymaster - pays gas with ERC20 tokens
 */
export class ERC20Paymaster implements Paymaster {
  private readonly address: Address;

  constructor(config: {
    address: Address;
    token: Address; // Required for setup, not stored as not needed after approval
  }) {
    this.address = config.address;
    // Token address would be used for approval setup, not needed for getPaymasterData
    void config.token; // Acknowledge parameter
  }

  async getPaymasterData(_op: UserOperation): Promise<PaymasterResult> {
    // For ERC20 paymaster, just need the address
    // The token approval should already be in place
    return {
      paymasterAndData: this.address,
    };
  }

  async getPaymasterStub(_op: UserOperation): Promise<PaymasterStub> {
    return {
      paymasterAndData: this.address,
    };
  }
}

/**
 * Create a verifying paymaster
 */
export function createVerifyingPaymaster(config: {
  address: Address;
  signerKey: Hex;
}): VerifyingPaymaster {
  return new VerifyingPaymaster(config);
}

/**
 * Create a remote paymaster client
 */
export function createRemotePaymaster(config: {
  url: string;
  apiKey?: string;
  entryPoint: Address;
}): RemotePaymaster {
  return new RemotePaymaster(config);
}
