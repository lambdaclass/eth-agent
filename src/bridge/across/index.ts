/**
 * Across Protocol bridge implementation
 * Fast, intent-based cross-chain bridging
 */

// Main bridge
export {
  AcrossBridge,
  createAcrossBridge,
  type AcrossBridgeConfig,
  type AcrossQuote,
  type AcrossBridgePreview,
} from './across-bridge.js';

// SpokePool contract
export {
  SpokePoolContract,
  createSpokePoolContract,
  SPOKE_POOL_ABI,
  V3_FUNDS_DEPOSITED_EVENT,
  type DepositV3Params,
  type DepositV3Result,
  type V3FundsDepositedEvent,
} from './spoke-pool.js';

// API client
export {
  AcrossApiClient,
  createAcrossApiClient,
  type AcrossQuoteRequest,
  type AcrossQuoteResponse,
  type AcrossSuggestedFeesResponse,
  type AcrossDepositStatusResponse,
  type AcrossRoutesResponse,
} from './api-client.js';

// Constants
export {
  ACROSS_CONTRACTS,
  ACROSS_API,
  getAcrossConfig,
  getSupportedAcrossChains,
  isAcrossTestnet,
  getAcrossTokenAddress,
  isTokenSupportedOnChain,
  getAcrossChainName,
  type AcrossChainConfig,
} from './constants.js';
