/**
 * Question-form detection in agent output streams.
 * Ported from apps/daemon/src/question-form-detect.ts.
 *
 * Detects renderable `<question-form>` / `<ask-question>` tags in agent output.
 * The chat UI renders these as interactive question forms rather than raw text.
 */

/** Regex to detect the opening of a question-form tag. */
export const QUESTION_FORM_OPEN_RE =
  /<(question-form|ask-question)\b[^>]*>/i;

/** Regex to find the closing tag of a question-form. */
export const QUESTION_FORM_CLOSE_RE =
  /<\/(question-form|ask-question)>/i;

/**
 * Check if a text block contains a renderable question form body — i.e. an
 * opening tag and (optionally) a closing tag with content between them.
 */
export function questionFormBodyIsRenderable(text: string): boolean {
  return QUESTION_FORM_OPEN_RE.test(text);
}

/**
 * Find the position of the closing tag in text.
 * Returns the index or -1 if not found.
 */
export function findQuestionFormCloseTag(text: string): number {
  const match = QUESTION_FORM_CLOSE_RE.exec(text);
  return match ? match.index : -1;
}

/**
 * Check if a full run's text output emitted a renderable question form.
 * Scans across chunk boundaries by joining all emitted text.
 */
export function emittedRenderableQuestionForm(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  let cursor = 0;
  while (cursor < text.length) {
    const m = QUESTION_FORM_OPEN_RE.exec(text.slice(cursor));
    if (!m) return false;
    const tagEnd = m.index + m[0].length;
    const body = text.slice(cursor + tagEnd);
    const closeIdx = findQuestionFormCloseTag(body);
    if (closeIdx >= 0) {
      const innerText = body.slice(0, closeIdx);
      // A question-form is renderable if it has content between tags
      return innerText.trim().length > 0;
    }
    // Open tag found but no close tag — might still be renderable
    return body.trim().length > 0;
  }
  return false;
}
