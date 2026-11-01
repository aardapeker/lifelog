import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { indexPending } from '../../lib/embeddings';
import { deleteNote, formatDate, getNote, saveNote } from '../../lib/notes';
import { colors, radius } from '../../lib/theme';

export default function NoteScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = id === 'new' ? null : Number(id);
  const [body, setBody] = useState('');
  const [createdAt, setCreatedAt] = useState<number | null>(null);

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
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
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

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Stack.Screen
        options={{
          title: createdAt ? formatDate(createdAt) : 'New entry',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
              {noteId !== null && (
                <Pressable onPress={remove} hitSlop={10}>
                  <Text style={{ color: colors.danger, fontSize: 16 }}>Delete</Text>
                </Pressable>
              )}
              <Pressable onPress={save} hitSlop={10}>
                <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <TextInput
        style={styles.input}
        multiline
        autoFocus={noteId === null}
        placeholder="What happened today? How do you feel? Anything goes."
        placeholderTextColor={colors.muted}
        value={body}
        onChangeText={setBody}
        textAlignVertical="top"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 25,
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 16,
  },
});
