/**
 * ERC-4337 UserOperation
 * Core data structure for account abstraction
 */

import type { Address, Hash, Hex } from '../core/types.js';
import { keccak256 } from '../core/hash.js';
import { concatHex, padHex, numberToHex } from '../core/hex.js';
import { encodeParameters } from '../core/abi.js';

export interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;  // packed: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  preVerificationGas: bigint;
  gasFees: Hex;           // packed: maxPriorityFeePerGas (16 bytes) || maxFeePerGas (16 bytes)
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * Create an empty UserOperation
 */
export function createUserOp(partial: Partial<UserOperation> & { sender: Address }): UserOperation {
  return {
    sender: partial.sender,
    nonce: partial.nonce ?? 0n,
    initCode: partial.initCode ?? '0x',
    callData: partial.callData ?? '0x',
    callGasLimit: partial.callGasLimit ?? 0n,
    verificationGasLimit: partial.verificationGasLimit ?? 0n,
    preVerificationGas: partial.preVerificationGas ?? 0n,
    maxFeePerGas: partial.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: partial.maxPriorityFeePerGas ?? 0n,
    paymasterAndData: partial.paymasterAndData ?? '0x',
    signature: partial.signature ?? '0x',
  };
}

/**
 * Pack UserOperation for v0.7 EntryPoint
 */
export function packUserOp(op: UserOperation): PackedUserOperation {
  // Pack gas limits: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  const accountGasLimits = concatHex(
    padHex(numberToHex(op.verificationGasLimit), 16),
    padHex(numberToHex(op.callGasLimit), 16)
  );

  // Pack gas fees: maxPriorityFeePerGas (16 bytes) || maxFeePerGas (16 bytes)
  const gasFees = concatHex(
    padHex(numberToHex(op.maxPriorityFeePerGas), 16),
    padHex(numberToHex(op.maxFeePerGas), 16)
  );

  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: op.initCode,
    callData: op.callData,
    accountGasLimits,
    preVerificationGas: op.preVerificationGas,
    gasFees,
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

/**
 * Calculate UserOperation hash for signing
 */
export function getUserOpHash(
  op: UserOperation,
  entryPoint: Address,
  chainId: number
): Hash {
  // Hash the packed UserOp (without signature)
  const packed = encodeParameters(
    ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
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
      keccak256(op.paymasterAndData),
    ]
  );

  const userOpHash = keccak256(packed);

  // Hash with entryPoint and chainId
  const encoded = encodeParameters(
    ['bytes32', 'address', 'uint256'],
    [userOpHash, entryPoint, BigInt(chainId)]
  );

  return keccak256(encoded);
}

/**
 * Encode UserOperation for RPC calls
 */
export function encodeUserOp(op: UserOperation): Record<string, string> {
  return {
    sender: op.sender,
    nonce: `0x${op.nonce.toString(16)}`,
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: `0x${op.callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${op.verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${op.preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${op.maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${op.maxPriorityFeePerGas.toString(16)}`,
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

/**
 * Decode UserOperation from RPC response
 */
export function decodeUserOp(data: Record<string, string>): UserOperation {
  return {
    sender: data['sender'] as Address,
    nonce: BigInt(data['nonce'] ?? '0'),
    initCode: (data['initCode'] ?? '0x') as Hex,
    callData: (data['callData'] ?? '0x') as Hex,
    callGasLimit: BigInt(data['callGasLimit'] ?? '0'),
    verificationGasLimit: BigInt(data['verificationGasLimit'] ?? '0'),
    preVerificationGas: BigInt(data['preVerificationGas'] ?? '0'),
    maxFeePerGas: BigInt(data['maxFeePerGas'] ?? '0'),
    maxPriorityFeePerGas: BigInt(data['maxPriorityFeePerGas'] ?? '0'),
    paymasterAndData: (data['paymasterAndData'] ?? '0x') as Hex,
    signature: (data['signature'] ?? '0x') as Hex,
  };
}

// EntryPoint v0.7 address (same on all chains)
export const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;

// EntryPoint v0.6 address (same on all chains)
export const ENTRY_POINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as Address;
