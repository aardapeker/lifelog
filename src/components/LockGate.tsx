import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { getSetting } from '../lib/db';
import { colors, fonts } from '../lib/theme';
import { PillButton } from './ui';

const RELOCK_AFTER_MS = 30_000; // short trips to the camera or share sheet don't re-lock

export async function canUseBiometrics(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

const ask = (prompt: string) => LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel' });

/**
 * Fingerprint (or the phone's PIN). If an earlier prompt got lost (the app was switched away while it
 * was up), Android still thinks it's running and refuses every new one with "app_cancel": then the
 * stuck one is cancelled and we ask again, so the Unlock button can never go dead.
 */
export async function authenticate(prompt = 'Unlock your journal'): Promise<{ ok: boolean; error?: string }> {
  try {
    let res = await ask(prompt);
    if (!res.success && res.error === 'app_cancel') {
      await LocalAuthentication.cancelAuthenticate().catch(() => {});
      await new Promise((r) => setTimeout(r, 350)); // let the old prompt detach first
      res = await ask(prompt);
    }
    return res.success ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    await LocalAuthentication.cancelAuthenticate().catch(() => {});
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** What to say under the button when unlocking didn't work (cancelling is not an error). */
const why = (error?: string) =>
  !error || error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel'
    ? ''
    : error === 'lockout'
      ? 'Too many tries. Wait a bit, or use your phone PIN.'
      : error === 'not_enrolled' || error === 'not_available' || error === 'passcode_not_set'
        ? 'No fingerprint or screen lock is set on this phone.'
        : `Couldn't unlock (${error}). Try again.`;

/** Covers the app until the fingerprint (or phone PIN) says it's you. Only active if enabled in Settings. */
export function LockGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [locked, setLocked] = useState<boolean | null>(null); // null = still checking
  const leftAt = useRef<number | null>(null);

  const opened = useRef(false); // unlocked at least once this run: from then on the app stays mounted
  const [problem, setProblem] = useState('');
  const unlock = useCallback(async () => {
    setProblem('');
    const res = await authenticate();
    if (res.ok) {
      opened.current = true;
      setLocked(false);
    } else {
      setProblem(why(res.error));
    }
  }, []);

  useEffect(() => {
    getSetting(db, 'lockEnabled').then((v) => {
      const on = v === '1';
      setLocked(on);
      if (on) unlock();
    });
  }, [db, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      // (no cancelling here: on some phones the fingerprint dialog itself pauses the app;
      // a stuck prompt is cleared by the next attempt instead, see authenticate)
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away > RELOCK_AFTER_MS && (await getSetting(db, 'lockEnabled')) === '1') {
          setLocked(true);
          setTimeout(unlock, 400); // Android only shows the prompt once the app is fully back on screen
        }
      }
    });
    return () => sub.remove();
  }, [db, unlock]);

  if (locked === null) return <View style={styles.screen} />;
  if (!locked) opened.current = true;
  const lockScreen = (
    <View style={[styles.screen, styles.center, opened.current && StyleSheet.absoluteFill]}>
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
      <Text style={styles.title}>Locked</Text>
      <Text style={styles.text}>Your journal is private.</Text>
      <PillButton label="Unlock" onPress={unlock} style={{ marginTop: 28, minWidth: 180 }} />
      {!!problem && <Text style={[styles.text, { marginTop: 16, textAlign: 'center' }]}>{problem}</Text>}
    </View>
  );
  // before the first unlock nothing of the app exists yet; after that, re-locking only covers it,
  // so whatever was running (a radio show, a half-written entry, where you were) is still there
  if (!opened.current) return lockScreen;
  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked && lockScreen}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: 96, height: 96, marginBottom: 28 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 34, color: colors.text },
  text: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted, marginTop: 8 },
});
