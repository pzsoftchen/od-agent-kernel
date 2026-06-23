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
  /** Feed a text delta for the current message. Returns the safe portion to emit. */
  feedText(text: string): string;
  /** Whether a fabricated marker was detected (further text is dropped). */
  readonly contaminated: boolean;
  /** If contaminated, the warning event to emit. `null` if clean. */
  warningEvent(): { type: 'fabricated_role_marker'; marker: string; messageId: string } | null;
}

export interface CreateRoleMarkerGuardOptions {
  /** Unique message ID for correlation in logs/events. */
  messageId?: string;
}

export function createRoleMarkerGuard(
  options: CreateRoleMarkerGuardOptions | string = {},
): RoleMarkerGuard {
  if (typeof options === 'string') {
    options = { messageId: options };
  }
  const messageId = options.messageId ?? '';
  let contaminated = false;
  let accumulated = '';

  const guard: RoleMarkerGuard = {
    get contaminated() {
      return contaminated;
    },

    warningEvent() {
      if (!contaminated) return null;
      return {
        type: 'fabricated_role_marker' as const,
        marker: '## role',
        messageId,
      };
    },

    feedText(text: string): string {
      if (contaminated) return text;

      // Check if the accumulated text + new text contains a fabricated marker
      const checkText = accumulated + text;
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
      // Keep the last 20 chars to catch markers split across texts
      accumulated = checkText.slice(-20);
      return text;
    },
  };

  return guard;
}
