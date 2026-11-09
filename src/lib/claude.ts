import { fetch } from 'expo/fetch';
import type { CompleteOptions, StreamOptions } from './chat';
import { readSSE } from './sse';
import { recordUsage, type Feature } from './usage';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_ROUNDS = 3;

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

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; json: string };

/**
 * Streams a reply. If the model calls a tool (search_notes), runs it,
 * hands back the result and keeps streaming, up to a few rounds.
 */
export async function streamClaude(opts: StreamOptions): Promise<string> {
  const messages: any[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = opts.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  let full = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { ...headers(opts.apiKey), accept: 'text/event-stream' },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 2048,
        system: opts.system,
        messages,
        stream: true,
        // last round: no tools, so the model has to answer
        ...(tools?.length && round < MAX_TOOL_ROUNDS ? { tools } : {}),
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(await readError(res));

    const blocks: Block[] = [];
    const roundStart = full;
    const used = { input: 0, output: 0 };
    await readSSE(res.body, (data) => {
      if (data.type === 'message_start') used.input = data.message?.usage?.input_tokens ?? 0;
      if (data.type === 'message_delta') used.output = data.usage?.output_tokens ?? used.output;
      if (data.type === 'content_block_start') {
        const b = data.content_block;
        blocks[data.index] =
          b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, json: '' } : { type: 'text', text: '' };
      } else if (data.type === 'content_block_delta') {
        const block = blocks[data.index];
        if (data.delta?.type === 'text_delta' && block?.type === 'text') {
          block.text += data.delta.text;
          full += data.delta.text;
          opts.onText(full);
        } else if (data.delta?.type === 'input_json_delta' && block?.type === 'tool_use') {
          block.json += data.delta.partial_json;
        }
      } else if (data.type === 'error') {
        throw new Error(`Claude: ${data.error?.message ?? 'stream error'}`);
      }
    });

    recordUsage({ provider: 'anthropic', model: opts.model, feature: 'chat', ...used });
    const calls = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b?.type === 'tool_use');
    if (!calls.length) return full;

    // keep a space between "let me check…" and the real answer
    if (full !== roundStart && !full.endsWith('\n')) full += '\n\n';

    messages.push({
      role: 'assistant',
      content: blocks.filter(Boolean).map((b) =>
        b.type === 'text'
          ? { type: 'text', text: b.text }
          : { type: 'tool_use', id: b.id, name: b.name, input: JSON.parse(b.json || '{}') },
      ),
    });
    const results = await Promise.all(
      calls.map(async (c) => {
        const tool = opts.tools?.find((t) => t.name === c.name);
        const content = tool ? await tool.run(JSON.parse(c.json || '{}')) : `Unknown tool ${c.name}`;
        return { type: 'tool_result', tool_use_id: c.id, content };
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  return full;
}

async function post(apiKey: string, body: { model: string } & Record<string, unknown>, feature: Feature, whole = false): Promise<string> {
  const res = await fetch(API_URL, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  recordUsage({ provider: 'anthropic', model: body.model, feature, input: json.usage?.input_tokens, output: json.usage?.output_tokens });
  // a reply cut off mid-sentence is worse than none: fail, and the job tries again next time
  if (whole && json.stop_reason === 'max_tokens') throw new Error('Claude ran out of room mid-reply. Try again, or pick fewer songs.');
  return json.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
}

export function completeClaude(opts: CompleteOptions): Promise<string> {
  return post(opts.apiKey, {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1500,
    ...(opts.temperature !== undefined ? { temperature: Math.min(1, opts.temperature) } : {}),
    system: opts.json ? `${opts.system}\n\nReply with a single JSON object and nothing else.` : opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
  }, opts.feature ?? 'background', true);
}

export function describeImageClaude(
  apiKey: string,
  model: string,
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  return post(apiKey, {
    model,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  }, 'photos');
}

/** Cheap one-token call used by the "Test" button in Settings. */
export async function testClaude(apiKey: string, model: string): Promise<void> {
  await post(apiKey, { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }, 'other');
}
