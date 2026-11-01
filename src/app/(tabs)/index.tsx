import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, PillButton, SectionTitle } from '../../components/ui';
import { getSetting } from '../../lib/db';
import { indexPending } from '../../lib/embeddings';
import {
  formatDate,
  formatTime,
  greeting,
  groupByDay,
  listNotes,
  type DaySection,
  type Note,
} from '../../lib/notes';
import { hybridSearch } from '../../lib/search';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

type Range = 'all' | 'week' | 'month';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'all', label: 'All days', days: Infinity },
  { key: 'week', label: 'This week', days: 7 },
  { key: 'month', label: 'This month', days: 30 },
];

function EntryCard({ note, label }: { note: Note; label: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
      onPress={() => router.push(`/note/${note.id}`)}
    >
      <Text style={styles.cardTime}>{label}</Text>
      <Text style={styles.cardBody} numberOfLines={5}>
        {note.body}
      </Text>
    </Pressable>
  );
}

function Day({ section }: { section: DaySection }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{section.weekday}</Text>
        <Text style={styles.dayDate}>
          {section.day} {section.month}
        </Text>
      </View>
      {section.data.map((n) => (
        <EntryCard key={n.id} note={n} label={formatTime(n.created_at)} />
      ))}
    </View>
  );
}

export default function JournalScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [searching, setSearching] = useState(false);
  const isSearch = query.trim().length > 0;

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

  useFocusEffect(
    useCallback(() => {
      load();
      getSetting(db, 'name').then(setName);
      indexPending(db).catch(() => {});
    }, [load, db]),
  );

  // first launch → welcome screen
  useEffect(() => {
    getSetting(db, 'welcomed').then((v) => {
      if (!v) router.push('/welcome');
    });
  }, [db]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  const days = useMemo(() => {
    const limit = RANGES.find((r) => r.key === range)!.days;
    const since = Date.now() - limit * 86_400_000;
    return groupByDay(notes.filter((n) => n.created_at >= since));
  }, [notes, range]);

  const header = (
    <View>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name.trim()[0] ?? '✎').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{greeting()}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name.trim() || 'Your journal'}
          </Text>
        </View>
        <IconButton icon="add" label="Write a new entry" variant="light" onPress={() => router.push('/note/new')} />
      </View>

      <View style={styles.search}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search your days"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          selectionColor={colors.text}
        />
        <Pressable style={styles.searchButton} onPress={() => setQuery('')} accessibilityLabel="Clear search">
          <Ionicons name={isSearch ? 'close' : 'search'} size={18} color={colors.text} />
        </Pressable>
      </View>

      {!isSearch && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RANGES.map((r) => (
            <Chip key={r.key} label={r.label} active={range === r.key} onPress={() => setRange(r.key)} />
          ))}
        </ScrollView>
      )}

      <View style={{ marginTop: 26, marginBottom: 6 }}>
        <SectionTitle
          title={isSearch ? 'Found' : 'Your days'}
          right={
            <Text style={styles.count}>
              {(isSearch ? notes.length : days.reduce((n, d) => n + d.data.length, 0)) || ''}
            </Text>
          }
        />
      </View>
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>
        {isSearch ? (searching ? 'Looking through your days…' : 'Nothing matches that.') : 'A blank first page.'}
      </Text>
      <Text style={styles.emptyText}>
        {isSearch
          ? 'Try other words. Search understands meaning, not only exact text.'
          : 'Write how the shift went, what you ate, what you are thinking about. Your friend learns from every entry.'}
      </Text>
      {!isSearch && (
        <PillButton label="Write your first entry" onPress={() => router.push('/note/new')} style={{ marginTop: 20 }} />
      )}
    </View>
  );

  const contentStyle = [styles.list, { paddingTop: insets.top + 12, paddingBottom: TAB_BAR_SPACE + insets.bottom }];

  return isSearch ? (
    <FlatList
      style={styles.screen}
      data={notes}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => <EntryCard note={item} label={formatDate(item.created_at)} />}
    />
  ) : (
    <FlatList
      style={styles.screen}
      data={days}
      keyExtractor={(d) => d.key}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => <Day section={item} />}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 20, gap: 10 },

  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  hello: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  name: { fontFamily: fonts.serif, fontSize: 26, color: colors.text, marginTop: 1 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingLeft: 20,
    paddingRight: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15 },
  searchButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#4A4949',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: 8, paddingTop: 14 },
  count: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },

  day: { marginTop: 14, gap: 10 },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dayTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.text },
  dayDate: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },

  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  cardTime: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginBottom: 8 },
  cardBody: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 23, color: colors.text },

  empty: { marginTop: 30 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.text, marginBottom: 10 },
  emptyText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted },
});
