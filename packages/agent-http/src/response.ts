/**
 * HTTP response helpers for the typed JSON route framework.
 * Extracted from apps/daemon/src/http/response.ts.
 */

import type { Response } from 'express';
import {
  createApiErrorResponse,
  type ApiError,
  type ApiErrorCode,
} from '@od-kernel/types';

export function sendJson(res: Response, status: number, body: unknown): void {
  res.status(status).json(body);
}

export function sendApiError(res: Response, status: number, error: ApiError): void {
  res.status(status).json(createApiErrorResponse(error));
}

const ERROR_STATUS_BY_CODE: Partial<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  PROJECT_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  ARTIFACT_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  EMPTY_TRANSCRIPT: 422,
  INTERNAL_ERROR: 500,
  AGENT_UNAVAILABLE: 503,
  UPSTREAM_UNAVAILABLE: 502,
  AGENT_AUTH_REQUIRED: 401,
  AGENT_EXECUTION_FAILED: 500,
  AGENT_CONNECTION_DROPPED: 502,
  AGENT_PROMPT_TOO_LARGE: 413,
  OUTPUT_TOO_LARGE: 413,
  ROLE_MARKER_HALLUCINATION: 422,
  AGENT_RUNTIME_DEF_INVALID: 500,
  AMR_MODEL_UNAVAILABLE: 503,
  AMR_AUTH_REQUIRED: 401,
  AMR_INSUFFICIENT_BALANCE: 402,
  ARTIFACT_REGRESSION: 422,
  ARTIFACT_PUBLICATION_BLOCKED: 403,
  TEMPLATE_BINDING_INVALID: 422,
  REDACTION_REQUIRED: 422,
};

export function statusForError(error: ApiError): number {
  return ERROR_STATUS_BY_CODE[error.code] ?? 500;
}
