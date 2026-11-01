import { fetch } from 'expo/fetch';
import type { StreamOptions } from './chat';
import { readSSE } from './sse';

const API_URL = 'https://api.anthropic.com/v1/messages';

function headers(apiKey: string) {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

async function readError(res: { status: number; text(): Promise<string> }) {
  const text = await res.text();
  try {
    return `Claude ${res.status}: ${JSON.parse(text)?.error?.message ?? text}`;
  } catch {
    return `Claude ${res.status}: ${text.slice(0, 300)}`;
  }
}

export async function streamClaude(opts: StreamOptions): Promise<string> {
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

  let full = '';
  await readSSE(res.body, (data) => {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      full += data.delta.text;
      opts.onText(full);
    } else if (data.type === 'error') {
      throw new Error(`Claude: ${data.error?.message ?? 'stream error'}`);
    }
  });
  return full;
}

/** Cheap one-token call used by the "Test" button in Settings. */
export async function testClaude(apiKey: string, model: string): Promise<void> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
