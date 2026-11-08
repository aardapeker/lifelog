import Ionicons from '@expo/vector-icons/Ionicons';
import { openWrite } from '../../lib/write';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, PillButton, SectionTitle } from '../../components/ui';
import { getSetting } from '../../lib/db';
import { backupDue, backupNow, getPassphrase } from '../../lib/backup';
import { runBackgroundJobs } from '../../lib/background';
import { photoMap, photoUri } from '../../lib/photos';
import { dayParam, getPlannerSettings, midnight, upcomingDayOff } from '../../lib/planner';
import { articleOf, unopenedRead, type Read } from '../../lib/reads';
import { latestRecap, weekLabel, type Recap } from '../../lib/recap';
import {
  formatDate,
  formatTime,
  greeting,
  groupByDay,
  listNotes,
  noteSong,
  onThisDay,
  type DaySection,
  type Note,
} from '../../lib/notes';
import { hybridSearch } from '../../lib/search';
import { bigTitleMotion, CollapsingHeader, useCollapsingHeader } from '../../components/CollapsingHeader';
import { FadeIn, PressScale, Shimmer, ShimmerText, stagger } from '../../components/motion';
import { useBottomSpace } from '../../components/MiniPlayer';
import { MilestoneSuggestions } from '../../components/Milestones';
import { TopBar } from '../../components/TopBar';
import { colors, inputColors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

type Range = 'all' | 'week' | 'month';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'all', label: 'All days', days: Infinity },
  { key: 'week', label: 'This week', days: 7 },
  { key: 'month', label: 'This month', days: 30 },
];

function EntryCard({ note, label, photos }: { note: Note; label: string; photos?: string[] }) {
  return (
    <PressScale style={styles.card} scaleTo={0.97} onPress={() => router.push(`/entry/${note.id}`)}>
      <Text style={styles.cardTime}>
        {label}
        {noteSong(note) ? `  ·  ♪ ${noteSong(note)!.name}` : ''}
      </Text>
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
    </PressScale>
  );
}

// mood 1…5 as a faint temperature: cool slate for rough days, warm gold for great ones
const MOOD_TINTS = ['#6E7A93', '#8D93A6', '#A8A29A', '#D2B48C', '#EBC96E'];
const moodTint = (m: number) => MOOD_TINTS[Math.min(4, Math.max(0, Math.round(m) - 1))];

function Day({ section, photos }: { section: DaySection; photos: Map<number, string[]> }) {
  const moods = section.data.map((n) => n.mood).filter((m): m is number => typeof m === 'number');
  const mood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        {mood !== null && <View style={[styles.moodDot, { backgroundColor: moodTint(mood) }]} />}
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
  const bottomSpace = useBottomSpace(); // the tab bar, plus the radio player when it's docked
  const { y, onScroll } = useCollapsingHeader();
  const [notes, setNotes] = useState<Note[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState<Map<number, string[]>>(new Map());
  const [recap, setRecap] = useState<Recap | null>(null);
  const [memories, setMemories] = useState<{ label: string; note: Note }[]>([]);
  const [needsBackup, setNeedsBackup] = useState(false);
  const [dayOff, setDayOff] = useState<number | null>(null);
  const [newRead, setNewRead] = useState<Read | null>(null);
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

  const [learned, setLearned] = useState(0); // bumps when the background jobs finish // Spotify connected: the Radio button shows
  useFocusEffect(
    useCallback(() => {
      load();
      getSetting(db, 'name').then(setName);
      photoMap(db).then(setPhotos);
      onThisDay(db).then(setMemories);
      backupDue(db).then(setNeedsBackup);
      upcomingDayOff(db).then(setDayOff);
      unopenedRead(db).then(setNewRead);
      // captions, embeddings, facts, the weekly letter, check-ins
      runBackgroundJobs(db).then(async () => {
        const r = await latestRecap(db);
        setRecap(r && Date.now() - r.created_at < 7 * 86_400_000 ? r : null);
        photoMap(db).then(setPhotos);
        setLearned((n) => n + 1); // new entries were read: maybe a milestone to suggest
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
        { text: 'Open Settings', onPress: () => router.push('/settings/privacy') },
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
      {newRead && (
        <PressScale scaleTo={0.97} style={styles.memory} onPress={() => router.push(`/read/${newRead.id}`)}>
          <Text style={styles.memoryLabel}>A new read for you</Text>
          <Text style={[styles.letterTitle, { color: colors.text, marginTop: 0 }]}>
            {articleOf(newRead)?.title ?? newRead.topic}
          </Text>
          {!!articleOf(newRead)?.hook && (
            <Text style={styles.memoryBody} numberOfLines={2}>
              {articleOf(newRead)!.hook}
            </Text>
          )}
        </PressScale>
      )}
      {dayOff !== null && (
        <PressScale
          scaleTo={0.97}
          style={styles.letter}
          onPress={async () => {
            const s = await getPlannerSettings(db);
            if (!s.city) {
              Alert.alert('Where are you?', 'Set your city in You → Friend → Days Off, so I can check the weather and events.', [
                { text: 'Later', style: 'cancel' },
                { text: 'Open Settings', onPress: () => router.push('/settings/friend') },
              ]);
              return;
            }
            router.push(`/plan/${dayParam(dayOff)}`);
          }}
        >
          <Text style={styles.letterLabel}>{dayOff === midnight(Date.now()) ? 'Today is a day off' : 'Tomorrow is free'}</Text>
          <Text style={styles.letterTitle}>Plan my day</Text>
          <Text style={styles.letterBody}>Weather, real events nearby and a little push to get out there.</Text>
        </PressScale>
      )}
      {recap && (
        <PressScale scaleTo={0.97} style={styles.letter} onPress={() => router.push(`/recap/${recap.id}`)}>
          <Text style={styles.letterLabel}>{weekLabel(recap.week_start)}</Text>
          <Text style={styles.letterTitle}>Your week, in a letter</Text>
          <Text style={styles.letterBody} numberOfLines={3}>
            {recap.body}
          </Text>
        </PressScale>
      )}
      {memories.map((m) => (
        <PressScale key={m.note.id} scaleTo={0.97} style={styles.memory} onPress={() => router.push(`/entry/${m.note.id}`)}>
          <Text style={styles.memoryLabel}>{m.label}</Text>
          <Text style={styles.memoryBody} numberOfLines={3}>
            {m.note.body}
          </Text>
        </PressScale>
      ))}
    </View>
  );

  const header = (
    <View>
      {/* your photo opens You (profile + settings); new entries start from the ＋ in the tab bar */}
      <TopBar
        kicker={greeting()}
        title={
          <Animated.Text style={[styles.name, bigTitleMotion(y)]} numberOfLines={1}>
            {name.trim() || 'Your journal'}
          </Animated.Text>
        }
      />

      <View style={styles.search}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search your days"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          {...inputColors}
        />
        <Pressable style={styles.searchButton} onPress={() => setQuery('')} accessibilityLabel="Clear search">
          <Ionicons name={isSearch ? 'close' : 'search'} size={18} color={colors.text} />
        </Pressable>
      </View>

      {!isSearch && <MilestoneSuggestions refresh={learned} />}

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

  const empty = isSearch && searching ? (
    <View style={{ gap: 10, marginTop: 14 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { gap: 10 }]}>
          <Shimmer style={{ width: '35%', height: 11 }} />
          <ShimmerText lines={3} />
        </View>
      ))}
    </View>
  ) : (
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
        <PillButton label="Write your first entry" onPress={() => openWrite()} style={{ marginTop: 20 }} />
      )}
    </View>
  );

  const contentStyle = [styles.list, { paddingTop: insets.top + 12, paddingBottom: bottomSpace + insets.bottom }];

  const scrolling = { onScroll, scrollEventThrottle: 16 };

  return (
    <View style={styles.screen}>
      {isSearch ? (
    <Animated.FlatList
      {...scrolling}
      style={styles.screen}
      data={notes}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => (
        <FadeIn delay={stagger(index)}>
          <EntryCard note={item} label={formatDate(item.created_at)} photos={photos.get(item.id)} />
        </FadeIn>
      )}
    />
      ) : (
    <Animated.FlatList
      {...scrolling}
      style={styles.screen}
      data={days}
      keyExtractor={(d) => d.key}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => (
        <FadeIn delay={stagger(index, 70)}>
          <Day section={item} photos={photos} />
        </FadeIn>
      )}
    />
      )}
      <CollapsingHeader title={name.trim() || 'Journal'} y={y} />
    </View>
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
  moodDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'center', opacity: 0.85 },
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
