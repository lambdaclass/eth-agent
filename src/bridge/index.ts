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
} from './errors.js';

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
