/**
 * Protocol layer
 * Ethereum protocol implementation on top of primitives
 */

// RPC client
export { RPCClient, RPCRequestError } from './rpc.js';
export type { RPCOptions, FeeHistory } from './rpc.js';

// Account management
export { Account, EOA } from './account.js';
export type { Account as AccountInterface } from './account.js';

// Transactions
export { TransactionBuilder, signTransaction, parseTransaction } from './transaction.js';
export type { TransactionRequest } from './transaction.js';

// ENS
export { ENS, namehash, dnsEncode, isENSName, resolveAddress } from './ens.js';

// Nonce management
export { NonceManager, createNonceManager } from './nonce.js';
export type { NonceManagerConfig } from './nonce.js';

// Gas estimation
export { GasOracle, GAS_LIMITS, calculateTxCost } from './gas.js';
export type { GasEstimate, GasOracleConfig } from './gas.js';

// Contract interactions
export { Contract, createContract, ERC20_ABI, ERC721_ABI } from './contract.js';
export type { ContractConfig, CallOptions, WriteOptions, WriteResult } from './contract.js';

// Typed contracts with ABI inference
export {
  createTypedContract,
  createERC20Contract,
  createERC721Contract,
  ERC20_TYPED_ABI,
  ERC721_TYPED_ABI,
} from './typed-contract.js';
export type {
  TypedContract,
  TypedContractConfig,
  TypedReadMethods,
  TypedWriteMethods,
  TypedEventMethods,
  ERC20Contract,
  ERC721Contract,
} from './typed-contract.js';

// Price feeds
export { PriceOracle, createPriceOracle } from './price.js';
export type { PriceData, PriceOracleConfig } from './price.js';

// Transaction acceleration
export { TransactionAccelerator, createAccelerator } from './acceleration.js';
export type { PendingTransaction, AccelerationResult, CancellationResult } from './acceleration.js';

// ERC-4337 Account Abstraction
export {
  createUserOp,
  packUserOp,
  getUserOpHash,
  encodeUserOp,
  decodeUserOp,
  ENTRY_POINT_V07,
  ENTRY_POINT_V06,
} from './userop.js';
export type { UserOperation, PackedUserOperation } from './userop.js';

export { BundlerClient, BundlerError, createBundler, BUNDLER_URLS } from './bundler.js';
export type { BundlerConfig, UserOpReceipt, GasEstimate as BundlerGasEstimate } from './bundler.js';

export { SmartAccount, createSmartAccount } from './smart-account.js';
export type { SmartAccountConfig, CallData } from './smart-account.js';

export {
  VerifyingPaymaster,
  RemotePaymaster,
  ERC20Paymaster,
  createVerifyingPaymaster,
  createRemotePaymaster,
} from './paymaster.js';
export type { PaymasterConfig, PaymasterResult, Paymaster } from './paymaster.js';

// Session keys
export {
  SessionKeyManager,
  createSessionKeyManager,
  createSessionKey,
} from './session.js';
export type {
  SessionKey,
  SessionKeyPermissions,
  SessionKeySignature,
} from './session.js';

// Passkey accounts
export {
  PasskeyAccount,
  createPasskeyAccount,
  parseCOSEPublicKey,
  createAuthenticatorData,
  createClientDataJSON,
  base64UrlDecode,
  P256_VERIFIER,
} from './passkey.js';
export type {
  PasskeyCredential,
  PasskeySignature,
  WebAuthnData,
} from './passkey.js';
