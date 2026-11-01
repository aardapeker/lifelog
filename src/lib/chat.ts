import type { SQLiteDatabase } from 'expo-sqlite';
import { streamClaude, testClaude } from './claude';
import { getSetting, setSetting } from './db';
import { streamGemini, testGemini } from './gemini';
import { getKey, type Provider } from './keys';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type StreamOptions = {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  onText: (fullText: string) => void;
  signal?: AbortSignal;
};

type Adapter = {
  label: string;
  defaultModel: string;
  stream: (opts: StreamOptions) => Promise<string>;
  test: (apiKey: string, model: string) => Promise<void>;
};

// One adapter per provider. Adding OpenAI later = one more entry here.
export const PROVIDERS: Record<Provider, Adapter> = {
  anthropic: { label: 'Claude', defaultModel: 'claude-sonnet-5-5', stream: streamClaude, test: testClaude },
  gemini: { label: 'Gemini', defaultModel: 'gemini-3.8-flash', stream: streamGemini, test: testGemini },
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
