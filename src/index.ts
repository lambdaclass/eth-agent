/**
 * eth-agent
 * The simplest, safest way for AI agents to use Ethereum
 */

// Core primitives (re-export commonly needed items)
export {
  // Types
  type Hex,
  type Address,
  type Hash,
  type Signature,
  type Transaction,
  type TransactionReceipt,
  type Log,
  type Block,
  type ABI,
  type ABIFunction,
  type ABIEvent,

  // Hex utilities
  isHex,
  bytesToHex,
  hexToBytes,

  // Hash functions
  keccak256,

  // Address utilities
  isAddress,
  toChecksumAddress,

  // Units
  ETH,
  GWEI,
  WEI,
  parseUnits,
  formatUnits,
  parseAmount,
  formatETH,

  // Result type for explicit error handling
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  matchResult,
  ResultAsync,
  type Result,
  type Ok,
  type Err,

  // Pattern matching
  match,
  matchResultPattern,
  isType,
  isCode,
  P_string,
  P_number,
  P_bigint,
  P_gt,
  P_lt,
  P_between,
  P_oneOf,

  // ABI type inference
  defineAbi,
  type TypedAbi,
  type AbiReturnType,
  type AbiFunctionInputs,
  type AbiFunctionOutputs,
} from './core/index.js';

// Protocol layer (re-export commonly needed items)
export {
  // RPC
  RPCClient,
  type RPCOptions,

  // Account
  Account,
  EOA,

  // Transaction
  TransactionBuilder,

  // ENS
  ENS,
  namehash,
  resolveAddress,

  // Gas
  GasOracle,

  // Contract
  Contract,
  createContract,
  ERC20_ABI,
  ERC721_ABI,

  // Typed contracts with ABI inference
  createTypedContract,
  createERC20Contract,
  createERC721Contract,
  ERC20_TYPED_ABI,
  ERC721_TYPED_ABI,
  type TypedContract,
  type ERC20Contract,
  type ERC721Contract,

  // Price feeds
  PriceOracle,
  createPriceOracle,
  type PriceData,

  // Transaction acceleration
  TransactionAccelerator,
  createAccelerator,
  type AccelerationResult,
  type CancellationResult,

  // ERC-4337 Account Abstraction
  SmartAccount,
  createSmartAccount,
  BundlerClient,
  createBundler,
  createUserOp,
  getUserOpHash,
  ENTRY_POINT_V07,
  ENTRY_POINT_V06,
  type UserOperation,
  type SmartAccountConfig,
  type CallData,

  // Paymasters
  VerifyingPaymaster,
  RemotePaymaster,
  createVerifyingPaymaster,
  createRemotePaymaster,
  type Paymaster,
  type PaymasterResult,

  // Session keys
  SessionKeyManager,
  createSessionKeyManager,
  createSessionKey,
  type SessionKey,
  type SessionKeyPermissions,

  // Passkey accounts
  PasskeyAccount,
  createPasskeyAccount,
  P256_VERIFIER,
  type PasskeyCredential,
  type PasskeySignature,

  // Uniswap
  UniswapClient,
  createUniswapClient,
  isUniswapSupported,
  getDefaultDeadline,
  UNISWAP_ROUTER_ADDRESSES,
  WETH_ADDRESSES,
  FEE_TIERS,
  type SwapQuote,
  type SwapParams,
  type SwapExecutionResult,
  type FeeTier,
} from './protocol/index.js';

// Stablecoins
export {
  // Token definitions
  USDC,
  USDT,
  USDS,
  DAI,
  PYUSD,
  FRAX,
  STABLECOINS,
  // Types
  type StablecoinInfo,
  type StablecoinSymbol,
  // Utilities
  getStablecoinAddress,
  getStablecoinsForChain,
  isKnownStablecoin,
  parseStablecoinAmount,
  formatStablecoinAmount,
} from './stablecoins/index.js';

// Tokens (general token registry)
export {
  // Token types
  type TokenInfo,
  type TokenSymbol,
  // Native ETH
  ETH_TOKEN,
  // Common tokens
  WETH,
  UNI,
  LINK,
  WBTC,
  AAVE,
  CRV,
  MKR,
  SNX,
  LDO,
  TOKENS,
  // Utilities
  getTokenBySymbol,
  getTokenAddress,
  getTokensForChain,
  isKnownToken,
  resolveToken,
  parseTokenAmount,
  formatTokenAmount,
  isNativeETH,
  getWETHAddress,
} from './tokens/index.js';

// Agent layer (main export)
export {
  // Main wallet
  AgentWallet,
  createWallet,
  type AgentWalletConfig,
  type SendOptions,
  type SendResult,
  type BalanceResult,
  type TokenBalanceResult,
  type StablecoinBalanceResult,
  type StablecoinBalances,
  type SendStablecoinOptions,
  type SendStablecoinResult,
  type SwapOptions,
  type SwapQuoteResult,
  type SwapResult,

  // Limits
  LimitsEngine,
  type SpendingLimits,
  type StablecoinLimits,

  // Simulation
  SimulationEngine,
  explainSimulation,
  type SimulationResult,
  type SimulationOptions,

  // Approval
  ApprovalEngine,
  formatApprovalRequest,
  type ApprovalRequest,
  type ApprovalResponse,
  type ApprovalHandler,
  type ApprovalConfig,

  // Payment watcher
  PaymentWatcher,
  createPaymentWatcher,
  type IncomingPayment,
  type PaymentWatcherConfig,
  type PaymentHandler,
  type WaitForPaymentOptions,

  // Smart wallet (ERC-4337)
  SmartAgentWallet,
  createSmartWallet,
  type SmartWalletConfig,
  type BatchTransferItem,
  type BatchTransferResult,
  type SendStablecoinGaslessResult,

  // Errors
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
  // Swap errors
  SwapError,
  InsufficientLiquidityError,
  SlippageExceededError,
  TokenNotSupportedError,
  PriceImpactTooHighError,
  SwapLimitError,
  TokenNotAllowedError,
} from './agent/index.js';

// Safety presets
export const SafetyPresets = {
  /**
   * Conservative preset - very low limits, approval always required
   */
  CONSERVATIVE: {
    limits: {
      perTransaction: '0.01 ETH',
      perHour: '0.1 ETH',
      perDay: '0.5 ETH',
    },
    approvalConfig: {
      requireApprovalWhen: { always: true },
    },
  },

  /**
   * Balanced preset - moderate limits, approval for larger amounts
   */
  BALANCED: {
    limits: {
      perTransaction: '0.1 ETH',
      perHour: '1 ETH',
      perDay: '5 ETH',
    },
    approvalConfig: {
      requireApprovalWhen: {
        amountExceeds: '0.1 ETH',
        recipientIsNew: true,
      },
    },
  },

  /**
   * Aggressive preset - higher limits, approval only for very large amounts
   */
  AGGRESSIVE: {
    limits: {
      perTransaction: '1 ETH',
      perHour: '10 ETH',
      perDay: '50 ETH',
    },
    approvalConfig: {
      requireApprovalWhen: {
        amountExceeds: '1 ETH',
      },
    },
  },

  /**
   * No limits preset - for testing only, not recommended for production
   */
  UNLIMITED: {
    limits: {
      perTransaction: '1000000 ETH',
      perHour: '1000000 ETH',
      perDay: '1000000 ETH',
    },
    approvalConfig: {
      requireApprovalWhen: { always: false },
    },
  },
} as const;

// Version
export const VERSION = '0.1.0';
