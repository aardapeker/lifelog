import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  LibreCaslonText_400Regular,
  LibreCaslonText_400Regular_Italic,
  LibreCaslonText_700Bold,
} from '@expo-google-fonts/libre-caslon-text';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { DB_NAME, migrate } from '../lib/db';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    LibreCaslonText_400Regular,
    LibreCaslonText_400Regular_Italic,
    LibreCaslonText_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="note/[id]" />
        <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
    </SQLiteProvider>
  );
}
