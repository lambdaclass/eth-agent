/**
 * Result type for explicit error handling
 * Inspired by Rust's Result and neverthrow
 *
 * This provides an alternative to try/catch that makes errors
 * explicit in the type signature - particularly useful for AI agents
 * that need predictable error handling.
 */

import type { EthAgentError } from '../agent/errors.js';

/**
 * Represents a successful result
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly error?: never;
}

/**
 * Represents a failed result
 */
export interface Err<E> {
  readonly ok: false;
  readonly value?: never;
  readonly error: E;
}

/**
 * Result type - either Ok<T> or Err<E>
 */
export type Result<T, E = EthAgentError> = Ok<T> | Err<E>;

/**
 * Create a successful result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Type guard to check if result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard to check if result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map over a successful result
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map over a failed result
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain results (flatMap)
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Pattern match on a result
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  if (isOk(result)) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

/**
 * Convert a Promise to a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(error as E);
  }
}

/**
 * Convert a throwing function to a Result
 */
export function fromThrowable<T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(error as E);
  }
}

/**
 * Combine multiple results into one
 * Returns first error if any fail, otherwise array of values
 */
export function combine<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * ResultAsync - Result type for async operations
 * Wraps Promise<Result<T, E>> with chainable methods
 */
export class ResultAsync<T, E = EthAgentError> implements PromiseLike<Result<T, E>> {
  private readonly promise: Promise<Result<T, E>>;

  constructor(promise: Promise<Result<T, E>>) {
    this.promise = promise;
  }

  /**
   * Create from a Promise
   */
  static fromPromise<T, E = Error>(
    promise: Promise<T>,
    mapError?: (error: unknown) => E
  ): ResultAsync<T, E> {
    return new ResultAsync(fromPromise(promise, mapError));
  }

  /**
   * Create a successful ResultAsync
   */
  static ok<T, E>(value: T): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(ok(value) as Result<T, E>));
  }

  /**
   * Create a failed ResultAsync
   */
  static err<T, E>(error: E): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(err(error) as Result<T, E>));
  }

  /**
   * Make ResultAsync thenable
   */
  then<TResult1 = Result<T, E>, TResult2 = never>(
    onfulfilled?: ((value: Result<T, E>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  /**
   * Map over a successful async result
   */
  map<U>(fn: (value: T) => U): ResultAsync<U, E> {
    return new ResultAsync(
      this.promise.then((result) => map(result, fn))
    );
  }

  /**
   * Map over a failed async result
   */
  mapErr<F>(fn: (error: E) => F): ResultAsync<T, F> {
    return new ResultAsync(
      this.promise.then((result) => mapErr(result, fn))
    );
  }

  /**
   * Chain async results
   */
  andThen<U>(fn: (value: T) => ResultAsync<U, E>): ResultAsync<U, E> {
    return new ResultAsync(
      this.promise.then(async (result) => {
        if (isOk(result)) {
          return fn(result.value);
        }
        return result;
      })
    );
  }

  /**
   * Pattern match on async result
   */
  async match<U>(handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }): Promise<U> {
    const result = await this.promise;
    return match(result, handlers);
  }

  /**
   * Unwrap async result, throwing if error
   */
  async unwrap(): Promise<T> {
    const result = await this.promise;
    return unwrap(result);
  }

  /**
   * Unwrap async result with default
   */
  async unwrapOr(defaultValue: T): Promise<T> {
    const result = await this.promise;
    return unwrapOr(result, defaultValue);
  }

  /**
   * Check if result is Ok
   */
  async isOk(): Promise<boolean> {
    const result = await this.promise;
    return isOk(result);
  }

  /**
   * Check if result is Err
   */
  async isErr(): Promise<boolean> {
    const result = await this.promise;
    return isErr(result);
  }
}
