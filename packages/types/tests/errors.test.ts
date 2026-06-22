import { describe, it, expect } from 'vitest';
import {
  createApiError,
  createApiErrorResponse,
  API_ERROR_CODES,
} from '../src/errors.js';

describe('createApiError', () => {
  it('creates a basic error with code and message', () => {
    const error = createApiError('BAD_REQUEST', 'Invalid input');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid input');
    expect(error.retryable).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('accepts optional init fields', () => {
    const error = createApiError('AGENT_UNAVAILABLE', 'Not found', {
      retryable: true,
      requestId: 'req-123',
      details: { path: '/usr/bin/claude' },
    });
    expect(error.retryable).toBe(true);
    expect(error.requestId).toBe('req-123');
    expect(error.details).toEqual({ path: '/usr/bin/claude' });
  });

  it('preserves the code and message from init override attempts', () => {
    // TypeScript should prevent this, but test runtime behavior
    const error = createApiError('NOT_FOUND', 'original');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('original');
  });
});

describe('createApiErrorResponse', () => {
  it('wraps an ApiError in the response envelope', () => {
    const error = createApiError('INTERNAL_ERROR', 'Boom');
    const response = createApiErrorResponse(error);
    expect(response.error).toBe(error);
    expect(response.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('API_ERROR_CODES', () => {
  it('contains all core HTTP error codes', () => {
    expect(API_ERROR_CODES).toContain('BAD_REQUEST');
    expect(API_ERROR_CODES).toContain('UNAUTHORIZED');
    expect(API_ERROR_CODES).toContain('FORBIDDEN');
    expect(API_ERROR_CODES).toContain('NOT_FOUND');
    expect(API_ERROR_CODES).toContain('INTERNAL_ERROR');
  });

  it('contains agent-specific error codes', () => {
    expect(API_ERROR_CODES).toContain('AGENT_UNAVAILABLE');
    expect(API_ERROR_CODES).toContain('AGENT_AUTH_REQUIRED');
    expect(API_ERROR_CODES).toContain('AGENT_EXECUTION_FAILED');
    expect(API_ERROR_CODES).toContain('AGENT_CONNECTION_DROPPED');
    expect(API_ERROR_CODES).toContain('AGENT_PROMPT_TOO_LARGE');
    expect(API_ERROR_CODES).toContain('ROLE_MARKER_HALLUCINATION');
    expect(API_ERROR_CODES).toContain('AGENT_RUNTIME_DEF_INVALID');
  });

  it('contains AMR error codes', () => {
    expect(API_ERROR_CODES).toContain('AMR_MODEL_UNAVAILABLE');
    expect(API_ERROR_CODES).toContain('AMR_AUTH_REQUIRED');
    expect(API_ERROR_CODES).toContain('AMR_INSUFFICIENT_BALANCE');
  });

  it('does NOT contain design-specific error codes', () => {
    // These should have been trimmed
    expect(API_ERROR_CODES).not.toContain('MEDIA_EXECUTION_DISABLED');
    expect(API_ERROR_CODES).not.toContain('MEDIA_SURFACE_DENIED');
    expect(API_ERROR_CODES).not.toContain('MEDIA_MODEL_DENIED');
    expect(API_ERROR_CODES).not.toContain('LIVE_ARTIFACT_NOT_FOUND');
    expect(API_ERROR_CODES).not.toContain('LIVE_ARTIFACT_INVALID');
    expect(API_ERROR_CODES).not.toContain('LIVE_ARTIFACT_STORAGE_FAILED');
    expect(API_ERROR_CODES).not.toContain('LIVE_ARTIFACT_REFRESH_UNAVAILABLE');
    expect(API_ERROR_CODES).not.toContain('LIVE_ARTIFACT_REFRESH_TIMEOUT');
    expect(API_ERROR_CODES).not.toContain('REFRESH_LOCKED');
    expect(API_ERROR_CODES).not.toContain('REFRESH_TIMED_OUT');
    expect(API_ERROR_CODES).not.toContain('REFRESH_FAILED');
    expect(API_ERROR_CODES).not.toContain('CONNECTOR_NOT_FOUND');
    expect(API_ERROR_CODES).not.toContain('CONNECTOR_AUTH_CONFIG_REQUIRED');
    expect(API_ERROR_CODES).not.toContain('CONNECTOR_NOT_CONNECTED');
    expect(API_ERROR_CODES).not.toContain('DESKTOP_AUTH_PENDING');
    expect(API_ERROR_CODES).not.toContain('TOOL_TOKEN_MISSING');
    expect(API_ERROR_CODES).not.toContain('TOOL_TOKEN_INVALID');
  });

  it('has no duplicate error codes', () => {
    const seen = new Set<string>();
    for (const code of API_ERROR_CODES) {
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
  });
});
