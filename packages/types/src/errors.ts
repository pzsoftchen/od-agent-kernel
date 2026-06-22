/**
 * Core API error types extracted from @open-design/contracts.
 *
 * Trimmed to remove design-specific error codes (MEDIA_*, LIVE_ARTIFACT_*,
 * CONNECTOR_*, TOOL_TOKEN_*, DESKTOP_AUTH_PENDING, etc.) while keeping
 * the core HTTP + Agent + AMR codes needed by the kernel.
 */

/** JSON-compatible value type used in error details. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const API_ERROR_CODES = [
  // Generic HTTP/API failures.
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  // Agent runtime failures.
  'AGENT_UNAVAILABLE',
  'AGENT_AUTH_REQUIRED',
  'AGENT_EXECUTION_FAILED',
  'AGENT_CONNECTION_DROPPED',
  'AGENT_PROMPT_TOO_LARGE',
  'ROLE_MARKER_HALLUCINATION',
  'AGENT_RUNTIME_DEF_INVALID',
  // AMR / model provider failures.
  'AMR_MODEL_UNAVAILABLE',
  'AMR_AUTH_REQUIRED',
  'AMR_INSUFFICIENT_BALANCE',
  // Resource not-found errors.
  'PROJECT_NOT_FOUND',
  'CONVERSATION_NOT_FOUND',
  'EMPTY_TRANSCRIPT',
  'FILE_NOT_FOUND',
  'ARTIFACT_NOT_FOUND',
  'ARTIFACT_REGRESSION',
  'ARTIFACT_PUBLICATION_BLOCKED',
  // Upstream / rate limiting.
  'UPSTREAM_UNAVAILABLE',
  'RATE_LIMITED',
  // Output / template errors.
  'OUTPUT_TOO_LARGE',
  'TEMPLATE_BINDING_INVALID',
  'REDACTION_REQUIRED',
  // Catch-all.
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: JsonValue;
  retryable?: boolean;
  requestId?: string;
  taskId?: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export type ApiValidationIssue = {
  /** Dot/bracket path, JSON pointer, or form field name that failed validation. */
  path: string;
  message: string;
  code?: string;
};

export type ApiValidationErrorDetails = {
  kind: 'validation';
  issues: ApiValidationIssue[];
};

/** Success payload or shared error envelope for agent-facing daemon tool endpoints. */
export type AgentToolApiResponse<TSuccess> = TSuccess | ApiErrorResponse;

export interface SseErrorPayload {
  message: string;
  error?: ApiError;
}

export function createApiError(
  code: ApiErrorCode,
  message: string,
  init: Omit<ApiError, 'code' | 'message'> = {},
): ApiError {
  return { code, message, ...init };
}

export function createApiErrorResponse(error: ApiError): ApiErrorResponse {
  return { error };
}
