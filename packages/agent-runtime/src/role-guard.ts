/**
 * Streaming role-marker detection.
 * Ported from apps/daemon/src/role-marker-guard.ts.
 *
 * Detects fabricated `## user`, `## assistant`, `## system` markers
 * in agent output streams — a prompt-injection attack vector where the
 * model emits role markers that downstream chat renderers would parse
 * as real turn boundaries.
 */

/** Regex matching fabricated role markers in streaming agent output. */
export const FABRICATED_ROLE_MARKER_RE =
  /^##\s*(user|assistant|system)\s*$/im;

export interface RoleMarkerGuard {
  /** Feed raw text chunk into the guard. Returns accumulated clean text. */
  feedText(chunk: string): string;
  /** Whether the stream has been contaminated. */
  readonly contaminated: boolean;
  /** If contaminated, the warning event to emit. */
  readonly warningEvent: { type: 'warning'; reason: string } | null;
}

export interface CreateRoleMarkerGuardOptions {
  /** Unique message ID for correlation in logs/events. */
  messageId?: string;
}

export function createRoleMarkerGuard(
  options: CreateRoleMarkerGuardOptions = {},
): RoleMarkerGuard {
  const messageId = options.messageId ?? '';
  let contaminated = false;
  let accumulated = '';

  const guard: RoleMarkerGuard = {
    get contaminated() {
      return contaminated;
    },

    get warningEvent() {
      if (!contaminated) return null;
      return {
        type: 'warning' as const,
        reason: `fabricated_role_marker_detected${messageId ? ` for message ${messageId}` : ''}`,
      };
    },

    feedText(chunk: string): string {
      if (contaminated) return chunk;

      // Check if the accumulated text + new chunk contains a fabricated marker
      const checkText = accumulated + chunk;
      if (FABRICATED_ROLE_MARKER_RE.test(checkText)) {
        contaminated = true;
        // Return text up to the marker, truncating the contamination
        const match = FABRICATED_ROLE_MARKER_RE.exec(checkText);
        if (match) {
          const cleanEnd = match.index;
          // Reset accumulated
          accumulated = '';
          return checkText.slice(0, cleanEnd);
        }
      }

      // No contamination — accumulate trailing partial match buffer
      // Keep the last 20 chars to catch markers split across chunks
      accumulated = checkText.slice(-20);
      return chunk;
    },
  };

  return guard;
}
