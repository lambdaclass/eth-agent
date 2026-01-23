/**
 * Bridge module - Cross-chain bridging support
 * Currently supports CCTP (Circle Cross-Chain Transfer Protocol) for USDC
 */

// Types
export {
  type CCTPDomain,
  type BridgeRequest,
  type BridgeInitResult,
  type BridgeCompleteResult,
  type BridgeStatus,
  type BridgeStatusResult,
  type AttestationStatus,
  type AttestationResponse,
  type BridgeProtocol,
  type BridgeLimits,
  type BridgeSpendingRecord,
  // Router types
  type RoutePreference,
  type BridgeQuote,
  type BridgeRouteComparison,
  type BridgeProtocolInfo,
  type BridgeFeeEstimate,
  type BridgeProtocolV2,
  type UnifiedBridgeResult,
  type UnifiedBridgeStatus,
  type BridgePreview,
} from './types.js';

// Constants
export {
  CCTP_CONTRACTS,
  CIRCLE_ATTESTATION_API,
  getCCTPConfig,
  getSupportedCCTPChains,
  isTestnet,
  getChainName,
  type CCTPChainConfig,
} from './constants.js';

// Errors
export {
  BridgeError,
  BridgeUnsupportedRouteError,
  BridgeDestinationNotAllowedError,
  BridgeAttestationTimeoutError,
  BridgeAttestationError,
  BridgeLimitError,
  BridgeSameChainError,
  BridgeCompletionError,
  BridgeApprovalError,
  BridgeNoRouteError,
  BridgeAllRoutesFailed,
  BridgeProtocolUnavailableError,
  BridgeQuoteExpiredError,
  BridgeValidationError,
  BridgeInsufficientLiquidityError,
  BridgeSlippageExceededError,
  type BridgeRecoveryInfo,
} from './errors.js';

// Router
export {
  BridgeRouter,
  createBridgeRouter,
  RouteSelector,
  createRouteSelector,
  ExplainBridge,
  createExplainer,
  // Tracking
  TrackingRegistry,
  createTrackingId,
  parseTrackingId,
  isValidTrackingId,
  getTrackingRegistry,
  // Validation
  BridgeValidator,
  createBridgeValidator,
  getDefaultValidator,
  validateRecipient,
  validateBridgeRequest,
  // Types
  type BridgeRouterConfig,
  type RouteInfo,
  type ProtocolRegistryEntry,
  type WaitOptions,
  type ScoredQuote,
  type SimpleBridgeOptions,
  type ScoringWeights,
  type ExplanationLevel,
  type ProtocolTrackingInfo,
  type ParsedTrackingId,
  type CreateTrackingIdOptions,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type BridgeValidatorConfig,
} from './router/index.js';

// CCTP implementation
export {
  CCTPBridge,
  createCCTPBridge,
  AttestationClient,
  createAttestationClient,
  TokenMessengerContract,
  MessageTransmitterContract,
  decodeMessageHeader,
  decodeBurnMessageBody,
  TOKEN_MESSENGER_ABI,
  MESSAGE_TRANSMITTER_ABI,
  type CCTPBridgeConfig,
  type BridgePreviewResult,
  type AttestationClientConfig,
  type DepositForBurnParams,
  type DepositForBurnResult,
  type ReceiveMessageResult,
} from './cctp/index.js';
