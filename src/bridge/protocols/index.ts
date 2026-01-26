/**
 * Bridge protocol adapters
 * Adapters wrap bridge implementations for use with BridgeRouter
 */

export { BaseBridgeAdapter, type BaseAdapterConfig } from './base-adapter.js';
export { CCTPAdapter, createCCTPAdapter, type CCTPAdapterConfig } from './cctp-adapter.js';
export { AcrossAdapter, createAcrossAdapter, type AcrossAdapterConfig } from './across-adapter.js';
