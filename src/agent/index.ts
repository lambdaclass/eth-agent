/**
 * Agent layer
 * Safe wallet abstractions for AI agents
 */

// Main wallet
export { AgentWallet, createWallet } from './wallet.js';
export type {
  AgentWalletConfig,
  SendOptions,
  SendResult,
  BalanceResult,
  TokenBalanceResult,
  StablecoinBalanceResult,
  StablecoinBalances,
  SendStablecoinOptions,
  SendStablecoinResult,
  BridgeUSDCOptions,
  BridgeUSDCResult,
} from './wallet.js';

// Limits engine
export { LimitsEngine } from './limits.js';
export type { SpendingLimits, StablecoinLimits, BridgeLimits } from './limits.js';

// Simulation engine
export { SimulationEngine, explainSimulation } from './simulation.js';
export type { SimulationResult, SimulationOptions, StateChange } from './simulation.js';

// Approval system
export { ApprovalEngine, formatApprovalRequest } from './approval.js';
export type {
  ApprovalRequest,
  ApprovalResponse,
  ApprovalHandler,
  ApprovalConfig,
} from './approval.js';

// Payment watcher
export { PaymentWatcher, createPaymentWatcher } from './watcher.js';
export type {
  IncomingPayment,
  PaymentWatcherConfig,
  PaymentHandler,
  WaitForPaymentOptions,
} from './watcher.js';

// Smart wallet (ERC-4337)
export { SmartAgentWallet, createSmartWallet } from './smart-wallet.js';
export type {
  SmartWalletConfig,
  BatchTransferItem,
  BatchTransferResult,
  SendStablecoinGaslessResult,
} from './smart-wallet.js';

// Errors
export {
  EthAgentError,
  NetworkError,
  ConnectionError,
  RateLimitError,
  TimeoutError,
  TransactionError,
  InsufficientFundsError,
  GasEstimationError,
  NonceError,
  RevertError,
  UnderpricedError,
  ValidationError,
  InvalidAddressError,
  InvalidAmountError,
  InvalidABIError,
  LimitError,
  TransactionLimitError,
  HourlyLimitError,
  DailyLimitError,
  StablecoinLimitError,
  ApprovalError,
  ApprovalDeniedError,
  ApprovalTimeoutError,
  AddressPolicyError,
  BlockedAddressError,
  UnknownAddressError,
  OperationPolicyError,
  OperationNotAllowedError,
  EmergencyStopError,
  BridgeLimitError,
  BridgeDestinationNotAllowedError,
} from './errors.js';
export type { ErrorDetails } from './errors.js';
