/**
 * ABI Type Inference Utilities
 * Inspired by viem's ABIType - infer TypeScript types from ABI definitions
 *
 * Usage:
 * ```typescript
 * const abi = [...] as const;  // Use const assertion
 * type Balance = AbiReturnType<typeof abi, 'balanceOf'>;  // bigint
 * ```
 */

import type { Address } from './types.js';

// ============ Primitive Type Mappings ============

/**
 * Map Solidity types to TypeScript types
 */
export type SolidityToTS<T extends string> =
  // Address
  T extends 'address' ? Address :
  // Booleans
  T extends 'bool' ? boolean :
  // Strings
  T extends 'string' ? string :
  // Bytes (fixed and dynamic)
  T extends 'bytes' ? `0x${string}` :
  T extends `bytes${infer _N}` ? `0x${string}` :
  // Unsigned integers
  T extends `uint${infer _N}` ? bigint :
  // Signed integers
  T extends `int${infer _N}` ? bigint :
  // Arrays of primitives
  T extends `${infer Base}[]` ? SolidityToTS<Base>[] :
  // Fallback
  unknown;

// ============ ABI Type Definitions ============

/**
 * Narrow ABI parameter type for type inference
 */
export interface TypedAbiParameter<
  TName extends string = string,
  TType extends string = string
> {
  readonly name: TName;
  readonly type: TType;
  readonly indexed?: boolean;
  readonly components?: readonly TypedAbiParameter[];
}

/**
 * Narrow ABI function type for type inference
 */
export interface TypedAbiFunction<
  TName extends string = string,
  TInputs extends readonly TypedAbiParameter[] = readonly TypedAbiParameter[],
  TOutputs extends readonly TypedAbiParameter[] = readonly TypedAbiParameter[],
  TStateMutability extends 'pure' | 'view' | 'nonpayable' | 'payable' = 'pure' | 'view' | 'nonpayable' | 'payable'
> {
  readonly type: 'function';
  readonly name: TName;
  readonly inputs: TInputs;
  readonly outputs: TOutputs;
  readonly stateMutability: TStateMutability;
}

/**
 * Narrow ABI event type for type inference
 */
export interface TypedAbiEvent<
  TName extends string = string,
  TInputs extends readonly TypedAbiParameter[] = readonly TypedAbiParameter[]
> {
  readonly type: 'event';
  readonly name: TName;
  readonly inputs: TInputs;
  readonly anonymous?: boolean;
}

/**
 * Typed ABI item
 */
export type TypedAbiItem =
  | TypedAbiFunction
  | TypedAbiEvent
  | { readonly type: 'constructor'; readonly inputs: readonly TypedAbiParameter[]; readonly stateMutability: 'nonpayable' | 'payable' }
  | { readonly type: 'fallback'; readonly stateMutability: 'nonpayable' | 'payable' }
  | { readonly type: 'receive'; readonly stateMutability: 'payable' }
  | { readonly type: 'error'; readonly name: string; readonly inputs: readonly TypedAbiParameter[] };

/**
 * Typed ABI array
 */
export type TypedAbi = readonly TypedAbiItem[];

// ============ Type Extraction Utilities ============

/**
 * Extract function from ABI by name
 */
export type ExtractAbiFunction<
  TAbi extends TypedAbi,
  TFunctionName extends string
> = Extract<TAbi[number], { type: 'function'; name: TFunctionName }>;

/**
 * Extract event from ABI by name
 */
export type ExtractAbiEvent<
  TAbi extends TypedAbi,
  TEventName extends string
> = Extract<TAbi[number], { type: 'event'; name: TEventName }>;

/**
 * Get all function names from ABI
 */
export type AbiFunctionNames<TAbi extends TypedAbi> =
  Extract<TAbi[number], { type: 'function' }> extends { name: infer N }
    ? N extends string ? N : never
    : never;

/**
 * Get all event names from ABI
 */
export type AbiEventNames<TAbi extends TypedAbi> =
  Extract<TAbi[number], { type: 'event' }> extends { name: infer N }
    ? N extends string ? N : never
    : never;

/**
 * Get read-only function names (view/pure)
 */
export type AbiReadFunctionNames<TAbi extends TypedAbi> =
  Extract<TAbi[number], { type: 'function'; stateMutability: 'view' | 'pure' }> extends { name: infer N }
    ? N extends string ? N : never
    : never;

/**
 * Get write function names (nonpayable/payable)
 */
export type AbiWriteFunctionNames<TAbi extends TypedAbi> =
  Extract<TAbi[number], { type: 'function'; stateMutability: 'nonpayable' | 'payable' }> extends { name: infer N }
    ? N extends string ? N : never
    : never;

// ============ Input/Output Type Inference ============

/**
 * Convert ABI parameters to TypeScript tuple type
 */
export type AbiParametersToTS<TParams extends readonly TypedAbiParameter[]> =
  TParams extends readonly []
    ? []
    : TParams extends readonly [infer First extends TypedAbiParameter, ...infer Rest extends readonly TypedAbiParameter[]]
      ? [SolidityToTS<First['type']>, ...AbiParametersToTS<Rest>]
      : unknown[];

/**
 * Convert ABI parameters to named object type
 */
export type AbiParametersToObject<TParams extends readonly TypedAbiParameter[]> = {
  [K in TParams[number] as K['name']]: SolidityToTS<K['type']>
};

/**
 * Get input types for a function
 */
export type AbiFunctionInputs<
  TAbi extends TypedAbi,
  TFunctionName extends string
> = ExtractAbiFunction<TAbi, TFunctionName> extends { inputs: infer I extends readonly TypedAbiParameter[] }
  ? AbiParametersToTS<I>
  : never;

/**
 * Get output type for a function (single value unwrapped, multiple as tuple)
 */
export type AbiFunctionOutputs<
  TAbi extends TypedAbi,
  TFunctionName extends string
> = ExtractAbiFunction<TAbi, TFunctionName> extends { outputs: infer O extends readonly TypedAbiParameter[] }
  ? O['length'] extends 0
    ? void
    : O['length'] extends 1
      ? SolidityToTS<O[0]['type']>
      : AbiParametersToTS<O>
  : never;

/**
 * Alias for output type
 */
export type AbiReturnType<
  TAbi extends TypedAbi,
  TFunctionName extends string
> = AbiFunctionOutputs<TAbi, TFunctionName>;

/**
 * Get event args type
 */
export type AbiEventArgs<
  TAbi extends TypedAbi,
  TEventName extends string
> = ExtractAbiEvent<TAbi, TEventName> extends { inputs: infer I extends readonly TypedAbiParameter[] }
  ? AbiParametersToObject<I>
  : never;

// ============ Typed Contract Interface ============

/**
 * Generate read methods interface from ABI
 */
export type ContractReadMethods<TAbi extends TypedAbi> = {
  [K in AbiReadFunctionNames<TAbi>]: (
    ...args: AbiFunctionInputs<TAbi, K>
  ) => Promise<AbiFunctionOutputs<TAbi, K>>;
};

/**
 * Generate write methods interface from ABI
 */
export type ContractWriteMethods<TAbi extends TypedAbi> = {
  [K in AbiWriteFunctionNames<TAbi>]: (
    ...args: AbiFunctionInputs<TAbi, K>
  ) => Promise<{ hash: `0x${string}`; wait: () => Promise<unknown> }>;
};

/**
 * Full typed contract interface
 */
export type TypedContractInterface<TAbi extends TypedAbi> = {
  read: ContractReadMethods<TAbi>;
  write: ContractWriteMethods<TAbi>;
};

// ============ Runtime Helpers ============

/**
 * Create a narrowly typed ABI (use with `as const`)
 * This is just an identity function that helps with type inference
 */
export function defineAbi<const TAbi extends TypedAbi>(abi: TAbi): TAbi {
  return abi;
}

/**
 * Type assertion helper for function names
 */
export function isFunctionName<TAbi extends TypedAbi>(
  _abi: TAbi,
  _name: string
): _name is AbiFunctionNames<TAbi> {
  return true; // Runtime check would validate against ABI
}
