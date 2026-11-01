import { fetch } from 'expo/fetch';

export const DEFAULT_CHAT_MODEL = 'claude-sonnet-5-5';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const API_URL = 'https://api.anthropic.com/v1/messages';

function headers(apiKey: string) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

async function readError(res: Response | { status: number; text(): Promise<string> }) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return `Claude ${res.status}: ${json?.error?.message ?? text}`;
  } catch {
    return `Claude ${res.status}: ${text.slice(0, 300)}`;
  }
}

/** Streams a reply. onText gets the full text so far on every token. */
export async function streamClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  onText: (fullText: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { ...headers(opts.apiKey), accept: 'text/event-stream' },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 2048,
      system: opts.system,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(await readError(res));

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE events are separated by a blank line
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = JSON.parse(line.slice(5).trim());
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
          full += data.delta.text;
          opts.onText(full);
        } else if (data.type === 'error') {
          throw new Error(`Claude: ${data.error?.message ?? 'stream error'}`);
        }
      }
    }
  }
  return full;
}

/** Cheap one-token call used by the "Test" button in Settings. */
export async function testClaudeKey(apiKey: string, model: string): Promise<void> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
