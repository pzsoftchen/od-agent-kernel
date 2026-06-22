import { describe, it, expect } from 'vitest';
import { rawInput, validationError } from '../src/parse.js';
import type { Request } from 'express';

describe('rawInput', () => {
  it('extracts body, query, and params from request', () => {
    const mockReq = {
      body: { message: 'hello' },
      query: { page: '1' },
      params: { id: '42' },
    } as unknown as Request;

    const input = rawInput(mockReq);
    expect(input.body).toEqual({ message: 'hello' });
    expect(input.query).toEqual({ page: '1' });
    expect(input.params).toEqual({ id: '42' });
  });

  it('handles missing body/query/params gracefully', () => {
    const mockReq = {
      body: undefined,
      query: undefined,
      params: undefined,
    } as unknown as Request;

    const input = rawInput(mockReq);
    expect(input.body).toBeUndefined();
    expect(input.query).toEqual({});
    expect(input.params).toEqual({});
  });
});

describe('validationError', () => {
  it('creates a BAD_REQUEST error without issues', () => {
    const error = validationError('Something is wrong');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Something is wrong');
    expect(error.details).toBeUndefined();
  });

  it('creates a BAD_REQUEST error with validation issues', () => {
    const error = validationError('Validation failed', [
      { path: 'name', message: 'Name is required' },
      { path: 'email', message: 'Invalid email format' },
    ]);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.details).toBeDefined();
    const details = error.details as { kind: string; issues: unknown[] };
    expect(details.kind).toBe('validation');
    expect(details.issues).toHaveLength(2);
  });
});
