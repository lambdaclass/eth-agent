/**
 * Across SpokePool contract wrapper
 * Handles deposits for cross-chain transfers
 */

import type { Address, Hash, Hex } from '../../core/types.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import { encodeParameters } from '../../core/abi.js';
import { concatHex } from '../../core/hex.js';
import { TransactionBuilder } from '../../protocol/transaction.js';
import { GasOracle } from '../../protocol/gas.js';

/**
 * SpokePool V3 ABI (deposit functions)
 */
export const SPOKE_POOL_ABI = [
  // depositV3 - Main deposit function for V3
  {
    name: 'depositV3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'depositor', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'inputToken', type: 'address' },
      { name: 'outputToken', type: 'address' },
      { name: 'inputAmount', type: 'uint256' },
      { name: 'outputAmount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
      { name: 'exclusiveRelayer', type: 'address' },
      { name: 'quoteTimestamp', type: 'uint32' },
      { name: 'fillDeadline', type: 'uint32' },
      { name: 'exclusivityDeadline', type: 'uint32' },
      { name: 'message', type: 'bytes' },
    ],
    outputs: [],
  },
  // getCurrentTime - For quote timestamp
  {
    name: 'getCurrentTime',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // numberOfDeposits - For deposit ID tracking
  {
    name: 'numberOfDeposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint32' }],
  },
] as const;

/**
 * V3FundsDeposited event ABI
 */
export const V3_FUNDS_DEPOSITED_EVENT = {
  name: 'V3FundsDeposited',
  type: 'event',
  inputs: [
    { name: 'inputToken', type: 'address', indexed: false },
    { name: 'outputToken', type: 'address', indexed: false },
    { name: 'inputAmount', type: 'uint256', indexed: false },
    { name: 'outputAmount', type: 'uint256', indexed: false },
    { name: 'destinationChainId', type: 'uint256', indexed: true },
    { name: 'depositId', type: 'uint32', indexed: true },
    { name: 'quoteTimestamp', type: 'uint32', indexed: false },
    { name: 'fillDeadline', type: 'uint32', indexed: false },
    { name: 'exclusivityDeadline', type: 'uint32', indexed: false },
    { name: 'depositor', type: 'address', indexed: true },
    { name: 'recipient', type: 'address', indexed: false },
    { name: 'exclusiveRelayer', type: 'address', indexed: false },
    { name: 'message', type: 'bytes', indexed: false },
  ],
} as const;

/**
 * Parameters for depositV3
 */
export interface DepositV3Params {
  /** Depositor address (who is depositing) */
  depositor: Address;
  /** Recipient address on destination chain */
  recipient: Address;
  /** Token address on source chain */
  inputToken: Address;
  /** Token address on destination chain */
  outputToken: Address;
  /** Amount to deposit (in token decimals) */
  inputAmount: bigint;
  /** Minimum amount to receive (after fees/slippage) */
  outputAmount: bigint;
  /** Destination chain ID */
  destinationChainId: number;
  /** Optional exclusive relayer (zero address for open) */
  exclusiveRelayer?: Address;
  /** Quote timestamp from Across API */
  quoteTimestamp: number;
  /** Fill deadline (timestamp) */
  fillDeadline: number;
  /** Exclusivity deadline (timestamp, 0 for no exclusivity) */
  exclusivityDeadline?: number;
  /** Optional message for contract calls on destination */
  message?: Hex;
}

/**
 * Result from depositV3
 */
export interface DepositV3Result {
  /** Transaction hash */
  txHash: Hash;
  /** Deposit ID (for tracking) */
  depositId: number;
  /** Block number */
  blockNumber: number;
  /** Source chain ID */
  sourceChainId: number;
  /** Destination chain ID */
  destinationChainId: number;
}

/**
 * Decoded V3FundsDeposited event
 */
export interface V3FundsDepositedEvent {
  inputToken: Address;
  outputToken: Address;
  inputAmount: bigint;
  outputAmount: bigint;
  destinationChainId: number;
  depositId: number;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusivityDeadline: number;
  depositor: Address;
  recipient: Address;
  exclusiveRelayer: Address;
  message: Hex;
}

/**
 * SpokePool contract wrapper
 */
export class SpokePoolContract {
  private readonly rpc: RPCClient;
  private readonly account: Account;
  readonly spokePoolAddress: Address;
  private readonly gasOracle: GasOracle;

  constructor(config: { rpc: RPCClient; account: Account; spokePoolAddress: Address }) {
    this.rpc = config.rpc;
    this.account = config.account;
    this.spokePoolAddress = config.spokePoolAddress;
    this.gasOracle = new GasOracle(config.rpc);
  }

  /**
   * Get the current SpokePool time
   */
  async getCurrentTime(): Promise<number> {
    const result = await this.rpc.call({
      to: this.spokePoolAddress,
      data: '0x29cb924d' as Hex, // getCurrentTime() selector
    });

    return Number(BigInt(result));
  }

  /**
   * Get the current number of deposits (for deposit ID)
   */
  async getNumberOfDeposits(): Promise<number> {
    const result = await this.rpc.call({
      to: this.spokePoolAddress,
      data: '0xda7c8ff3' as Hex, // numberOfDeposits() selector
    });

    return Number(BigInt(result));
  }

  /**
   * Execute depositV3
   */
  async depositV3(params: DepositV3Params): Promise<DepositV3Result> {
    const {
      depositor,
      recipient,
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      destinationChainId,
      exclusiveRelayer = '0x0000000000000000000000000000000000000000' as Address,
      quoteTimestamp,
      fillDeadline,
      exclusivityDeadline = 0,
      message = '0x' as Hex,
    } = params;

    // Encode the function call
    // depositV3 selector: 0xe7a7ed02
    const selector = '0xe7a7ed02' as Hex;

    // Encode parameters
    const encodedParams = encodeParameters(
      [
        'address',
        'address',
        'address',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'address',
        'uint32',
        'uint32',
        'uint32',
        'bytes',
      ],
      [
        depositor,
        recipient,
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        BigInt(destinationChainId),
        exclusiveRelayer,
        quoteTimestamp,
        fillDeadline,
        exclusivityDeadline,
        message,
      ]
    );

    const data = concatHex(selector, encodedParams);

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      to: this.spokePoolAddress,
      from: this.account.address,
      data,
      value: 0n,
    });

    // Get nonce and chain ID
    const nonce = await this.rpc.getTransactionCount(this.account.address);
    const chainId = await this.rpc.getChainId();

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(this.spokePoolAddress)
      .data(data)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit)
      .value(0n);

    if (gasEstimate.maxFeePerGas) {
      builder = builder.maxFeePerGas(gasEstimate.maxFeePerGas);
      if (gasEstimate.maxPriorityFeePerGas) {
        builder = builder.maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas);
      }
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const txHash = await this.rpc.sendRawTransaction(signed.raw);

    // Wait for confirmation
    const receipt = await this.rpc.waitForTransaction(txHash);

    // Parse the deposit event to get depositId
    const depositEvent = this.parseDepositEvent(receipt.logs);

    return {
      txHash,
      depositId: depositEvent?.depositId ?? 0,
      blockNumber: receipt.blockNumber,
      sourceChainId: chainId,
      destinationChainId,
    };
  }

  /**
   * Parse V3FundsDeposited event from transaction logs
   */
  parseDepositEvent(
    logs: Array<{ topics: Hex[]; data: Hex; address: Address }>
  ): V3FundsDepositedEvent | null {
    // V3FundsDeposited event topic
    const eventTopic =
      '0xa123dc29aebf7d0c3322c8eeb5b999e859f39937950ed31056532713d0de396f';

    for (const log of logs) {
      if (
        log.address.toLowerCase() === this.spokePoolAddress.toLowerCase() &&
        log.topics[0] === eventTopic
      ) {
        return this.decodeDepositEvent(log);
      }
    }

    return null;
  }

  /**
   * Decode V3FundsDeposited event data
   */
  private decodeDepositEvent(log: {
    topics: Hex[];
    data: Hex;
  }): V3FundsDepositedEvent {
    // Indexed parameters from topics
    const destinationChainId = Number(BigInt(log.topics[1] ?? '0x0'));
    const depositId = Number(BigInt(log.topics[2] ?? '0x0'));
    const depositor = ('0x' + (log.topics[3] ?? '').slice(26)) as Address;

    // Non-indexed parameters from data
    const data = log.data.slice(2); // Remove 0x prefix

    // Each 32-byte segment (64 hex chars)
    const inputToken = ('0x' + data.slice(24, 64)) as Address;
    const outputToken = ('0x' + data.slice(88, 128)) as Address;
    const inputAmount = BigInt('0x' + data.slice(128, 192));
    const outputAmount = BigInt('0x' + data.slice(192, 256));
    // Skip destinationChainId at 256-320 (already from topics)
    // Skip depositId at 320-384 (already from topics)
    const quoteTimestamp = Number(BigInt('0x' + data.slice(384, 448)));
    const fillDeadline = Number(BigInt('0x' + data.slice(448, 512)));
    const exclusivityDeadline = Number(BigInt('0x' + data.slice(512, 576)));
    // Skip depositor at 576-640 (already from topics)
    const recipient = ('0x' + data.slice(664, 704)) as Address;
    const exclusiveRelayer = ('0x' + data.slice(728, 768)) as Address;
    // message is dynamic, starts at offset specified at 768-832
    const messageOffset = Number(BigInt('0x' + data.slice(768, 832))) * 2;
    const messageLength = Number(BigInt('0x' + data.slice(messageOffset, messageOffset + 64))) * 2;
    const message = ('0x' + data.slice(messageOffset + 64, messageOffset + 64 + messageLength)) as Hex;

    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      destinationChainId,
      depositId,
      quoteTimestamp,
      fillDeadline,
      exclusivityDeadline,
      depositor,
      recipient,
      exclusiveRelayer,
      message: message || ('0x' as Hex),
    };
  }
}

/**
 * Create a SpokePool contract instance
 */
export function createSpokePoolContract(config: {
  rpc: RPCClient;
  account: Account;
  spokePoolAddress: Address;
}): SpokePoolContract {
  return new SpokePoolContract(config);
}
