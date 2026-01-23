/**
 * CCTP (Circle Cross-Chain Transfer Protocol) exports
 */

export { CCTPBridge, createCCTPBridge, type CCTPBridgeConfig, type BridgePreviewResult } from './cctp-bridge.js';
export { AttestationClient, createAttestationClient, type AttestationClientConfig } from './attestation.js';
export { TokenMessengerContract, TOKEN_MESSENGER_ABI, type DepositForBurnParams, type DepositForBurnResult } from './token-messenger.js';
export { MessageTransmitterContract, MESSAGE_TRANSMITTER_ABI, decodeMessageHeader, decodeBurnMessageBody, type ReceiveMessageResult } from './message-transmitter.js';
