import { fetch } from 'expo/fetch';
import type { ChatMessage, CompleteOptions, StreamOptions } from './chat';
import { readSSE } from './sse';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ROUNDS = 3;
// Gemini 3 models think before answering, and the thinking counts against maxOutputTokens.
// Our limits are meant for the answer itself, so thinking gets its own room on top.
const THINKING_ROOM = 8192;
const outputLimit = (answerTokens: number) => answerTokens + THINKING_ROOM;

async function readError(res: { status: number; text(): Promise<string> }) {
  const text = await res.text();
  try {
    return `Gemini ${res.status}: ${JSON.parse(text)?.error?.message ?? text}`;
  } catch {
    return `Gemini ${res.status}: ${text.slice(0, 300)}`;
  }
}

const jsonHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': apiKey });

// Gemini calls the assistant "model" and wraps text in parts
const toContents = (messages: ChatMessage[]) =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

type Part = { text?: string; thought?: boolean; functionCall?: { name: string; args?: Record<string, unknown> } };

/**
 * Streams a reply. Function calls (search_notes) are run and answered,
 * echoing the model's parts back unchanged (Gemini needs its thought signatures).
 */
export async function streamGemini(opts: StreamOptions): Promise<string> {
  const contents: any[] = toContents(opts.messages);
  const tools = opts.tools?.length
    ? [
        {
          functionDeclarations: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ]
    : undefined;
  let full = '';

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${BASE}/${opts.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: jsonHeaders(opts.apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        generationConfig: { maxOutputTokens: outputLimit(2048) },
        ...(tools && round < MAX_TOOL_ROUNDS ? { tools } : {}),
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(await readError(res));

    const parts: Part[] = [];
    const roundStart = full;
    await readSSE(res.body, (data) => {
      if (data.error) throw new Error(`Gemini: ${data.error.message ?? 'stream error'}`);
      for (const p of (data.candidates?.[0]?.content?.parts ?? []) as Part[]) {
        parts.push(p);
        if (p.text && !p.thought) {
          full += p.text;
          opts.onText(full);
        }
      }
    });

    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) break;
    if (full !== roundStart && !full.endsWith('\n')) full += '\n\n';

    contents.push({ role: 'model', parts });
    const responses = await Promise.all(
      calls.map(async (p) => {
        const { name, args } = p.functionCall!;
        const tool = opts.tools?.find((t) => t.name === name);
        const result = tool ? await tool.run(args ?? {}) : `Unknown tool ${name}`;
        return { functionResponse: { name, response: { result } } };
      }),
    );
    contents.push({ role: 'user', parts: responses });
  }
  if (!full) throw new Error('Gemini returned an empty reply (maybe blocked by safety filters).');
  return full;
}

async function generate(apiKey: string, model: string, body: object): Promise<string> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] };
  // a reply cut off mid-sentence is worse than none: fail, and the job tries again next time
  if (json.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('Gemini ran out of room mid-reply.');
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text) throw new Error('Gemini returned an empty reply.');
  return text;
}

export function completeGemini(opts: CompleteOptions): Promise<string> {
  return generate(opts.apiKey, opts.model, {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      maxOutputTokens: outputLimit(opts.maxTokens ?? 1500),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
}

export function describeImageGemini(
  apiKey: string,
  model: string,
  base64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  return generate(apiKey, model, {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
  });
}

export type Source = { title: string; uri: string };

export type GroundedResult = {
  text: string;
  sources: Source[];
  queries: string[];
  /** which sources back which part of the answer: segment text → source */
  supports: { text: string; source: Source }[];
};

/**
 * Asks Gemini with Google Search turned on. Returns the answer plus the pages it used,
 * the searches it ran (Google asks apps to show those), and which page backs which sentence.
 */
export async function groundedSearch(apiKey: string, model: string, prompt: string): Promise<GroundedResult> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: Part[] };
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: { web?: Source }[];
        groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
      };
    }[];
  };
  const c = json.candidates?.[0];
  const chunks = (c?.groundingMetadata?.groundingChunks ?? []).map((g) => (g.web?.uri ? g.web : null));
  const supports = (c?.groundingMetadata?.groundingSupports ?? []).flatMap((s) => {
    const source = (s.groundingChunkIndices ?? []).map((i) => chunks[i]).find((x): x is Source => !!x);
    return s.segment?.text && source ? [{ text: s.segment.text, source }] : [];
  });
  return {
    text: (c?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim(),
    sources: chunks.filter((x): x is Source => !!x).slice(0, 8),
    queries: c?.groundingMetadata?.webSearchQueries ?? [],
    supports,
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * The AI types links from memory and they are often dead (a guessed path on a real site).
 * So never trust them: link the page Google actually returned for that line, or a source on
 * the same site, or, if neither exists, a Google search for it, which always works.
 */
export function trustworthyLink(found: GroundedResult, line: string, guessed: string, searchFor: string): string {
  const key = line.toLocaleLowerCase('tr');
  const backed = found.supports.find((s) => {
    const seg = s.text.toLocaleLowerCase('tr').trim();
    return seg.length > 8 && (key.includes(seg.slice(0, 60)) || seg.includes(key.slice(0, 60)));
  });
  if (backed) return backed.source.uri;
  const host = hostOf(guessed);
  const sameSite = host && found.sources.find((s) => s.title.toLowerCase().includes(host) || host.includes(s.title.toLowerCase()));
  if (sameSite) return sameSite.uri;
  return `https://www.google.com/search?q=${encodeURIComponent(searchFor)}`;
}

/** Speech to text. Gemini only: Claude doesn't take audio. */
export function transcribeGemini(apiKey: string, model: string, base64: string, mimeType: string): Promise<string> {
  return generate(apiKey, model, {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text:
              'Transcribe this voice note word for word, in the language it is spoken in. ' +
              'Add normal punctuation. Output only the transcript, nothing else.',
          },
        ],
      },
    ],
  });
}

/** Cheap call used by the "Test" button in Settings. */
export async function testGemini(apiKey: string, model: string): Promise<void> {
  await generate(apiKey, model, { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
}
