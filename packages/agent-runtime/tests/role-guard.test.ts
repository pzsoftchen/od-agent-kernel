import { describe, it, expect } from 'vitest';
import {
  createRoleMarkerGuard,
  FABRICATED_ROLE_MARKER_RE,
} from '../src/role-guard.js';

describe('FABRICATED_ROLE_MARKER_RE', () => {
  it('matches ## user', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## user')).toBe(true);
  });

  it('matches ## assistant', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## assistant')).toBe(true);
  });

  it('matches ## system', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## system')).toBe(true);
  });

  it('matches with surrounding text', () => {
    expect(
      FABRICATED_ROLE_MARKER_RE.test(
        'Some text here\n## user\nmore text',
      ),
    ).toBe(true);
  });

  it('does not match regular text', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('This is a normal response')).toBe(
      false,
    );
  });

  it('does not match ## with different roles', () => {
    expect(FABRICATED_ROLE_MARKER_RE.test('## developer')).toBe(false);
  });
});

describe('createRoleMarkerGuard', () => {
  it('passes clean text through unchanged', () => {
    const guard = createRoleMarkerGuard();
    const result = guard.feedText('hello world');
    expect(result).toBe('hello world');
    expect(guard.contaminated).toBe(false);
  });

  it('detects contamination from single chunk', () => {
    const guard = createRoleMarkerGuard();
    guard.feedText('## user\nmore text');
    expect(guard.contaminated).toBe(true);
    const event = guard.warningEvent();
    expect(event).not.toBeNull();
    expect(event!.type).toBe('fabricated_role_marker');
  });

  it('detects contamination split across chunks', () => {
    const guard = createRoleMarkerGuard();
    guard.feedText('Some text\n## ');
    expect(guard.contaminated).toBe(false);
    guard.feedText('user\nrest of message');
    expect(guard.contaminated).toBe(true);
  });

  it('includes messageId in warning when provided', () => {
    const guard = createRoleMarkerGuard({ messageId: 'msg-123' });
    guard.feedText('## assistant');
    const event = guard.warningEvent();
    expect(event?.messageId).toBe('msg-123');
  });

  it('returns null warningEvent when not contaminated', () => {
    const guard = createRoleMarkerGuard();
    expect(guard.warningEvent()).toBeNull();
  });

  it('continues passing text through after contamination', () => {
    const guard = createRoleMarkerGuard();
    guard.feedText('## system');
    // After contamination, subsequent chunks pass through (caller handles truncation)
    const result = guard.feedText('more text');
    expect(result).toBe('more text');
  });
});
