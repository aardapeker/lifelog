import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { indexPending } from '../../lib/embeddings';
import { formatDate, listNotes, type Note } from '../../lib/notes';
import { hybridSearch } from '../../lib/search';
import { colors, radius } from '../../lib/theme';

export default function JournalScreen() {
  const db = useSQLiteContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setNotes(await listNotes(db));
      return;
    }
    setSearching(true);
    try {
      setNotes(await hybridSearch(db, q, 30));
    } finally {
      setSearching(false);
    }
  }, [db, query]);

  // refresh list + catch up on embeddings whenever the tab comes back into view
  useFocusEffect(
    useCallback(() => {
      load();
      indexPending(db).catch(() => {});
    }, [load, db]),
  );

  // debounce typing
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.search}
        placeholder="Search your life… (keywords or meaning)"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? (searching ? 'Searching…' : 'Nothing found.') : 'No entries yet. Tap + and write something.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/note/${item.id}`)}>
            <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            <Text style={styles.preview} numberOfLines={4}>
              {item.body}
            </Text>
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/note/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  search: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: radius,
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: 14 },
  date: { color: colors.accent, fontSize: 12, marginBottom: 6 },
  preview: { color: colors.text, fontSize: 15, lineHeight: 21 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: colors.accentText, fontSize: 32, lineHeight: 34, fontWeight: '600' },
});
