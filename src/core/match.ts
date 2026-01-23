/**
 * Pattern Matching Utilities
 * Inspired by ts-pattern - exhaustive pattern matching for TypeScript
 *
 * Usage:
 * ```typescript
 * const result = match(error)
 *   .with({ code: 'INSUFFICIENT_FUNDS' }, (e) => `Need ${e.details.shortage.eth} more ETH`)
 *   .with({ code: 'DAILY_LIMIT_EXCEEDED' }, (e) => `Wait until ${e.details.resetsAt}`)
 *   .otherwise((e) => `Error: ${e.message}`);
 * ```
 */

import type { Result } from './result.js';
import { isOk } from './result.js';

// ============ Pattern Types ============

/**
 * Pattern that matches a specific shape
 */
export type Pattern<T> =
  | T
  | { [K in keyof T]?: Pattern<T[K]> }
  | ((value: T) => boolean);

/**
 * Check if a value matches a pattern
 */
function matchesPattern<T>(value: T, pattern: Pattern<T>): boolean {
  // Function pattern
  if (typeof pattern === 'function') {
    return (pattern as (value: T) => boolean)(value);
  }

  // Primitive equality
  if (typeof pattern !== 'object' || pattern === null) {
    return value === pattern;
  }

  // Object pattern matching
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  for (const key of Object.keys(pattern as object)) {
    const patternValue = (pattern as Record<string, unknown>)[key];
    const actualValue = (value as Record<string, unknown>)[key];

    if (!matchesPattern(actualValue, patternValue as Pattern<unknown>)) {
      return false;
    }
  }

  return true;
}

// ============ Match Builder ============

/**
 * Match builder for fluent pattern matching
 */
export class MatchBuilder<TInput, TOutput = never> {
  private readonly input: TInput;
  private readonly cases: Array<{
    pattern: Pattern<TInput>;
    handler: (input: TInput) => unknown;
  }> = [];

  constructor(input: TInput) {
    this.input = input;
  }

  /**
   * Add a case with a pattern
   */
  with<TPattern extends Pattern<TInput>, TResult>(
    pattern: TPattern,
    handler: (input: TInput) => TResult
  ): MatchBuilder<TInput, TOutput | TResult> {
    this.cases.push({
      pattern: pattern as Pattern<TInput>,
      handler,
    });
    return this as unknown as MatchBuilder<TInput, TOutput | TResult>;
  }

  /**
   * Add a case that matches when a predicate returns true
   */
  when<TResult>(
    predicate: (input: TInput) => boolean,
    handler: (input: TInput) => TResult
  ): MatchBuilder<TInput, TOutput | TResult> {
    this.cases.push({
      pattern: predicate,
      handler,
    });
    return this as unknown as MatchBuilder<TInput, TOutput | TResult>;
  }

  /**
   * Default case - must be called to execute the match
   */
  otherwise<TResult>(handler: (input: TInput) => TResult): TOutput | TResult {
    for (const { pattern, handler: caseHandler } of this.cases) {
      if (matchesPattern(this.input, pattern)) {
        return caseHandler(this.input) as TOutput | TResult;
      }
    }
    return handler(this.input);
  }

  /**
   * Execute match - throws if no case matches
   * Use this for exhaustive matching with discriminated unions
   */
  exhaustive(): TOutput {
    for (const { pattern, handler } of this.cases) {
      if (matchesPattern(this.input, pattern)) {
        return handler(this.input) as TOutput;
      }
    }
    throw new Error(`Non-exhaustive match: no pattern matched ${JSON.stringify(this.input)}`);
  }

  /**
   * Run match and return undefined if no case matches
   */
  run(): TOutput | undefined {
    for (const { pattern, handler } of this.cases) {
      if (matchesPattern(this.input, pattern)) {
        return handler(this.input) as TOutput;
      }
    }
    return undefined;
  }
}

/**
 * Start a pattern match
 */
export function match<T>(value: T): MatchBuilder<T> {
  return new MatchBuilder(value);
}

// ============ Result-Specific Matching ============

/**
 * Match builder specifically for Result types
 */
export class ResultMatchBuilder<T, E, TOutput = never> {
  private readonly result: Result<T, E>;
  private okHandler?: (value: T) => unknown;
  private errHandler?: (error: E) => unknown;
  private errPatterns: Array<{
    pattern: Pattern<E>;
    handler: (error: E) => unknown;
  }> = [];

  constructor(result: Result<T, E>) {
    this.result = result;
  }

  /**
   * Handle the Ok case
   */
  ok<TResult>(handler: (value: T) => TResult): ResultMatchBuilder<T, E, TOutput | TResult> {
    this.okHandler = handler;
    return this as unknown as ResultMatchBuilder<T, E, TOutput | TResult>;
  }

  /**
   * Handle the Err case
   */
  err<TResult>(handler: (error: E) => TResult): ResultMatchBuilder<T, E, TOutput | TResult> {
    this.errHandler = handler;
    return this as unknown as ResultMatchBuilder<T, E, TOutput | TResult>;
  }

  /**
   * Handle specific error patterns
   */
  errWith<TPattern extends Pattern<E>, TResult>(
    pattern: TPattern,
    handler: (error: E) => TResult
  ): ResultMatchBuilder<T, E, TOutput | TResult> {
    this.errPatterns.push({
      pattern: pattern as Pattern<E>,
      handler,
    });
    return this as unknown as ResultMatchBuilder<T, E, TOutput | TResult>;
  }

  /**
   * Execute the match
   */
  run(): TOutput {
    if (isOk(this.result)) {
      if (!this.okHandler) {
        throw new Error('No handler for Ok case');
      }
      return this.okHandler(this.result.value) as TOutput;
    }

    // Try error patterns first
    for (const { pattern, handler } of this.errPatterns) {
      if (matchesPattern(this.result.error, pattern)) {
        return handler(this.result.error) as TOutput;
      }
    }

    // Fall back to general error handler
    if (!this.errHandler) {
      throw new Error('No handler for Err case');
    }
    return this.errHandler(this.result.error) as TOutput;
  }
}

/**
 * Start a Result-specific match
 */
export function matchResult<T, E>(result: Result<T, E>): ResultMatchBuilder<T, E> {
  return new ResultMatchBuilder(result);
}

// ============ Discriminated Union Helpers ============

/**
 * Type guard for discriminated unions
 */
export function isType<T extends { type: string }, Type extends T['type']>(
  value: T,
  type: Type
): value is Extract<T, { type: Type }> {
  return value.type === type;
}

/**
 * Type guard for objects with a 'code' discriminant (like errors)
 */
export function isCode<T extends { code: string }, Code extends T['code']>(
  value: T,
  code: Code
): value is Extract<T, { code: Code }> {
  return value.code === code;
}

// ============ Wildcard Patterns ============

/**
 * Pattern that matches any value
 */
export const _ = Symbol('wildcard');
export type Wildcard = typeof _;

/**
 * Pattern that matches any string
 */
export function P_string(): (value: unknown) => value is string {
  return (value): value is string => typeof value === 'string';
}

/**
 * Pattern that matches any number
 */
export function P_number(): (value: unknown) => value is number {
  return (value): value is number => typeof value === 'number';
}

/**
 * Pattern that matches any bigint
 */
export function P_bigint(): (value: unknown) => value is bigint {
  return (value): value is bigint => typeof value === 'bigint';
}

/**
 * Pattern that matches any boolean
 */
export function P_boolean(): (value: unknown) => value is boolean {
  return (value): value is boolean => typeof value === 'boolean';
}

/**
 * Pattern that matches values greater than threshold
 */
export function P_gt(threshold: number | bigint): (value: unknown) => boolean {
  return (value) => {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value > threshold;
    }
    return false;
  };
}

/**
 * Pattern that matches values less than threshold
 */
export function P_lt(threshold: number | bigint): (value: unknown) => boolean {
  return (value) => {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value < threshold;
    }
    return false;
  };
}

/**
 * Pattern that matches values in a range
 */
export function P_between(min: number | bigint, max: number | bigint): (value: unknown) => boolean {
  return (value) => {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value >= min && value <= max;
    }
    return false;
  };
}

/**
 * Pattern that matches if value is in array
 */
export function P_oneOf<T>(...values: T[]): (value: unknown) => value is T {
  return (value): value is T => values.includes(value as T);
}

/**
 * Pattern that negates another pattern
 */
export function P_not<T>(pattern: Pattern<T>): (value: T) => boolean {
  return (value) => !matchesPattern(value, pattern);
}
