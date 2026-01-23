/**
 * MessageTransmitter contract wrapper
 * Handles message receiving (minting) for CCTP bridging
 */

import type { Hash, Hex, ABI } from '../../core/types.js';
import { keccak256 } from '../../core/hash.js';
import { Contract } from '../../protocol/contract.js';
import type { RPCClient } from '../../protocol/rpc.js';
import type { Account } from '../../protocol/account.js';
import type { CCTPChainConfig } from '../constants.js';

/**
 * MessageTransmitter ABI
 */
export const MESSAGE_TRANSMITTER_ABI: ABI = [
  {
    type: 'function',
    name: 'receiveMessage',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'usedNonces',
    inputs: [{ name: 'nonce', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'localDomain',
    inputs: [],
    outputs: [{ name: '', type: 'uint32' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MessageReceived',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'sourceDomain', type: 'uint32', indexed: false },
      { name: 'nonce', type: 'uint64', indexed: true },
      { name: 'sender', type: 'bytes32', indexed: false },
      { name: 'messageBody', type: 'bytes', indexed: false },
    ],
  },
];

/**
 * Result from receiveMessage
 */
export interface ReceiveMessageResult {
  /** Transaction hash */
  hash: Hash;
  /** Whether the message was successfully processed */
  success: boolean;
}

/**
 * MessageTransmitter contract wrapper
 * Provides methods to receive and process cross-chain messages
 */
export class MessageTransmitterContract {
  private readonly contract: Contract;
  private readonly account?: Account;

  constructor(config: {
    rpc: RPCClient;
    account?: Account;
    cctpConfig: CCTPChainConfig;
  }) {
    if (config.account) {
      this.account = config.account;
    }

    this.contract = new Contract({
      address: config.cctpConfig.messageTransmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      rpc: config.rpc,
      account: config.account,
    });
  }

  /**
   * Receive a message on the destination chain
   * This completes the bridge by minting USDC to the recipient
   */
  async receiveMessage(message: Hex, attestation: Hex): Promise<ReceiveMessageResult> {
    if (!this.account) {
      throw new Error('Account required for receiveMessage');
    }

    const result = await this.contract.write('receiveMessage', [message, attestation]);
    const receipt = await result.wait();

    return {
      hash: receipt.hash,
      success: receipt.status === 'success',
    };
  }

  /**
   * Check if a nonce has been used
   * This is useful to check if a message has already been processed
   */
  async isNonceUsed(sourceDomain: number, nonce: bigint): Promise<boolean> {
    // Create the nonce hash key: keccak256(abi.encodePacked(sourceDomain, nonce))
    const nonceKey = this.createNonceKey(sourceDomain, nonce);

    // Query the usedNonces mapping
    const result = await this.contract.read<bigint>('usedNonces', [nonceKey]);

    // If result is non-zero, nonce has been used
    return result !== 0n;
  }

  /**
   * Get the local domain ID
   */
  async getLocalDomain(): Promise<number> {
    return this.contract.read<number>('localDomain');
  }

  /**
   * Create a nonce key for the usedNonces mapping
   * The key is keccak256(abi.encodePacked(sourceDomain, nonce))
   */
  private createNonceKey(sourceDomain: number, nonce: bigint): Hex {
    // Pack sourceDomain (4 bytes) + nonce (8 bytes)
    const packed = new Uint8Array(12);
    const view = new DataView(packed.buffer);

    // sourceDomain as uint32 (big-endian)
    view.setUint32(0, sourceDomain, false);

    // nonce as uint64 (big-endian)
    const nonceHigh = Number(nonce >> 32n);
    const nonceLow = Number(nonce & 0xFFFFFFFFn);
    view.setUint32(4, nonceHigh, false);
    view.setUint32(8, nonceLow, false);

    // Hash it
    return keccak256(packed);
  }

  /**
   * Static helper to create a MessageTransmitter for a specific chain
   */
  static forChain(config: {
    rpc: RPCClient;
    account?: Account;
    cctpConfig: CCTPChainConfig;
  }): MessageTransmitterContract {
    return new MessageTransmitterContract(config);
  }
}

/**
 * Helper to decode source domain and nonce from message bytes
 */
export function decodeMessageHeader(messageBytes: Hex): {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  nonce: bigint;
  sender: Hex;
  recipient: Hex;
} {
  // Remove 0x prefix and convert to bytes
  const hex = messageBytes.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  const view = new DataView(bytes.buffer);

  // Message header format:
  // - version: 4 bytes
  // - sourceDomain: 4 bytes
  // - destinationDomain: 4 bytes
  // - nonce: 8 bytes
  // - sender: 32 bytes
  // - recipient: 32 bytes
  // - destinationCaller: 32 bytes
  // - messageBody: remaining bytes

  const version = view.getUint32(0, false);
  const sourceDomain = view.getUint32(4, false);
  const destinationDomain = view.getUint32(8, false);

  // Nonce is 8 bytes starting at offset 12
  const nonceHigh = view.getUint32(12, false);
  const nonceLow = view.getUint32(16, false);
  const nonce = (BigInt(nonceHigh) << 32n) | BigInt(nonceLow);

  // Sender is bytes32 at offset 20
  const senderHex = hex.slice(40, 104); // 20*2 to 52*2
  const sender: Hex = `0x${senderHex}`;

  // Recipient is bytes32 at offset 52
  const recipientHex = hex.slice(104, 168); // 52*2 to 84*2
  const recipient: Hex = `0x${recipientHex}`;

  return {
    version,
    sourceDomain,
    destinationDomain,
    nonce,
    sender,
    recipient,
  };
}

/**
 * Decode the BurnMessage body to extract amount and other details
 * BurnMessage format (after header):
 * - version: 4 bytes
 * - burnToken: 32 bytes (address padded)
 * - mintRecipient: 32 bytes (address padded)
 * - amount: 32 bytes (uint256)
 * - messageSender: 32 bytes (address padded)
 */
export function decodeBurnMessageBody(messageBytes: Hex): {
  burnToken: Hex;
  mintRecipient: Hex;
  amount: bigint;
  messageSender: Hex;
} {
  // Remove 0x prefix and convert to bytes
  const hex = messageBytes.slice(2);

  // Message body starts after the header (116 bytes = 232 hex chars)
  // Header: version(4) + sourceDomain(4) + destDomain(4) + nonce(8) +
  //         sender(32) + recipient(32) + destCaller(32) = 116 bytes
  const bodyStartHex = 232;

  // BurnMessage body format:
  // - version: 4 bytes (8 hex chars)
  // - burnToken: 32 bytes (64 hex chars) - left-padded address
  // - mintRecipient: 32 bytes (64 hex chars) - left-padded address
  // - amount: 32 bytes (64 hex chars) - uint256
  // - messageSender: 32 bytes (64 hex chars) - left-padded address

  const versionEnd = bodyStartHex + 8;
  const burnTokenEnd = versionEnd + 64;
  const mintRecipientEnd = burnTokenEnd + 64;
  const amountEnd = mintRecipientEnd + 64;
  const messageSenderEnd = amountEnd + 64;

  // Extract burn token (last 40 chars = 20 bytes = address)
  const burnTokenHex = hex.slice(burnTokenEnd - 40, burnTokenEnd);
  const burnToken: Hex = `0x${burnTokenHex}`;

  // Extract mint recipient
  const mintRecipientHex = hex.slice(mintRecipientEnd - 40, mintRecipientEnd);
  const mintRecipient: Hex = `0x${mintRecipientHex}`;

  // Extract amount (full 32 bytes as bigint)
  const amountHex = hex.slice(mintRecipientEnd, amountEnd);
  const amount = BigInt(`0x${amountHex}`);

  // Extract message sender
  const messageSenderHex = hex.slice(messageSenderEnd - 40, messageSenderEnd);
  const messageSender: Hex = `0x${messageSenderHex}`;

  return {
    burnToken,
    mintRecipient,
    amount,
    messageSender,
  };
}
