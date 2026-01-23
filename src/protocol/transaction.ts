/**
 * Ethereum Transaction building and signing
 * Supports Legacy, EIP-2930, and EIP-1559 transactions
 */

import type {
  Address,
  Hash,
  Hex,
  Signature,
  Transaction,
  LegacyTransaction,
  EIP1559Transaction,
  EIP2930Transaction,
  SignedTransaction,
  AccessList,
} from '../core/types.js';
import { encode as rlpEncode, decode as rlpDecode } from '../core/rlp.js';
import { keccak256 } from '../core/hash.js';
import { bytesToHex, hexToBytes } from '../core/hex.js';
import type { Account } from './account.js';

export interface TransactionRequest {
  to?: Address;
  value?: bigint;
  data?: Hex;
  nonce?: number;
  chainId?: number;
  // Legacy
  gasPrice?: bigint;
  gasLimit?: bigint;
  // EIP-1559
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  // EIP-2930
  accessList?: AccessList;
  // Type override
  type?: 'legacy' | 'eip2930' | 'eip1559';
}

/**
 * Transaction builder
 */
export class TransactionBuilder {
  private readonly tx: TransactionRequest;

  private constructor(tx: TransactionRequest) {
    this.tx = { ...tx };
  }

  /**
   * Create a new transaction builder
   */
  static create(tx: TransactionRequest = {}): TransactionBuilder {
    return new TransactionBuilder(tx);
  }

  /**
   * Set recipient address
   */
  to(address: Address): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, to: address });
  }

  /**
   * Set value in Wei
   */
  value(amount: bigint): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, value: amount });
  }

  /**
   * Set call data
   */
  data(data: Hex): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, data });
  }

  /**
   * Set nonce
   */
  nonce(nonce: number): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, nonce });
  }

  /**
   * Set chain ID
   */
  chainId(chainId: number): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, chainId });
  }

  /**
   * Set gas limit
   */
  gasLimit(limit: bigint): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, gasLimit: limit });
  }

  /**
   * Set gas price (legacy)
   */
  gasPrice(price: bigint): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, gasPrice: price });
  }

  /**
   * Set max fee per gas (EIP-1559)
   */
  maxFeePerGas(fee: bigint): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, maxFeePerGas: fee });
  }

  /**
   * Set max priority fee per gas (EIP-1559)
   */
  maxPriorityFeePerGas(fee: bigint): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, maxPriorityFeePerGas: fee });
  }

  /**
   * Set access list (EIP-2930)
   */
  accessList(list: AccessList): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, accessList: list });
  }

  /**
   * Force transaction type
   */
  type(type: 'legacy' | 'eip2930' | 'eip1559'): TransactionBuilder {
    return new TransactionBuilder({ ...this.tx, type });
  }

  /**
   * Build the transaction object
   */
  build(): Transaction {
    const txType = this.determineType();

    switch (txType) {
      case 'eip1559':
        return this.buildEIP1559();
      case 'eip2930':
        return this.buildEIP2930();
      default:
        return this.buildLegacy();
    }
  }

  /**
   * Sign the transaction
   */
  sign(account: Account): SignedTransaction {
    const tx = this.build();
    return signTransaction(tx, account);
  }

  private determineType(): 'legacy' | 'eip2930' | 'eip1559' {
    if (this.tx.type) return this.tx.type;
    if (this.tx.maxFeePerGas !== undefined || this.tx.maxPriorityFeePerGas !== undefined) {
      return 'eip1559';
    }
    if (this.tx.accessList !== undefined) {
      return 'eip2930';
    }
    return 'legacy';
  }

  private buildLegacy(): LegacyTransaction {
    return {
      type: 'legacy',
      to: this.tx.to,
      value: this.tx.value,
      data: this.tx.data,
      nonce: this.tx.nonce,
      chainId: this.tx.chainId,
      gasPrice: this.tx.gasPrice,
      gasLimit: this.tx.gasLimit,
    };
  }

  private buildEIP2930(): EIP2930Transaction {
    return {
      type: 'eip2930',
      to: this.tx.to,
      value: this.tx.value,
      data: this.tx.data,
      nonce: this.tx.nonce,
      chainId: this.tx.chainId,
      gasPrice: this.tx.gasPrice,
      gasLimit: this.tx.gasLimit,
      accessList: this.tx.accessList ?? [],
    };
  }

  private buildEIP1559(): EIP1559Transaction {
    return {
      type: 'eip1559',
      to: this.tx.to,
      value: this.tx.value,
      data: this.tx.data,
      nonce: this.tx.nonce,
      chainId: this.tx.chainId,
      maxFeePerGas: this.tx.maxFeePerGas,
      maxPriorityFeePerGas: this.tx.maxPriorityFeePerGas,
      gasLimit: this.tx.gasLimit,
      accessList: this.tx.accessList ?? [],
    };
  }
}

/**
 * Sign a transaction with an account
 */
export function signTransaction(tx: Transaction, account: Account): SignedTransaction {
  const txType = tx.type ?? 'legacy';

  switch (txType) {
    case 'eip1559':
      return signEIP1559(tx as EIP1559Transaction, account);
    case 'eip2930':
      return signEIP2930(tx as EIP2930Transaction, account);
    default:
      return signLegacy(tx as LegacyTransaction, account);
  }
}

/**
 * Sign a legacy transaction
 */
function signLegacy(tx: LegacyTransaction, account: Account): SignedTransaction {
  const chainId = tx.chainId ?? 1;

  // Serialize for signing (EIP-155)
  const toSign = [
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.gasPrice !== undefined ? bigintToRlp(tx.gasPrice) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    bigintToRlp(BigInt(chainId)),
    new Uint8Array(),
    new Uint8Array(),
  ];

  const serialized = rlpEncode(toSign);
  const hash = keccak256(serialized) as Hash;
  const signature = account.sign(hash);

  // EIP-155: v = chainId * 2 + 35 + yParity
  const v = chainId * 2 + 35 + signature.yParity;

  // Serialize signed transaction
  const signed = [
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.gasPrice !== undefined ? bigintToRlp(tx.gasPrice) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    bigintToRlp(BigInt(v)),
    hexToBytes(signature.r),
    hexToBytes(signature.s),
  ];

  const raw = bytesToHex(rlpEncode(signed));
  const txHash = keccak256(raw) as Hash;

  return {
    raw,
    hash: txHash,
    transaction: tx,
    signature: { ...signature, v },
  };
}

/**
 * Sign an EIP-2930 transaction
 */
function signEIP2930(tx: EIP2930Transaction, account: Account): SignedTransaction {
  const chainId = tx.chainId ?? 1;

  // Serialize access list
  const accessList = (tx.accessList ?? []).map((item) => [
    hexToBytes(item.address),
    item.storageKeys.map((key) => hexToBytes(key)),
  ]);

  // Serialize for signing
  const toSign = [
    bigintToRlp(BigInt(chainId)),
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.gasPrice !== undefined ? bigintToRlp(tx.gasPrice) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    accessList,
  ];

  // Type 1 prefix
  const serialized = rlpEncode(toSign);
  const withType = new Uint8Array(1 + serialized.length);
  withType[0] = 0x01;
  withType.set(serialized, 1);

  const hash = keccak256(withType) as Hash;
  const signature = account.sign(hash);

  // Serialize signed transaction
  const signed = [
    bigintToRlp(BigInt(chainId)),
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.gasPrice !== undefined ? bigintToRlp(tx.gasPrice) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    accessList,
    bigintToRlp(BigInt(signature.yParity)),
    hexToBytes(signature.r),
    hexToBytes(signature.s),
  ];

  const signedSerialized = rlpEncode(signed);
  const raw = new Uint8Array(1 + signedSerialized.length);
  raw[0] = 0x01;
  raw.set(signedSerialized, 1);

  const txHash = keccak256(raw) as Hash;

  return {
    raw: bytesToHex(raw),
    hash: txHash,
    transaction: tx,
    signature,
  };
}

/**
 * Sign an EIP-1559 transaction
 */
function signEIP1559(tx: EIP1559Transaction, account: Account): SignedTransaction {
  const chainId = tx.chainId ?? 1;

  // Serialize access list
  const accessList = (tx.accessList ?? []).map((item) => [
    hexToBytes(item.address),
    item.storageKeys.map((key) => hexToBytes(key)),
  ]);

  // Serialize for signing
  const toSign = [
    bigintToRlp(BigInt(chainId)),
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.maxPriorityFeePerGas !== undefined ? bigintToRlp(tx.maxPriorityFeePerGas) : new Uint8Array(),
    tx.maxFeePerGas !== undefined ? bigintToRlp(tx.maxFeePerGas) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    accessList,
  ];

  // Type 2 prefix
  const serialized = rlpEncode(toSign);
  const withType = new Uint8Array(1 + serialized.length);
  withType[0] = 0x02;
  withType.set(serialized, 1);

  const hash = keccak256(withType) as Hash;
  const signature = account.sign(hash);

  // Serialize signed transaction
  const signed = [
    bigintToRlp(BigInt(chainId)),
    tx.nonce !== undefined ? bigintToRlp(BigInt(tx.nonce)) : new Uint8Array(),
    tx.maxPriorityFeePerGas !== undefined ? bigintToRlp(tx.maxPriorityFeePerGas) : new Uint8Array(),
    tx.maxFeePerGas !== undefined ? bigintToRlp(tx.maxFeePerGas) : new Uint8Array(),
    tx.gasLimit !== undefined ? bigintToRlp(tx.gasLimit) : new Uint8Array(),
    tx.to ? hexToBytes(tx.to) : new Uint8Array(),
    tx.value !== undefined ? bigintToRlp(tx.value) : new Uint8Array(),
    tx.data ? hexToBytes(tx.data) : new Uint8Array(),
    accessList,
    bigintToRlp(BigInt(signature.yParity)),
    hexToBytes(signature.r),
    hexToBytes(signature.s),
  ];

  const signedSerialized = rlpEncode(signed);
  const raw = new Uint8Array(1 + signedSerialized.length);
  raw[0] = 0x02;
  raw.set(signedSerialized, 1);

  const txHash = keccak256(raw) as Hash;

  return {
    raw: bytesToHex(raw),
    hash: txHash,
    transaction: tx,
    signature,
  };
}

/**
 * Convert bigint to RLP-ready bytes (minimal encoding)
 */
function bigintToRlp(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array();

  const bytes: number[] = [];
  let v = value;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v = v >> 8n;
  }
  return new Uint8Array(bytes);
}

/**
 * Parse a signed raw transaction
 */
export function parseTransaction(raw: Hex): Transaction & { signature: Signature } {
  const bytes = hexToBytes(raw);

  // Check transaction type
  const firstByte = bytes[0];

  if (firstByte === 0x01) {
    // EIP-2930
    return parseEIP2930(bytes.slice(1));
  }

  if (firstByte === 0x02) {
    // EIP-1559
    return parseEIP1559(bytes.slice(1));
  }

  // Legacy (RLP encoded list starting with 0xc0+)
  return parseLegacy(bytes);
}

function parseLegacy(bytes: Uint8Array): LegacyTransaction & { signature: Signature } {
  // Decode RLP
  const decoded = rlpDecode(bytes) as Uint8Array[];

  if (decoded.length !== 9) {
    throw new Error('Invalid legacy transaction');
  }

  const v = Number(bytesToBigint(decoded[6] as Uint8Array));
  const r = bytesToHex(decoded[7] as Uint8Array);
  const s = bytesToHex(decoded[8] as Uint8Array);

  // Calculate chain ID from v (EIP-155)
  let chainId: number | undefined;
  let yParity: 0 | 1;

  if (v >= 35) {
    chainId = Math.floor((v - 35) / 2);
    yParity = ((v - 35) % 2) as 0 | 1;
  } else {
    yParity = (v - 27) as 0 | 1;
  }

  return {
    type: 'legacy',
    nonce: Number(bytesToBigint(decoded[0] as Uint8Array)),
    gasPrice: bytesToBigint(decoded[1] as Uint8Array),
    gasLimit: bytesToBigint(decoded[2] as Uint8Array),
    to: (decoded[3] as Uint8Array).length > 0 ? (bytesToHex(decoded[3] as Uint8Array) as Address) : undefined,
    value: bytesToBigint(decoded[4] as Uint8Array),
    data: (decoded[5] as Uint8Array).length > 0 ? bytesToHex(decoded[5] as Uint8Array) : undefined,
    chainId,
    signature: { r, s, v, yParity },
  };
}

function parseEIP2930(bytes: Uint8Array): EIP2930Transaction & { signature: Signature } {
  const decoded = rlpDecode(bytes) as Uint8Array[];

  if (decoded.length !== 11) {
    throw new Error('Invalid EIP-2930 transaction');
  }

  const yParity = Number(bytesToBigint(decoded[8] as Uint8Array)) as 0 | 1;

  return {
    type: 'eip2930',
    chainId: Number(bytesToBigint(decoded[0] as Uint8Array)),
    nonce: Number(bytesToBigint(decoded[1] as Uint8Array)),
    gasPrice: bytesToBigint(decoded[2] as Uint8Array),
    gasLimit: bytesToBigint(decoded[3] as Uint8Array),
    to: (decoded[4] as Uint8Array).length > 0 ? (bytesToHex(decoded[4] as Uint8Array) as Address) : undefined,
    value: bytesToBigint(decoded[5] as Uint8Array),
    data: (decoded[6] as Uint8Array).length > 0 ? bytesToHex(decoded[6] as Uint8Array) : undefined,
    accessList: parseAccessList(Array.isArray(decoded[7]) ? decoded[7] : []),
    signature: {
      yParity,
      v: yParity + 27,
      r: bytesToHex(decoded[9] as Uint8Array),
      s: bytesToHex(decoded[10] as Uint8Array),
    },
  };
}

function parseEIP1559(bytes: Uint8Array): EIP1559Transaction & { signature: Signature } {
  const decoded = rlpDecode(bytes) as Uint8Array[];

  if (decoded.length !== 12) {
    throw new Error('Invalid EIP-1559 transaction');
  }

  const yParity = Number(bytesToBigint(decoded[9] as Uint8Array)) as 0 | 1;

  return {
    type: 'eip1559',
    chainId: Number(bytesToBigint(decoded[0] as Uint8Array)),
    nonce: Number(bytesToBigint(decoded[1] as Uint8Array)),
    maxPriorityFeePerGas: bytesToBigint(decoded[2] as Uint8Array),
    maxFeePerGas: bytesToBigint(decoded[3] as Uint8Array),
    gasLimit: bytesToBigint(decoded[4] as Uint8Array),
    to: (decoded[5] as Uint8Array).length > 0 ? (bytesToHex(decoded[5] as Uint8Array) as Address) : undefined,
    value: bytesToBigint(decoded[6] as Uint8Array),
    data: (decoded[7] as Uint8Array).length > 0 ? bytesToHex(decoded[7] as Uint8Array) : undefined,
    accessList: parseAccessList(Array.isArray(decoded[8]) ? decoded[8] : []),
    signature: {
      yParity,
      v: yParity + 27,
      r: bytesToHex(decoded[10] as Uint8Array),
      s: bytesToHex(decoded[11] as Uint8Array),
    },
  };
}

function parseAccessList(data: unknown[]): AccessList {
  return data.map((item) => {
    const arr = item as [Uint8Array, Uint8Array[]];
    return {
      address: bytesToHex(arr[0]) as Address,
      storageKeys: arr[1].map((key) => bytesToHex(key)) as Hash[],
    };
  });
}

function bytesToBigint(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== undefined) {
      result = (result << 8n) | BigInt(b);
    }
  }
  return result;
}
