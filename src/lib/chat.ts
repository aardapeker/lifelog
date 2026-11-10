import type { SQLiteDatabase } from 'expo-sqlite';
import type { Feature } from './usage';
import { completeClaude, describeImageClaude, streamClaude, testClaude } from './claude';
import { getSetting, setSetting } from './db';
import { completeGemini, describeImageGemini, streamGemini, testGemini } from './gemini';
import { completeGrok, describeImageGrok, streamGrok, testGrok } from './grok';
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
  temperature?: number; // 0 = predictable … 1+ = adventurous (left to the model when unset)
  lightThinking?: boolean; // creative writing, not puzzles: think a little (thinking is billed as output)
  feature?: Feature; // what it's for, on the Usage page (default: background)
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
    defaultModel: 'claude-haiku-5-5', // ~25x cheaper per call than Sonnet; Sonnet stays one tap away
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
  xai: {
    label: 'Grok',
    defaultModel: 'grok-4.3', // the cheaper Grok; 4.7 is one tap away
    backgroundModel: 'grok-4.3',
    stream: streamGrok,
    complete: completeGrok,
    describeImage: describeImageGrok,
    test: testGrok,
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

/** Models offered in Settings → AI Models (any other model name can still be typed for the chat). */
export const MODEL_CHOICES: Record<Provider, { id: string; label: string }[]> = {
  gemini: [
    { id: 'gemini-3.8-flash', label: '3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: '3.5 Flash-Lite' },
  ],
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  ],
  xai: [
    { id: 'grok-4.7', label: 'Grok 4.7' },
    { id: 'grok-4.3', label: 'Grok 4.3' },
  ],
};

/** The cheap model for background jobs (facts, captions, recaps, check-ins): yours, or the default. */
export async function getBackgroundModel(db: SQLiteDatabase, provider: Provider): Promise<string> {
  return getSetting(db, `backgroundModel.${provider}`, PROVIDERS[provider].backgroundModel);
}

/** The model that writes radio shows: '' means the same as the chat. */
export async function getRadioModel(db: SQLiteDatabase, provider: Provider): Promise<string> {
  return getSetting(db, `radioModel.${provider}`, '');
}

/** Same provider as the chat, but its cheap model. Null when no key is saved. */
export async function getBackgroundConfig(db: SQLiteDatabase) {
  const { provider, apiKey } = await getChatConfig(db);
  if (!apiKey) return null;
  const adapter = PROVIDERS[provider];
  return { provider, apiKey, model: await getBackgroundModel(db, provider), adapter };
}

/** Parses a JSON object out of a model reply, tolerating ```json fences or chatter around it. */
export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI did not return JSON.');
  return JSON.parse(text.slice(start, end + 1)) as T;
}
