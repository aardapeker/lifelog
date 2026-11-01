import { fetch } from 'expo/fetch';
import type { ChatMessage, StreamOptions } from './chat';
import { readSSE } from './sse';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function readError(res: { status: number; text(): Promise<string> }) {
  const text = await res.text();
  try {
    return `Gemini ${res.status}: ${JSON.parse(text)?.error?.message ?? text}`;
  } catch {
    return `Gemini ${res.status}: ${text.slice(0, 300)}`;
  }
}

// Gemini calls the assistant "model" and wraps text in parts
const toContents = (messages: ChatMessage[]) =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

export async function streamGemini(opts: StreamOptions): Promise<string> {
  const res = await fetch(`${BASE}/${opts.model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: toContents(opts.messages),
      generationConfig: { maxOutputTokens: 2048 },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(await readError(res));

  let full = '';
  await readSSE(res.body, (data) => {
    if (data.error) throw new Error(`Gemini: ${data.error.message ?? 'stream error'}`);
    const parts: { text?: string; thought?: boolean }[] = data.candidates?.[0]?.content?.parts ?? [];
    const delta = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    if (delta) {
      full += delta;
      opts.onText(full);
    }
  });
  if (!full) throw new Error('Gemini returned an empty reply (maybe blocked by safety filters).');
  return full;
}

/** Cheap call used by the "Test" button in Settings. */
export async function testGemini(apiKey: string, model: string): Promise<void> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
