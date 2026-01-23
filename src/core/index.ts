/**
 * Core primitives layer
 * Zero-dependency building blocks for Ethereum
 */

// Types
export type {
  Hex,
  Address,
  Hash,
  Signature,
  TransactionType,
  TransactionBase,
  LegacyTransaction,
  EIP2930Transaction,
  EIP1559Transaction,
  Transaction,
  AccessList,
  AccessListItem,
  SignedTransaction,
  TransactionReceipt,
  Log,
  Block,
  TransactionResponse,
  ABIType,
  ABIParameter,
  ABIFunction,
  ABIEvent,
  ABIError,
  ABIConstructor,
  ABIFallback,
  ABIReceive,
  ABIItem,
  ABI,
  Amount,
  GasPrices,
  Chain,
  RPCError,
  JSONRPCRequest,
  JSONRPCResponse,
} from './types.js';

// Hex utilities
export {
  isHex,
  assertHex,
  bytesToHex,
  hexToBytes,
  numberToHex,
  hexToNumber,
  hexToBigInt,
  bigIntToHex,
  padHex,
  trimHex,
  concatHex,
  hexLength,
  sliceHex,
  hexEquals,
  stringToHex,
  hexToString,
  boolToHex,
  hexToBool,
} from './hex.js';

// RLP encoding
export {
  encode as rlpEncode,
  decode as rlpDecode,
  encodeHex as rlpEncodeHex,
  decodeHex as rlpDecodeHex,
} from './rlp.js';
export type { RLPInput } from './rlp.js';

// Hash functions
export {
  keccak256,
  sha256,
  ripemd160,
  functionSelector,
  eventTopic,
  hashMessage,
  typeHash,
  domainSeparator,
} from './hash.js';
export type { TypedDataDomain, TypedDataField, TypedData } from './hash.js';

// Signature utilities
export {
  generatePrivateKey,
  privateKeyToPublicKey,
  publicKeyToAddress,
  privateKeyToAddress,
  sign,
  signMessage,
  recoverPublicKey,
  recoverAddress,
  verify,
  serializeSignature,
  deserializeSignature,
  isValidPrivateKey,
} from './signature.js';

// Address utilities
export {
  isAddress,
  assertAddress,
  toChecksumAddress,
  isChecksumValid,
  normalizeAddress,
  addressEquals,
  isZeroAddress,
  ZERO_ADDRESS,
  padToAddress,
  extractAddress,
  computeContractAddress,
  computeCreate2Address,
} from './address.js';

// Units
export {
  ETH,
  GWEI,
  WEI,
  parseAmount,
  parseUnits,
  formatUnits,
  formatETH,
  formatGWEI,
  formatAuto,
  convertDecimals,
  TOKEN_DECIMALS,
  getTokenDecimals,
  parseTokenAmount,
  mulPercent,
  addPercent,
  toPercent,
} from './units.js';

// ABI encoding
export {
  encodeFunctionCall,
  decodeFunctionCall,
  encodeFunctionResult,
  decodeFunctionResult,
  functionSelector as abiSelector,
  eventTopic as abiEventTopic,
  encodeEventTopics,
  decodeEventLog,
  encodeParameters,
  decodeParameters,
  getFunction,
  getEvent,
} from './abi.js';

// Result type for explicit error handling
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  match as matchResult,
  fromPromise,
  fromThrowable,
  combine,
  ResultAsync,
} from './result.js';
export type { Ok, Err, Result } from './result.js';

// Pattern matching utilities
export {
  match,
  matchResult as matchResultPattern,
  MatchBuilder,
  ResultMatchBuilder,
  isType,
  isCode,
  _,
  P_string,
  P_number,
  P_bigint,
  P_boolean,
  P_gt,
  P_lt,
  P_between,
  P_oneOf,
  P_not,
} from './match.js';
export type { Pattern, Wildcard } from './match.js';

// ABI type inference utilities
export {
  defineAbi,
  isFunctionName,
} from './abi-types.js';

// Cache utilities
export { LRUCache } from './cache.js';
export type {
  TypedAbi,
  TypedAbiFunction,
  TypedAbiEvent,
  TypedAbiParameter,
  TypedAbiItem,
  SolidityToTS,
  ExtractAbiFunction,
  ExtractAbiEvent,
  AbiFunctionNames,
  AbiEventNames,
  AbiReadFunctionNames,
  AbiWriteFunctionNames,
  AbiFunctionInputs,
  AbiFunctionOutputs,
  AbiReturnType,
  AbiEventArgs,
  AbiParametersToTS,
  AbiParametersToObject,
  ContractReadMethods,
  ContractWriteMethods,
  TypedContractInterface,
} from './abi-types.js';
