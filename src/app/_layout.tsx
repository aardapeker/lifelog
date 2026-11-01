import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  LibreCaslonText_400Regular,
  LibreCaslonText_400Regular_Italic,
  LibreCaslonText_700Bold,
} from '@expo-google-fonts/libre-caslon-text';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { setPendingShare } from '../lib/share';
import { LockGate } from '../components/LockGate';
import { DB_NAME, migrate } from '../lib/db';
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
    const image = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'));
    setPendingShare({ text: (shareIntent.text ?? shareIntent.webUrl ?? '').trim(), imageUri: image?.path ?? null });
    resetShareIntent();
    setTimeout(() => router.push('/note/new?shared=1'), 300);
  }, [hasShareIntent, shareIntent, resetShareIntent]);
  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    LibreCaslonText_400Regular,
    LibreCaslonText_400Regular_Italic,
    LibreCaslonText_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  // tapping a check-in opens the chat, tapping a day-off reminder opens the plan
  useEffect(() => {
    if (!loaded) return;
    const handle = (data: Record<string, unknown> | undefined) => {
      if (data?.kind === 'checkin') setTimeout(() => router.navigate('/chat'), 300);
      if (data?.kind === 'planner' && typeof data.day === 'string') setTimeout(() => router.push(`/plan/${data.day}`), 300);
    };
    handle(Notifications.getLastNotificationResponse()?.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification.request.content.data));
    return () => sub.remove();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ShareIntentProvider>
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="light" />
      <LockGate>
      <ShareHandler />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="note/[id]" />
        <Stack.Screen name="recap/[id]" />
        <Stack.Screen name="goal/[id]" />
        <Stack.Screen name="person/[name]" />
        <Stack.Screen name="plan/[day]" />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
      </LockGate>
    </SQLiteProvider>
    </ShareIntentProvider>
  );
}
