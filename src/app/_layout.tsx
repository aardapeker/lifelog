import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { DB_NAME, migrate } from '../lib/db';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="note/[id]" options={{ title: 'Entry' }} />
      </Stack>
    </SQLiteProvider>
  );
}
