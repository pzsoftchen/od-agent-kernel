import { describe, it, expect } from 'vitest';
import { createApiError } from '@od-kernel/types';
import { statusForError } from '../src/response.js';

describe('statusForError', () => {
  it('returns 400 for BAD_REQUEST', () => {
    const error = createApiError('BAD_REQUEST', 'nope');
    expect(statusForError(error)).toBe(400);
  });

  it('returns 401 for UNAUTHORIZED', () => {
    const error = createApiError('UNAUTHORIZED', 'no access');
    expect(statusForError(error)).toBe(401);
  });

  it('returns 403 for FORBIDDEN', () => {
    const error = createApiError('FORBIDDEN', 'no entry');
    expect(statusForError(error)).toBe(403);
  });

  it('returns 404 for NOT_FOUND', () => {
    const error = createApiError('NOT_FOUND', 'gone');
    expect(statusForError(error)).toBe(404);
  });

  it('returns 409 for CONFLICT', () => {
    const error = createApiError('CONFLICT', 'already exists');
    expect(statusForError(error)).toBe(409);
  });

  it('returns 413 for PAYLOAD_TOO_LARGE', () => {
    const error = createApiError('PAYLOAD_TOO_LARGE', 'too big');
    expect(statusForError(error)).toBe(413);
  });

  it('returns 415 for UNSUPPORTED_MEDIA_TYPE', () => {
    const error = createApiError('UNSUPPORTED_MEDIA_TYPE', 'bad type');
    expect(statusForError(error)).toBe(415);
  });

  it('returns 422 for VALIDATION_FAILED', () => {
    const error = createApiError('VALIDATION_FAILED', 'invalid');
    expect(statusForError(error)).toBe(422);
  });

  it('returns 429 for RATE_LIMITED', () => {
    const error = createApiError('RATE_LIMITED', 'slow down');
    expect(statusForError(error)).toBe(429);
  });

  it('returns 500 for INTERNAL_ERROR', () => {
    const error = createApiError('INTERNAL_ERROR', 'boom');
    expect(statusForError(error)).toBe(500);
  });

  it('returns 503 for AGENT_UNAVAILABLE', () => {
    const error = createApiError('AGENT_UNAVAILABLE', 'down');
    expect(statusForError(error)).toBe(503);
  });

  it('returns 502 for UPSTREAM_UNAVAILABLE', () => {
    const error = createApiError('UPSTREAM_UNAVAILABLE', 'upstream down');
    expect(statusForError(error)).toBe(502);
  });

  it('defaults to 500 for unknown error codes', () => {
    // Use a fabricated code to verify the default fallback.
    const error = createApiError('MADE_UP_CODE' as never, 'unknown');
    expect(statusForError(error)).toBe(500);
  });
});
