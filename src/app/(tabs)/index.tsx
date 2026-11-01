import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, PillButton, SectionTitle } from '../../components/ui';
import { getSetting } from '../../lib/db';
import { backupDue, backupNow, getPassphrase } from '../../lib/backup';
import { runBackgroundJobs } from '../../lib/background';
import { photoMap, photoUri } from '../../lib/photos';
import { latestRecap, weekLabel, type Recap } from '../../lib/recap';
import {
  formatDate,
  formatTime,
  greeting,
  groupByDay,
  listNotes,
  onThisDay,
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

function EntryCard({ note, label, photos }: { note: Note; label: string; photos?: string[] }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
      onPress={() => router.push(`/note/${note.id}`)}
    >
      <Text style={styles.cardTime}>{label}</Text>
      {!!note.body && (
        <Text style={styles.cardBody} numberOfLines={5}>
          {note.body}
        </Text>
      )}
      {!!photos?.length && (
        <View style={styles.thumbs}>
          {photos.slice(0, 4).map((f) => (
            <Image key={f} source={{ uri: photoUri(f) }} style={styles.thumb} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

function Day({ section, photos }: { section: DaySection; photos: Map<number, string[]> }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{section.weekday}</Text>
        <Text style={styles.dayDate}>
          {section.day} {section.month}
        </Text>
      </View>
      {section.data.map((n) => (
        <EntryCard key={n.id} note={n} label={formatTime(n.created_at)} photos={photos.get(n.id)} />
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
  const [photos, setPhotos] = useState<Map<number, string[]>>(new Map());
  const [recap, setRecap] = useState<Recap | null>(null);
  const [memories, setMemories] = useState<{ label: string; note: Note }[]>([]);
  const [needsBackup, setNeedsBackup] = useState(false);
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
      photoMap(db).then(setPhotos);
      onThisDay(db).then(setMemories);
      backupDue(db).then(setNeedsBackup);
      // captions, embeddings, facts, the weekly letter, check-ins
      runBackgroundJobs(db).then(async () => {
        const r = await latestRecap(db);
        setRecap(r && Date.now() - r.created_at < 7 * 86_400_000 ? r : null);
        photoMap(db).then(setPhotos);
      });
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

  const backup = async () => {
    if (!(await getPassphrase())) {
      Alert.alert('Set a passphrase first', 'Backups are encrypted with a passphrase only you know.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.navigate('/settings') },
      ]);
      return;
    }
    try {
      await backupNow(db);
      setNeedsBackup(false);
    } catch (e) {
      Alert.alert("Couldn't back up", e instanceof Error ? e.message : String(e));
    }
  };

  const extras = !isSearch && range === 'all' && (
    <View style={{ gap: 10, marginTop: 22 }}>
      {needsBackup && (
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Back up today's pages</Text>
            <Text style={styles.bannerText}>Everything lives on this phone. Save a copy to Drive.</Text>
          </View>
          <PillButton label="Back up" onPress={backup} />
        </View>
      )}
      {recap && (
        <Pressable style={styles.letter} onPress={() => router.push(`/recap/${recap.id}`)}>
          <Text style={styles.letterLabel}>{weekLabel(recap.week_start)}</Text>
          <Text style={styles.letterTitle}>Your week, in a letter</Text>
          <Text style={styles.letterBody} numberOfLines={3}>
            {recap.body}
          </Text>
        </Pressable>
      )}
      {memories.map((m) => (
        <Pressable key={m.note.id} style={styles.memory} onPress={() => router.push(`/note/${m.note.id}`)}>
          <Text style={styles.memoryLabel}>{m.label}</Text>
          <Text style={styles.memoryBody} numberOfLines={3}>
            {m.note.body}
          </Text>
        </Pressable>
      ))}
    </View>
  );

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

      {extras}

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
      renderItem={({ item }) => (
        <EntryCard note={item} label={formatDate(item.created_at)} photos={photos.get(item.id)} />
      )}
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
      renderItem={({ item }) => <Day section={item} photos={photos} />}
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

  thumbs: { flexDirection: 'row', gap: 6, marginTop: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.raised },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.raised,
    borderRadius: radius.md,
    padding: 16,
  },
  bannerTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.text },
  bannerText: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 3 },
  letter: { backgroundColor: colors.accent, borderRadius: radius.md, padding: 20 },
  letterLabel: { fontFamily: fonts.sansRegular, fontSize: 12, color: '#6B6A6A' },
  letterTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.accentText, marginTop: 4, marginBottom: 8 },
  letterBody: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 23, color: colors.accentText },
  memory: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 16 },
  memoryLabel: { fontFamily: fonts.serif, fontSize: 15, color: colors.muted, marginBottom: 6 },
  memoryBody: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: colors.text },

  empty: { marginTop: 30 },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, color: colors.text, marginBottom: 10 },
  emptyText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted },
});
