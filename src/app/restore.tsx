import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, PillButton, StatusLine, type Status } from '../components/ui';
import { restoreFromUri, setPassphrase } from '../lib/backup';
import { clearPendingBackup, peekPendingBackup } from '../lib/share';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import { showAlert } from '../lib/dialog';

/** Opens when a .lifelog backup is shared into the app (Drive → ⋮ → Send a copy → Lifelog). */
export default function RestoreScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [backup] = useState(peekPendingBackup);
  const [pass, setPass] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const close = () => {
    clearPendingBackup();
    router.back();
  };

  const restore = () => {
    if (!backup) return;
    if (!pass.trim()) {
      setStatus({ kind: 'err', msg: 'Type the passphrase this backup was made with.' });
      return;
    }
    showAlert('Replace everything?', 'All entries, chats and settings on this phone are replaced with the backup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: async () => {
          setStatus({ kind: 'busy' });
          try {
            await restoreFromUri(db, backup.uri, pass);
            await setPassphrase(pass);
            clearPendingBackup();
            setStatus({ kind: 'ok', msg: 'Restored. Welcome back.' });
            setTimeout(() => router.replace('/'), 900);
          } catch (e) {
            setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 8 }]} behavior="padding">
      <View style={styles.bar}>
        <IconButton icon="close" label="Cancel" onPress={close} />
        <Text style={styles.barTitle}>Restore</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!backup ? (
          <Text style={styles.text}>No backup file was shared. Open it from the Drive app and send it to Lifelog.</Text>
        ) : (
          <>
            <Text style={styles.title}>{'Restore\nthis backup?'}</Text>
            <View style={styles.file}>
              <Text style={styles.fileLabel}>File</Text>
              <Text style={styles.fileName}>{backup.name}</Text>
            </View>
            <Text style={styles.text}>
              Everything on this phone (entries, chats, photos, settings) gets replaced with what's in the backup.
            </Text>
            <Text style={styles.label}>Backup passphrase</Text>
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={setPass}
              secureTextEntry
              autoCapitalize="none"
              autoFocus
              placeholder="The one you set when backing up"
              placeholderTextColor={colors.muted}
              {...inputColors}
            />
            <PillButton label="Restore" onPress={restore} full style={{ marginTop: 22 }} />
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 24 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 36, lineHeight: 42, color: colors.text, marginBottom: 20 },
  file: { backgroundColor: colors.raised, borderRadius: radius.sm, padding: 14, marginBottom: 16 },
  fileLabel: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginBottom: 4 },
  fileName: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.text },
  text: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 22 },
  input: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
});
