import { describe, it, expect } from 'vitest';
import {
  QUESTION_FORM_OPEN_RE,
  questionFormBodyIsRenderable,
  findQuestionFormCloseTag,
  emittedRenderableQuestionForm,
} from '../src/question-form-detect.js';

describe('QUESTION_FORM_OPEN_RE', () => {
  it('matches <question-form> tag', () => {
    expect(QUESTION_FORM_OPEN_RE.test('<question-form>')).toBe(true);
  });

  it('matches <question-form> with attributes', () => {
    expect(
      QUESTION_FORM_OPEN_RE.test(
        '<question-form id="q1" title="Test">',
      ),
    ).toBe(true);
  });

  it('matches <ask-question> tag', () => {
    expect(QUESTION_FORM_OPEN_RE.test('<ask-question>')).toBe(true);
  });

  it('does not match unrelated tags', () => {
    expect(QUESTION_FORM_OPEN_RE.test('<div>hello</div>')).toBe(false);
  });
});

describe('questionFormBodyIsRenderable', () => {
  it('returns true when opening tag is present', () => {
    expect(questionFormBodyIsRenderable('<question-form>content</question-form>')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(questionFormBodyIsRenderable('hello world')).toBe(false);
  });
});

describe('findQuestionFormCloseTag', () => {
  it('finds closing tag position', () => {
    const text = '<question-form>body</question-form>';
    const pos = findQuestionFormCloseTag(text);
    expect(pos).toBeGreaterThan(0);
    expect(text.slice(pos)).toBe('</question-form>');
  });

  it('returns -1 when no closing tag', () => {
    expect(findQuestionFormCloseTag('<question-form>unclosed')).toBe(-1);
  });
});

describe('emittedRenderableQuestionForm', () => {
  it('detects form with closing tag', () => {
    const text = 'Some prefix\n<question-form id="q">\nform body\n</question-form>';
    expect(emittedRenderableQuestionForm(text)).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(emittedRenderableQuestionForm('just text more text')).toBe(false);
  });

  it('returns false for empty/undefined input', () => {
    expect(emittedRenderableQuestionForm('')).toBe(false);
    expect(emittedRenderableQuestionForm(null)).toBe(false);
    expect(emittedRenderableQuestionForm(undefined)).toBe(false);
  });
});
