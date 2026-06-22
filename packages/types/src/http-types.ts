/**
 * HTTP routing types extracted from apps/daemon/src/http/types.ts.
 * These form the foundation of the type-safe JSON route framework.
 */

import type { ApiError } from './errors.js';

/** Discriminated union result type — success or typed error. */
export type Result<T, E = ApiError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Create a success Result. */
export function ok<T, E = ApiError>(value: T): Result<T, E> {
  return { ok: true, value };
}

/** Create an error Result. */
export function err<T = never, E = ApiError>(error: E): Result<T, E> {
  return { ok: false, error };
}

/** Raw input context extracted from an Express request. */
export interface RouteInputContext {
  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
}

/** Parser: transforms raw request context into typed input, or returns an error. */
export type InputParser<Input> = (raw: RouteInputContext) => Result<Input>;

/** Route handler: takes typed input and dependencies, returns a Result. */
export type Handler<Input, Output, Deps> = (
  input: Input,
  deps: Deps,
) => Promise<Result<Output>> | Result<Output>;

/** Supported HTTP methods for typed routes. */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Complete spec for a type-safe JSON route. */
export interface JsonRouteSpec<Input, Output, Deps> {
  method: HttpMethod;
  path: string;
  /** If true, enforces same-origin policy before the handler runs. */
  requireSameOrigin?: boolean;
  /** Parses raw request into typed input. */
  parse: InputParser<Input>;
  /** Core business logic. */
  handle: Handler<Input, Output, Deps>;
  /** HTTP status code on success (default 200). */
  successStatus?: number;
}
