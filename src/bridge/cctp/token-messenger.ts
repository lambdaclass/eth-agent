/**
 * TokenMessenger contract wrapper
 * Handles USDC burn operations for CCTP bridging
 *
 * Supports:
 * - depositForBurn (4 params) - basic v1 transfer
 * - depositForBurnWithCaller (5 params) - v1 with destinationCaller restriction
 * - depositForBurn (7 params) - v2 with maxFee and minFinalityThreshold for fast transfers
 */

import type { Address, Hash, Hex, ABI, Log } from '../../core/types.js';
import { keccak256 } from '../../core/hash.js';
import { bytesToHex, hexToBytes } from '../../core/hex.js';
import { encodeFunctionCall } from '../../core/abi.js';
import { Contract, ERC20_ABI } from '../../protocol/contract.js';
import { TransactionBuilder } from '../../protocol/transaction.js';
import { GasOracle } from '../../protocol/gas.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import type { CCTPDomain } from '../types.js';
import type { CCTPChainConfig, CCTPFinalityThreshold } from '../constants.js';

/**
 * Parameters for depositForBurn (v1 - standard)
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
 * Parameters for v2 depositForBurn with fast transfer support
 * When maxFee and minFinalityThreshold are provided, uses v2 contract function (7 params)
 */
export interface DepositForBurnV2Params extends DepositForBurnParams {
  /** Address that can call receiveMessage on destination (bytes32). If zero, anyone can. */
  destinationCaller?: Address;
  /** Maximum fee willing to pay for fast transfer (in USDC raw units, 6 decimals) */
  maxFee?: bigint;
  /** Finality threshold: 1000 for fast (confirmed), 2000 for standard (finalized) */
  minFinalityThreshold?: CCTPFinalityThreshold;
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
 * Note: v2 function signature is encoded manually to avoid overload issues
 */
export const TOKEN_MESSENGER_ABI: ABI = [
  // v1 depositForBurn (4 params)
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
 * depositForBurnWithCaller function signature (5 params)
 * Available on both v1 and v2 contracts - adds destinationCaller to control who can mint
 */
const DEPOSIT_FOR_BURN_WITH_CALLER_SIGNATURE = 'depositForBurnWithCaller(uint256,uint32,bytes32,address,bytes32)';

/**
 * depositForBurn v2 function signature (7 params)
 * Only available on v2 contracts - includes maxFee and minFinalityThreshold for fast transfers
 * Signature: depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)
 */
const DEPOSIT_FOR_BURN_V2_SIGNATURE = 'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)';

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
   * Deposit USDC for burning and cross-chain transfer (v1 - standard)
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
   * Deposit USDC for burning with v2 contract support for fast transfers
   *
   * If maxFee and minFinalityThreshold are provided, uses the v2 contract function
   * (7 params) which enables fast attestation. Otherwise falls back to v1 function.
   *
   * @param params - Parameters including optional destinationCaller, maxFee, minFinalityThreshold
   * @returns Transaction result with message details
   */
  async depositForBurnV2(params: DepositForBurnV2Params): Promise<DepositForBurnResult> {
    // Convert recipient address to bytes32 (left-padded with zeros)
    const mintRecipientBytes32 = addressToBytes32(params.mintRecipient);

    // Convert destination caller to bytes32 (zero bytes32 means anyone can complete)
    const destinationCallerBytes32 = params.destinationCaller
      ? addressToBytes32(params.destinationCaller)
      : ZERO_BYTES32;

    let data: Hex;

    // If maxFee and minFinalityThreshold are provided, use v2 contract function (7 params)
    // This enables fast attestation by signaling to Circle that we're willing to pay the fast fee
    if (params.maxFee !== undefined && params.minFinalityThreshold !== undefined) {
      // Use v2 depositForBurn (7 params) for fast transfers
      data = encodeFunctionCall(DEPOSIT_FOR_BURN_V2_SIGNATURE, [
        params.amount,
        params.destinationDomain,
        mintRecipientBytes32,
        params.burnToken,
        destinationCallerBytes32,
        params.maxFee,
        params.minFinalityThreshold,
      ]);
    } else {
      // Fall back to v1 depositForBurnWithCaller (5 params)
      data = encodeFunctionCall(DEPOSIT_FOR_BURN_WITH_CALLER_SIGNATURE, [
        params.amount,
        params.destinationDomain,
        mintRecipientBytes32,
        params.burnToken,
        destinationCallerBytes32,
      ]);
    }

    // Estimate gas
    const gasOracle = new GasOracle(this.rpc);
    const estimate = await gasOracle.estimateGas({
      to: this.config.tokenMessenger,
      from: this.account.address,
      data,
    });

    // Build and sign transaction
    const chainId = await this.rpc.getChainId();
    const nonce = await this.rpc.getTransactionCount(this.account.address);

    let builder = TransactionBuilder.create()
      .to(this.config.tokenMessenger)
      .data(data)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(estimate.gasLimit);

    if (estimate.maxFeePerGas) {
      builder = builder.maxFeePerGas(estimate.maxFeePerGas);
      if (estimate.maxPriorityFeePerGas) {
        builder = builder.maxPriorityFeePerGas(estimate.maxPriorityFeePerGas);
      }
    } else if (estimate.gasPrice) {
      builder = builder.gasPrice(estimate.gasPrice);
    }

    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);

    // Wait for receipt
    const receipt = await this.rpc.waitForTransaction(hash);

    if (receipt.status !== 'success') {
      throw new Error('depositForBurn transaction reverted');
    }

    // Parse events to get nonce and message
    const { nonce: msgNonce, messageBytes, messageHash } = this.parseDepositEvents(receipt.logs);

    return {
      hash: receipt.transactionHash,
      nonce: msgNonce,
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
 * Zero bytes32 constant (used for allowing anyone to complete the transfer)
 */
const ZERO_BYTES32: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

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
