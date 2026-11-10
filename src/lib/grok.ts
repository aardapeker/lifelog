import { fetch } from 'expo/fetch';
import type { CompleteOptions, StreamOptions } from './chat';
import { friendlyAiError } from './aiErrors';
import { readSSE } from './sse';
import { recordUsage, type Feature } from './usage';

/*
 * Grok (xAI). Its API speaks the OpenAI chat-completions format: same messages, same tool calls,
 * same stream, just a different address. Voices and web search stay on Gemini.
 */
const API_URL = 'https://api.x.ai/v1/chat/completions';
const MAX_TOOL_ROUNDS = 3;

const headers = (apiKey: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${apiKey}` });

async function readError(res: { status: number; text(): Promise<string> }) {
  const text = await res.text();
  let message = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    message = j?.error?.message ?? j?.error ?? j?.code ?? message;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {}
  return friendlyAiError('Grok', res.status, message);
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };
const record = (model: string, feature: Feature, u?: Usage) =>
  recordUsage({ provider: 'xai', model, feature, input: u?.prompt_tokens, output: u?.completion_tokens });

type Call = { id: string; name: string; args: string };

/** Streams a reply; runs search_notes (or any tool) when Grok asks, up to a few rounds. */
export async function streamGrok(opts: StreamOptions): Promise<string> {
  const messages: any[] = [{ role: 'system', content: opts.system }, ...opts.messages.map((m) => ({ role: m.role, content: m.content }))];
  const tools = opts.tools?.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let full = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { ...headers(opts.apiKey), accept: 'text/event-stream' },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 2048,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        // last round: no tools, so the model has to answer
        ...(tools?.length && round < MAX_TOOL_ROUNDS ? { tools } : {}),
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(await readError(res));

    const roundStart = full;
    let roundText = '';
    const calls: Call[] = [];
    let usage: Usage | undefined;
    await readSSE(res.body, (data) => {
      if (data.error) throw new Error(`Grok: ${data.error?.message ?? 'stream error'}`);
      if (data.usage) usage = data.usage;
      const delta = data.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === 'string' && delta.content) {
        roundText += delta.content;
        full += delta.content;
        opts.onText(full);
      }
      for (const t of delta.tool_calls ?? []) {
        const c = (calls[t.index ?? 0] ??= { id: '', name: '', args: '' });
        if (t.id) c.id = t.id;
        if (t.function?.name) c.name = t.function.name;
        if (t.function?.arguments) c.args += t.function.arguments;
      }
    });

    record(opts.model, 'chat', usage);
    const asked = calls.filter(Boolean);
    if (!asked.length) return full;

    // keep a space between "let me check…" and the real answer
    if (full !== roundStart && !full.endsWith('\n')) full += '\n\n';
    messages.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: asked.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    });
    for (const c of asked) {
      const tool = opts.tools?.find((t) => t.name === c.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.args || '{}');
      } catch {}
      const content = tool ? await tool.run(args) : `Unknown tool ${c.name}`;
      messages.push({ role: 'tool', tool_call_id: c.id, content });
    }
  }
  return full;
}

async function post(apiKey: string, body: { model: string } & Record<string, unknown>, feature: Feature, whole = false): Promise<string> {
  const res = await fetch(API_URL, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: Usage };
  record(body.model, feature, json.usage);
  const choice = json.choices?.[0];
  // a reply cut off mid-sentence is worse than none: fail, and the job tries again next time
  if (whole && choice?.finish_reason === 'length') throw new Error('Grok ran out of room mid-reply. Try again, or pick fewer songs.');
  return choice?.message?.content ?? '';
}

export function completeGrok(opts: CompleteOptions): Promise<string> {
  return post(
    opts.apiKey,
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      ...(opts.temperature !== undefined ? { temperature: Math.min(2, opts.temperature) } : {}),
      // JSON mode: the API itself keeps the reply valid JSON (like Gemini's), so a long radio
      // script can't come back with a stray comma or brace
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: opts.json ? `${opts.system}\n\nReply with a single JSON object and nothing else.` : opts.system },
        { role: 'user', content: opts.prompt },
      ],
    },
    opts.feature ?? 'background',
    true,
  );
}

export function describeImageGrok(apiKey: string, model: string, base64: string, mimeType: string, prompt: string): Promise<string> {
  return post(
    apiKey,
    {
      model,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    'photos',
  );
}

/** Cheap call used by the "Test" button in Settings. */
export async function testGrok(apiKey: string, model: string): Promise<void> {
  await post(apiKey, { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }, 'other');
}
