import * as SecureStore from 'expo-secure-store';

// API keys live in Android's encrypted keystore — never in SQLite, never in backups.
export type Provider = 'anthropic' | 'gemini' | 'xai';

const storageKey = (p: Provider) => `apikey.${p}`;

export function getKey(p: Provider): Promise<string | null> {
  return SecureStore.getItemAsync(storageKey(p));
}

export async function setKey(p: Provider, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed) await SecureStore.setItemAsync(storageKey(p), trimmed);
  else await SecureStore.deleteItemAsync(storageKey(p));
}

export function maskKey(key: string | null): string {
  if (!key) return 'Not set';
  return key.length <= 10 ? '••••••' : `${key.slice(0, 6)}••••${key.slice(-4)}`;
}
