import * as SecureStore from 'expo-secure-store';

// API keys live in Android's encrypted keystore — never in SQLite, never in backups.
export type Provider = 'anthropic' | 'gemini' | 'xai';

/** The AI providers, plus other services' keys (TMDB for Radar's movie cards). */
export type KeyName = Provider | 'tmdb';

const storageKey = (p: KeyName) => `apikey.${p}`;

export function getKey(p: KeyName): Promise<string | null> {
  return SecureStore.getItemAsync(storageKey(p));
}

export async function setKey(p: KeyName, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed) await SecureStore.setItemAsync(storageKey(p), trimmed);
  else await SecureStore.deleteItemAsync(storageKey(p));
}

export function maskKey(key: string | null): string {
  if (!key) return 'Not set';
  return key.length <= 10 ? '••••••' : `${key.slice(0, 6)}••••${key.slice(-4)}`;
}
