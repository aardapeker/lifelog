import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { openWrite } from '../lib/write';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { openNotification } from '../lib/notify';
import { router, Stack } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { isBackupFileName } from '../lib/backup';
import { clearCrash, lastCrash } from '../lib/crashLog';
import { RadioProvider } from '../lib/radioEngine';
import { setPendingBackup, setPendingShare } from '../lib/share';
import { useSQLiteContext } from 'expo-sqlite';
import { syncBackgroundTask } from '../lib/autonomy';
import { LockGate } from '../components/LockGate';
import { DB_NAME, getSetting, migrate } from '../lib/db';
import { haptic } from '../components/motion';
import { colors } from '../lib/theme';

// keep the logo on screen until fonts are ready, so there's no blank flash
SplashScreen.preventAutoHideAsync().catch(() => {});

// show check-ins even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Something was shared into Lifelog from another app: open a new entry with it. */
function ShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    // a backup file shared from the Drive app: restore it instead of making an entry
    const backup = shareIntent.files?.find((f) => isBackupFileName(f.fileName));
    if (backup) {
      setPendingBackup({ uri: backup.path, name: backup.fileName });
      resetShareIntent();
      setTimeout(() => router.push('/restore'), 300);
      return;
    }
    const image = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'));
    setPendingShare({ text: (shareIntent.text ?? shareIntent.webUrl ?? '').trim(), imageUri: image?.path ?? null });
    resetShareIntent();
    setTimeout(() => openWrite({ shared: true }), 300);
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

/** Registers (or removes) the Android background task to match Settings → On Its Own. */
function BackgroundSync() {
  const db = useSQLiteContext();
  useEffect(() => {
    syncBackgroundTask(db).catch((e) => console.warn('background task registration failed', e));
    getSetting(db, 'haptics', '1').then((v) => haptic.setEnabled(v === '1')).catch(() => {});
  }, [db]);
  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  // Lifelog closed because of an error last time: say what it was (screenshot it for a fix)
  useEffect(() => {
    if (!loaded) return;
    const crash = lastCrash();
    if (!crash) return;
    clearCrash();
    if (Date.now() - crash.at > 2 * 86_400_000) return;
    setTimeout(
      () =>
        Alert.alert(
          'Lifelog closed last time',
          `${crash.message}\n\n${crash.where}\n\n${new Date(crash.at).toLocaleString()}`,
          [{ text: 'OK' }],
        ),
      1200,
    );
  }, [loaded]);

  // tapping a check-in opens the chat, a day-off reminder the plan, a Read the article
  useEffect(() => {
    if (!loaded) return;
    // the same place the 🔔 inbox opens (see notify.ts)
    const handle = (data: Record<string, unknown> | undefined) => setTimeout(() => openNotification(data), 300);
    handle(Notifications.getLastNotificationResponse()?.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification.request.content.data));
    return () => sub.remove();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ShareIntentProvider>
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="light" />
      <RadioProvider>
      <LockGate>
      <ShareHandler />
      <BackgroundSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="milestone/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="entry/[id]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="note/[id]" options={{ animation: 'none' }} />
        <Stack.Screen name="recap/[id]" />
        <Stack.Screen name="wrapped/[month]" />
        <Stack.Screen name="goal/[id]" />
        <Stack.Screen name="person/[name]" />
        <Stack.Screen name="plan/[day]" />
        <Stack.Screen name="chats" />
        <Stack.Screen name="read/[id]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="research/[id]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="restore" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="spotify-auth" options={{ animation: 'none' }} />
        <Stack.Screen name="you" />
        <Stack.Screen name="settings/[section]" />
        <Stack.Screen name="inbox" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
      </LockGate>
      </RadioProvider>
    </SQLiteProvider>
    </ShareIntentProvider>
  );
}
