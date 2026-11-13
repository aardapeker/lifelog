import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

/*
 * What happens with a crash report on the next open: a popup with the report and a Copy button,
 * and (when a GitHub token is saved in Settings → Privacy) the report filed by itself as an issue in
 * Lifelog's repo, so Claude can read it there without screenshots. Only the crash report is sent:
 * no journal text.
 */

const REPO = 'aardapeker/lifelog';
const TOKEN = 'github.crashToken';

export const getCrashToken = () => SecureStore.getItemAsync(TOKEN);
export async function setCrashToken(v: string): Promise<void> {
  const t = v.trim();
  if (t) await SecureStore.setItemAsync(TOKEN, t);
  else await SecureStore.deleteItemAsync(TOKEN);
}

const build = () => `${Constants.expoConfig?.version ?? '?'} (${Constants.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode ?? '?'})`;

/** Files the report as a GitHub issue. Returns the issue number. */
export async function sendCrash(title: string, report: string, token?: string | null): Promise<number> {
  const t = token ?? (await getCrashToken());
  if (!t) throw new Error('No GitHub token saved (Settings → Privacy → Crash reports).');
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({
      title: `Crash: ${title} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      body: `Sent by Lifelog by itself after a crash.\n\nBuild: ${build()}\n\n\`\`\`\n${report.slice(0, 60_000)}\n\`\`\``,
      labels: ['crash'],
    }),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}${res.status === 401 || res.status === 403 ? ': check the token' : ''}.`);
  return ((await res.json()) as { number: number }).number;
}

/** The popup after a crash: the report, Copy, and the auto-send result. */
export async function showCrash(title: string, report: string): Promise<void> {
  let sent = '';
  const token = await getCrashToken().catch(() => null);
  if (token) {
    try {
      sent = `✅ Sent to GitHub as issue #${await sendCrash(title, report, token)}. Just tell Claude "check the crash".`;
    } catch (e) {
      sent = `⚠️ Couldn't send it: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  Alert.alert(title, `${sent ? `${sent}\n\n` : ''}${report.slice(0, 3000)}`, [
    {
      text: 'Copy',
      onPress: () => {
        Clipboard.setStringAsync(`${title}\nBuild: ${build()}\n\n${report}`).catch(() => {});
      },
    },
    { text: 'OK' },
  ]);
}
