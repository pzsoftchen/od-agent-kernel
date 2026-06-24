/**
 * Browser-side SSE event parser.
 * Zero DOM dependencies — works in any JS runtime with ReadableStream + TextDecoder.
 */

export type SseEvent =
  | { type: 'start'; payload: { runId: string; agentId: string; bin?: string; cwd?: string; model?: string } }
  | { type: 'agent'; payload: { type: string;[key: string]: unknown } }
  | { type: 'stdout'; payload: { chunk: string } }
  | { type: 'stderr'; payload: { chunk: string } }
  | { type: 'error'; payload: { message: string; error?: unknown } }
  | { type: 'end'; payload: { code: number; signal?: string; status?: string; resumable?: boolean } };

export async function* parseSseStream(response: Response): AsyncIterable<SseEvent> {
  if (!response.body) throw new Error('Response body is null');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          // SSE spec: multiple data: lines are concatenated with \n.
          // Only trim the first line; preserve inner whitespace for JSON payloads.
          if (currentData) {
            currentData += '\n' + line.slice(6);
          } else {
            currentData = line.slice(6).trim();
          }
        } else if (line === '' && currentEvent) {
          try {
            const payload = JSON.parse(currentData);
            yield { type: currentEvent as SseEvent['type'], payload };
          } catch {
            yield { type: 'error', payload: { message: 'Failed to parse SSE data' } };
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } catch (err) {
    yield { type: 'error', payload: { message: err instanceof Error ? err.message : String(err) } };
  } finally {
    reader.releaseLock();
  }
}
