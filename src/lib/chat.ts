import type { SQLiteDatabase } from 'expo-sqlite';
import type { Feature } from './usage';
import { completeClaude, describeImageClaude, streamClaude, testClaude } from './claude';
import { getSetting, setSetting } from './db';
import { completeGemini, describeImageGemini, streamGemini, testGemini } from './gemini';
import { jsonrepair } from 'jsonrepair';
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

export type Job = 'radio' | 'background';

/**
 * Which provider a job runs on (Settings → AI): '' = the same as the chat. A job set to a provider
 * whose key isn't saved quietly uses the chat's provider, so nothing breaks.
 */
export async function getJobProvider(db: SQLiteDatabase, job: Job): Promise<Provider | ''> {
  const saved = await getSetting(db, `${job}Provider`, '');
  return isProvider(saved) ? saved : '';
}
export const setJobProvider = (db: SQLiteDatabase, job: Job, p: Provider | '') => setSetting(db, `${job}Provider`, p);

async function jobProvider(db: SQLiteDatabase, job: Job) {
  const chat = await getChatConfig(db);
  const own = await getJobProvider(db, job);
  const key = own && own !== chat.provider ? await getKey(own) : null;
  return key && own ? { chat, provider: own, apiKey: key as string | null } : { chat, provider: chat.provider, apiKey: chat.apiKey };
}

/** The cheap model for facts, captions, recaps, check-ins: on its own provider, or the chat's. Null when no key is saved. */
export async function getBackgroundConfig(db: SQLiteDatabase) {
  const { provider, apiKey } = await jobProvider(db, 'background');
  if (!apiKey) return null;
  const adapter = PROVIDERS[provider];
  return { provider, apiKey, model: await getBackgroundModel(db, provider), adapter };
}

/** Who writes the radio shows: its own provider and model, or the chat's. */
export async function getRadioConfig(db: SQLiteDatabase) {
  const { chat, provider, apiKey } = await jobProvider(db, 'radio');
  const own = await getRadioModel(db, provider);
  const model = own || (provider === chat.provider ? chat.model : await getChatModel(db, provider));
  return { provider, apiKey, model, adapter: PROVIDERS[provider] };
}

/**
 * For playful jobs (Bug Arena, Radar's TL;DRs): Gemini when its key is saved (cheap, and it's the
 * funny one), otherwise whatever the chat uses. Null when no key at all.
 */
export async function geminiFirst(db: SQLiteDatabase) {
  const gemini = await getKey('gemini');
  if (gemini) return { provider: 'gemini' as Provider, adapter: PROVIDERS.gemini, apiKey: gemini, model: await getChatModel(db, 'gemini') };
  const chat = await getChatConfig(db);
  return chat.apiKey ? { provider: chat.provider, adapter: PROVIDERS[chat.provider], apiKey: chat.apiKey, model: chat.model } : null;
}

/** Parses a JSON object out of a model reply, tolerating ```json fences or chatter around it. */
export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI did not return JSON.');
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body) as T;
  } catch {
    // small models slip on long JSON (a radio script is ~15 KB): a stray comma or brace, an
    // unescaped quote in a joke. Repair it instead of throwing away a whole written show.
    try {
      return JSON.parse(jsonrepair(body)) as T;
    } catch {
      throw new Error("The AI's reply came out garbled. Try again (or pick another writer in Settings → AI).");
    }
  }
}
