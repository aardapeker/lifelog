import type { SQLiteDatabase } from 'expo-sqlite';
import { completeClaude, describeImageClaude, streamClaude, testClaude } from './claude';
import { getSetting, setSetting } from './db';
import { completeGemini, describeImageGemini, streamGemini, testGemini } from './gemini';
import { getKey, type Provider } from './keys';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** A tool the model may call while answering (today: searching older journal entries). */
export type Tool = {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string }>; required: string[] };
  run: (args: Record<string, unknown>) => Promise<string>;
};

export type StreamOptions = {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  onText: (fullText: string) => void;
  tools?: Tool[];
  signal?: AbortSignal;
};

export type CompleteOptions = {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  json?: boolean; // ask for a JSON object back
  maxTokens?: number;
};

type Adapter = {
  label: string;
  defaultModel: string; // the friend you chat with
  backgroundModel: string; // cheap model for facts, captions, recaps, check-ins
  stream: (opts: StreamOptions) => Promise<string>;
  complete: (opts: CompleteOptions) => Promise<string>;
  describeImage: (apiKey: string, model: string, base64: string, mimeType: string, prompt: string) => Promise<string>;
  test: (apiKey: string, model: string) => Promise<void>;
};

// One adapter per provider. Adding OpenAI later = one more entry here.
export const PROVIDERS: Record<Provider, Adapter> = {
  anthropic: {
    label: 'Claude',
    defaultModel: 'claude-sonnet-5-5',
    backgroundModel: 'claude-haiku-5-5',
    stream: streamClaude,
    complete: completeClaude,
    describeImage: describeImageClaude,
    test: testClaude,
  },
  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-3.8-flash',
    backgroundModel: 'gemini-3.5-flash-lite',
    stream: streamGemini,
    complete: completeGemini,
    describeImage: describeImageGemini,
    test: testGemini,
  },
};

export type ChatConfig = { provider: Provider; model: string; apiKey: string | null };

const isProvider = (p: string): p is Provider => p in PROVIDERS;

export async function getChatModel(db: SQLiteDatabase, provider: Provider): Promise<string> {
  // 'chatModel' is the v0.1 setting name (Claude only)
  const legacy = provider === 'anthropic' ? await getSetting(db, 'chatModel') : '';
  return getSetting(db, `chatModel.${provider}`, legacy || PROVIDERS[provider].defaultModel);
}

/**
 * Which provider chats with you. If you never picked one,
 * it uses whichever key you have (Claude first).
 */
export async function getChatConfig(db: SQLiteDatabase): Promise<ChatConfig> {
  const saved = await getSetting(db, 'chatProvider');
  let provider: Provider;
  if (isProvider(saved)) {
    provider = saved;
  } else {
    provider = (await getKey('anthropic')) ? 'anthropic' : 'gemini';
  }
  return { provider, model: await getChatModel(db, provider), apiKey: await getKey(provider) };
}

export async function saveChatConfig(db: SQLiteDatabase, provider: Provider, model: string): Promise<void> {
  await setSetting(db, 'chatProvider', provider);
  await setSetting(db, `chatModel.${provider}`, model.trim() || PROVIDERS[provider].defaultModel);
}

/** Same provider as the chat, but its cheap model. Null when no key is saved. */
export async function getBackgroundConfig(db: SQLiteDatabase) {
  const { provider, apiKey } = await getChatConfig(db);
  if (!apiKey) return null;
  const adapter = PROVIDERS[provider];
  return { provider, apiKey, model: adapter.backgroundModel, adapter };
}

/** Parses a JSON object out of a model reply, tolerating ```json fences or chatter around it. */
export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI did not return JSON.');
  return JSON.parse(text.slice(start, end + 1)) as T;
}
