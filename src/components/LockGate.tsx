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

export async function authenticate(prompt = 'Unlock your journal'): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel' });
  return res.success;
}

/** Covers the app until the fingerprint (or phone PIN) says it's you. Only active if enabled in Settings. */
export function LockGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [locked, setLocked] = useState<boolean | null>(null); // null = still checking
  const leftAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
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
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away > RELOCK_AFTER_MS && (await getSetting(db, 'lockEnabled')) === '1') {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [db, unlock]);

  if (locked === null) return <View style={styles.screen} />;
  if (!locked) return <>{children}</>;
  return (
    <View style={[styles.screen, styles.center]}>
      <Image source={require('../../assets/splash-icon.png')} style={styles.logo} />
      <Text style={styles.title}>Locked</Text>
      <Text style={styles.text}>Your journal is private.</Text>
      <PillButton label="Unlock" onPress={unlock} style={{ marginTop: 28, minWidth: 180 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { width: 96, height: 96, marginBottom: 28 },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.text },
  text: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted, marginTop: 8 },
});
