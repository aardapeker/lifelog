import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  LibreCaslonText_400Regular,
  LibreCaslonText_400Regular_Italic,
  LibreCaslonText_700Bold,
} from '@expo-google-fonts/libre-caslon-text';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LockGate } from '../components/LockGate';
import { DB_NAME, migrate } from '../lib/db';
import { colors } from '../lib/theme';

// keep the logo on screen until fonts are ready, so there's no blank flash
SplashScreen.preventAutoHideAsync().catch(() => {});

// show check-ins even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

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

  // tapping a check-in opens the chat
  useEffect(() => {
    if (!loaded) return;
    const open = () => setTimeout(() => router.navigate('/chat'), 300);
    if (Notifications.getLastNotificationResponse()?.notification.request.content.data?.kind === 'checkin') open();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.content.data?.kind === 'checkin') open();
    });
    return () => sub.remove();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="light" />
      <LockGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="note/[id]" />
        <Stack.Screen name="recap/[id]" />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
      </LockGate>
    </SQLiteProvider>
  );
}
