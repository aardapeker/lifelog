import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, InfoTile, PillButton } from '../../components/ui';
import { indexPending } from '../../lib/embeddings';
import { deleteNote, entryTitle, formatTime, getNote, saveNote } from '../../lib/notes';
import { colors, fonts, radius } from '../../lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function NoteScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = id === 'new' ? null : Number(id);
  const [body, setBody] = useState('');
  const [createdAt, setCreatedAt] = useState<number>(Date.now());

  useEffect(() => {
    if (noteId === null) return;
    getNote(db, noteId).then((n) => {
      if (n) {
        setBody(n.body);
        setCreatedAt(n.created_at);
      }
    });
  }, [db, noteId]);

  const save = async () => {
    if (!body.trim()) {
      router.back();
      return;
    }
    await saveNote(db, noteId, body.trim());
    indexPending(db).catch(() => {}); // embed in the background, never block saving
    router.back();
  };

  const remove = () => {
    if (noteId === null) return router.back();
    Alert.alert('Delete this entry?', 'It will be gone for good, and your friend will forget it too.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNote(db, noteId);
          router.back();
        },
      },
    ]);
  };

  const d = new Date(createdAt);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 8 }]} behavior="padding">
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back without saving" onPress={() => router.back()} />
        <Text style={styles.barTitle}>
          {d.getDate()} {MONTHS[d.getMonth()]}
        </Text>
        {noteId !== null ? (
          <IconButton icon="trash-outline" label="Delete entry" onPress={remove} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{entryTitle(createdAt)}</Text>
        <View style={styles.tiles}>
          <InfoTile label="Written" value={formatTime(createdAt)} />
          <InfoTile label="Length" value={words === 1 ? '1 word' : `${words} words`} />
          <InfoTile label="Year" value={String(d.getFullYear())} />
        </View>
        <TextInput
          style={styles.input}
          multiline
          scrollEnabled={false}
          autoFocus={noteId === null}
          placeholder="What happened today?"
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={setBody}
          textAlignVertical="top"
          selectionColor={colors.text}
          cursorColor={colors.text}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <PillButton label="Save entry" onPress={save} full />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  barTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetContent: { padding: 22, paddingBottom: 40 },
  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 38, color: colors.text },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 22 },
  input: {
    minHeight: 240,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 26,
    color: colors.text,
    padding: 0,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface },
});
