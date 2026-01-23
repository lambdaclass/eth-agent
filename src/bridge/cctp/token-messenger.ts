/**
 * TokenMessenger contract wrapper
 * Handles USDC burn operations for CCTP bridging
 */

import type { Address, Hash, Hex, ABI, Log } from '../../core/types.js';
import { keccak256 } from '../../core/hash.js';
import { bytesToHex, hexToBytes } from '../../core/hex.js';
import { Contract, ERC20_ABI } from '../../protocol/contract.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import type { CCTPDomain } from '../types.js';
import type { CCTPChainConfig } from '../constants.js';

/**
 * Parameters for depositForBurn
 */
export interface DepositForBurnParams {
  /** Amount of USDC to burn (raw with 6 decimals) */
  amount: bigint;
  /** CCTP domain of destination chain */
  destinationDomain: CCTPDomain;
  /** Recipient address (converted to bytes32) */
  mintRecipient: Address;
  /** USDC token address on source chain */
  burnToken: Address;
}

/**
 * Result from depositForBurn
 */
export interface DepositForBurnResult {
  /** Transaction hash */
  hash: Hash;
  /** CCTP message nonce */
  nonce: bigint;
  /** Raw message bytes (needed for completion) */
  messageBytes: Hex;
  /** Message hash (keccak256 of messageBytes) */
  messageHash: Hex;
}

/**
 * TokenMessenger ABI - depositForBurn function and events
 */
export const TOKEN_MESSENGER_ABI: ABI = [
  {
    type: 'function',
    name: 'depositForBurn',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'localMessageTransmitter',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'DepositForBurn',
    inputs: [
      { name: 'nonce', type: 'uint64', indexed: true },
      { name: 'burnToken', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'mintRecipient', type: 'bytes32', indexed: false },
      { name: 'destinationDomain', type: 'uint32', indexed: false },
      { name: 'destinationTokenMessenger', type: 'bytes32', indexed: false },
      { name: 'destinationCaller', type: 'bytes32', indexed: false },
    ],
  },
];

/**
 * MessageSent event ABI from MessageTransmitter
 */
export const MESSAGE_SENT_ABI: ABI = [
  {
    type: 'event',
    name: 'MessageSent',
    inputs: [{ name: 'message', type: 'bytes', indexed: false }],
  },
];

/**
 * TokenMessenger contract wrapper
 * Provides methods to burn USDC for cross-chain transfers
 */
export class TokenMessengerContract {
  private readonly contract: Contract;
  private readonly rpc: RPCClient;
  private readonly config: CCTPChainConfig;
  private readonly account: Account;

  constructor(config: {
    rpc: RPCClient;
    account: Account;
    cctpConfig: CCTPChainConfig;
  }) {
    this.rpc = config.rpc;
    this.account = config.account;
    this.config = config.cctpConfig;

    this.contract = new Contract({
      address: config.cctpConfig.tokenMessenger,
      abi: TOKEN_MESSENGER_ABI,
      rpc: config.rpc,
      account: config.account,
    });
  }

  /**
   * Deposit USDC for burning and cross-chain transfer
   */
  async depositForBurn(params: DepositForBurnParams): Promise<DepositForBurnResult> {
    // Convert recipient address to bytes32 (left-padded with zeros)
    const mintRecipientBytes32 = addressToBytes32(params.mintRecipient);

    // Call depositForBurn
    const result = await this.contract.write('depositForBurn', [
      params.amount,
      params.destinationDomain,
      mintRecipientBytes32,
      params.burnToken,
    ]);

    // Wait for receipt
    const receipt = await result.wait();

    if (receipt.status !== 'success') {
      throw new Error('depositForBurn transaction reverted');
    }

    // Parse events to get nonce and message
    const { nonce, messageBytes, messageHash } = this.parseDepositEvents(receipt.logs);

    return {
      hash: receipt.hash,
      nonce,
      messageBytes,
      messageHash,
    };
  }

  /**
   * Check USDC allowance for TokenMessenger
   */
  async getAllowance(owner: Address): Promise<bigint> {
    const usdcContract = new Contract({
      address: this.config.usdc,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    return usdcContract.read<bigint>('allowance', [owner, this.config.tokenMessenger]);
  }

  /**
   * Approve USDC spending for TokenMessenger
   */
  async approve(amount: bigint): Promise<Hash> {
    const usdcContract = new Contract({
      address: this.config.usdc,
      abi: ERC20_ABI,
      rpc: this.rpc,
      account: this.account,
    });

    const result = await usdcContract.write('approve', [this.config.tokenMessenger, amount]);
    const receipt = await result.wait();

    if (receipt.status !== 'success') {
      throw new Error('USDC approve transaction reverted');
    }

    return receipt.hash;
  }

  /**
   * Get USDC balance
   */
  async getBalance(address: Address): Promise<bigint> {
    const usdcContract = new Contract({
      address: this.config.usdc,
      abi: ERC20_ABI,
      rpc: this.rpc,
    });

    return usdcContract.read<bigint>('balanceOf', [address]);
  }

  /**
   * Parse DepositForBurn and MessageSent events from logs
   */
  private parseDepositEvents(logs: Log[]): {
    nonce: bigint;
    messageBytes: Hex;
    messageHash: Hex;
  } {
    // Find MessageSent event from MessageTransmitter
    // The topic0 for MessageSent(bytes) event
    const messageSentTopic = keccak256(new TextEncoder().encode('MessageSent(bytes)'));

    let messageBytes: Hex | undefined;
    let nonce: bigint | undefined;

    for (const log of logs) {
      // Check for MessageSent event
      if (log.topics[0] === messageSentTopic) {
        // Decode the message bytes from event data
        // The data is ABI-encoded: offset (32 bytes) + length (32 bytes) + data
        const data = hexToBytes(log.data);

        // Skip the offset (first 32 bytes) and read length
        const lengthOffset = 32;
        const lengthBytes = data.slice(lengthOffset, lengthOffset + 32);
        const messageLength = bytesToBigInt(lengthBytes);

        // Read the message bytes
        const messageStart = lengthOffset + 32;
        const messageData = data.slice(messageStart, messageStart + Number(messageLength));
        messageBytes = bytesToHex(messageData);

        // Extract nonce from message bytes (bytes 12-20 in the message header)
        // Message format: version (4) + sourceDomain (4) + destDomain (4) + nonce (8) + ...
        const nonceOffset = 12;
        const nonceBytes = messageData.slice(nonceOffset, nonceOffset + 8);
        nonce = bytesToBigInt(nonceBytes);
      }
    }

    if (messageBytes === undefined || nonce === undefined) {
      throw new Error('Failed to parse DepositForBurn events - MessageSent not found');
    }

    // Calculate message hash
    const messageHash = keccak256(hexToBytes(messageBytes));

    return {
      nonce,
      messageBytes,
      messageHash,
    };
  }
}

/**
 * Convert an address to bytes32 (left-padded with zeros)
 */
function addressToBytes32(address: Address): Hex {
  // Remove 0x prefix and pad to 64 characters (32 bytes)
  const addressWithoutPrefix = address.slice(2).toLowerCase();
  return `0x${'0'.repeat(24)}${addressWithoutPrefix}` as Hex;
}

/**
 * Convert bytes to bigint (big-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}
