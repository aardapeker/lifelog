import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, PillButton, SectionTitle } from '../../components/ui';
import { deleteResearch, listResearch, researchSources, type Research } from '../../lib/autonomy';
import { formatDate } from '../../lib/notes';
import { articleOf, listReads, type Read } from '../../lib/reads';
import {
  addGoal,
  addIdea,
  deleteIdea,
  exportJson,
  goalSuggestions,
  listGoals,
  listIdeas,
  listPeople,
  moodByDay,
  moodByShift,
  quietDays,
  setIdeaDone,
  topMoodWords,
  weekStats,
  type WeekStats,
  type Goal,
  type Idea,
  type Person,
} from '../../lib/insights';
import { bigTitleMotion, CollapsingHeader, useCollapsingHeader } from '../../components/CollapsingHeader';
import { Glass } from '../../components/Glass';
import { FadeIn, PressScale, stagger } from '../../components/motion';
import { useBottomSpace } from '../../components/MiniPlayer';
import { LifeTimeline } from '../../components/Milestones';
import { TopBar } from '../../components/TopBar';
import { colors, inputColors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

const WEEKS = 12;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** One bento tile: glass card, small label, big value, an optional extra line. */
function Tile(props: { label: string; value: string; sub?: string; style?: object; onPress?: () => void; children?: React.ReactNode }) {
  const body = (
    <Glass radius={radius.md} style={[styles.tile, props.style]}>
      <Text style={styles.tileLabel}>{props.label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {props.value}
      </Text>
      {!!props.sub && <Text style={styles.tileSub}>{props.sub}</Text>}
      {props.children}
    </Glass>
  );
  return props.onPress ? (
    <PressScale scaleTo={0.96} onPress={props.onPress} style={props.style}>
      {body}
    </PressScale>
  ) : (
    body
  );
}

/** The week at a glance, as a bento grid: one big mood tile, small tiles around it. */
function Bento(props: { week: WeekStats; openGoals: number; doneGoals: number; people: number; reads: number; onRead: () => void }) {
  const { week } = props;
  const today = new Date().getDay();
  return (
    <View style={styles.bento}>
      <View style={styles.bentoRow}>
        <Tile label="This week" value={week.mood === null ? '–' : week.mood.toFixed(1)} sub="mood out of 5" style={{ flex: 1.25 }}>
          <View style={styles.spark}>
            {week.days.map((m, i) => (
              <View key={i} style={styles.sparkCol}>
                <View
                  style={[
                    styles.sparkBar,
                    m === null ? styles.sparkEmpty : { height: 8 + (m / 5) * 40, backgroundColor: shade(m) },
                  ]}
                />
                <Text style={styles.sparkDay}>{WEEKDAY[(today + 1 + i) % 7]}</Text>
              </View>
            ))}
          </View>
        </Tile>
        <View style={styles.bentoStack}>
          <Tile label="Streak" value={`${week.streak}🔥`} sub={week.streak === 1 ? 'day' : 'days in a row'} />
          <Tile label="Entries" value={String(week.entries)} sub={`${week.words} words this week`} />
        </View>
      </View>
      <View style={styles.bentoRow}>
        <Tile label="Goals" value={String(props.openGoals)} sub={`open · ${props.doneGoals} done`} style={{ flex: 1 }} />
        <Tile label="People" value={String(props.people)} sub="in your story" style={{ flex: 1 }} />
        <Tile label="Reads" value={String(props.reads)} sub="written for you" style={{ flex: 1 }} onPress={props.reads ? props.onRead : undefined} />
      </View>
    </View>
  );
}
const DAY = 86_400_000;
// mood 1…5 as brightness: dark charcoal for rough days, white for great ones
const MOOD_SHADES = ['#3D3C3C', '#5E5D5D', '#868585', '#B9B8B8', '#FFFFFF'];
const shade = (mood: number) => MOOD_SHADES[Math.min(4, Math.max(0, Math.round(mood) - 1))];

function MoodGrid({ moods }: { moods: Map<number, number> }) {
  // columns = weeks (oldest left), rows = Mon…Sun
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonday = today.getTime() - ((today.getDay() + 6) % 7) * DAY;
  const columns = Array.from({ length: WEEKS }, (_, w) => thisMonday - (WEEKS - 1 - w) * 7 * DAY);
  return (
    <View>
      <View style={styles.grid}>
        {columns.map((monday) => (
          <View key={monday} style={styles.gridCol}>
            {Array.from({ length: 7 }, (_, d) => {
              const day = monday + d * DAY;
              const mood = moods.get(day);
              const future = day > today.getTime();
              return (
                <View
                  key={d}
                  style={[
                    styles.cell,
                    mood !== undefined ? { backgroundColor: shade(mood) } : styles.cellEmpty,
                    future && { opacity: 0 },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Rough</Text>
        {MOOD_SHADES.map((c) => (
          <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={styles.legendText}>Great</Text>
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomSpace(); // the tab bar, plus the radio player when it's docked
  const { y, onScroll } = useCollapsingHeader();
  const [moods, setMoods] = useState<Map<number, number>>(new Map());
  const [words, setWords] = useState<string[]>([]);
  const [byShift, setByShift] = useState<{ label: string; mood: number; n: number }[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [newGoal, setNewGoal] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [research, setResearch] = useState<Research[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [week, setWeek] = useState<WeekStats | null>(null);

  const load = useCallback(async () => {
    const [m, w, s, g, sg, p, i] = await Promise.all([
      moodByDay(db, WEEKS * 7),
      topMoodWords(db),
      moodByShift(db),
      listGoals(db),
      goalSuggestions(db),
      listPeople(db),
      listIdeas(db),
    ]);
    setMoods(m);
    setWords(w);
    setByShift(s);
    setGoals(g);
    setSuggestions(sg);
    setPeople(p);
    setIdeas(i);
    setResearch(await listResearch(db));
    setReads(await listReads(db));
    setWeek(await weekStats(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const createGoal = async (title: string) => {
    if (!title.trim()) return;
    await addGoal(db, title);
    setNewGoal('');
    load();
    setTimeout(load, 4000); // past entries get linked in the background
  };

  const createIdea = async () => {
    if (!newIdea.trim()) return;
    await addIdea(db, newIdea);
    setNewIdea('');
    load();
  };

  const avg = moods.size ? [...moods.values()].reduce((a, b) => a + b, 0) / moods.size : 0;
  const openGoals = goals.filter((g) => !g.done);
  const doneGoals = goals.filter((g) => g.done);

  return (
    <View style={styles.screen}>
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: bottomSpace + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <TopBar kicker="You, over time" title={<Animated.Text style={[styles.title, bigTitleMotion(y)]}>Life</Animated.Text>} />

      {week && (
        <FadeIn>
          <Bento
            week={week}
            openGoals={openGoals.length}
            doneGoals={doneGoals.length}
            people={people.length}
            reads={reads.length}
            onRead={() => reads[0] && router.push(`/read/${reads[0].id}`)}
          />
        </FadeIn>
      )}

      {/* ── mood ── */}
      <FadeIn style={styles.section} delay={stagger(0, 60)}>
        <SectionTitle title="Your Mood" />
        <Text style={styles.hint}>Every entry gets a mood, read from what you wrote. Last {WEEKS} weeks.</Text>
        <View style={styles.panel}>
          {moods.size === 0 ? (
            <Text style={styles.hint}>Write a few entries and your mood map fills in here.</Text>
          ) : (
            <>
              <MoodGrid moods={moods} />
              <Text style={styles.stat}>
                Average {avg.toFixed(1)} out of 5{words.length ? `. Lately: ${words.join(', ')}.` : '.'}
              </Text>
              {byShift.length > 1 && (
                <View style={{ marginTop: 14, gap: 8 }}>
                  {byShift.map((s) => (
                    <View key={s.label} style={styles.barRow}>
                      <Text style={styles.barLabel}>{s.label}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, { width: `${(s.mood / 5) * 100}%` }]} />
                      </View>
                      <Text style={styles.barValue}>{s.mood.toFixed(1)}</Text>
                    </View>
                  ))}
                  <Text style={styles.hint}>Average mood by shift week, from your Check-ins rotation.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </FadeIn>

      {/* ── your life in milestones ── */}
      <FadeIn style={styles.section} delay={stagger(6, 60)}>
        <LifeTimeline />
      </FadeIn>

      {/* ── goals ── */}
      <FadeIn style={styles.section} delay={stagger(3, 60)}>
        <SectionTitle title="Goals" />
        <Text style={styles.hint}>Entries about a goal link to it on their own.</Text>
        <View style={styles.panel}>
          {openGoals.map((g) => {
            const quiet = quietDays(g);
            return (
              <Pressable key={g.id} style={styles.row} onPress={() => router.push(`/goal/${g.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{g.title}</Text>
                  <Text style={styles.rowMeta}>
                    {g.entries === 1 ? '1 entry' : `${g.entries} entries`}
                    {quiet >= 10 ? `, quiet for ${quiet} days` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
          {doneGoals.length > 0 && (
            <Text style={[styles.rowMeta, { marginTop: 12 }]}>
              Done: {doneGoals.map((g) => g.title).join(', ')}
            </Text>
          )}
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Add a goal"
              placeholderTextColor={colors.muted}
              value={newGoal}
              onChangeText={setNewGoal}
              onSubmitEditing={() => createGoal(newGoal)}
              returnKeyType="done"
              {...inputColors}
            />
            <PillButton label="Add" onPress={() => createGoal(newGoal)} />
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.rowMeta}>Noticed in your entries:</Text>
              {suggestions.map((s) => (
                <Chip key={s} label={`+ ${s}`} onPress={() => createGoal(s)} />
              ))}
            </View>
          )}
        </View>
      </FadeIn>

      {/* ── people ── */}
      <FadeIn style={styles.section} delay={stagger(4, 60)}>
        <SectionTitle title="People & Pets" />
        <Text style={styles.hint}>Everyone who shows up in your journal. Tap a name to see it all.</Text>
        <View style={styles.panel}>
          {people.length === 0 ? (
            <Text style={styles.hint}>Nobody yet. Mention people in your entries and they appear here.</Text>
          ) : (
            <View style={styles.chips}>
              {people.map((p) => (
                <Chip
                  key={p.name}
                  label={`${p.kind === 'pet' ? '🐾 ' : ''}${p.name}`}
                  onPress={() => router.push(`/person/${encodeURIComponent(p.name)}`)}
                />
              ))}
            </View>
          )}
        </View>
      </FadeIn>

      {/* ── video ideas ── */}
      <FadeIn style={styles.section} delay={stagger(5, 60)}>
        <SectionTitle title="Video Ideas" />
        <Text style={styles.hint}>Collected from your entries whenever you mention something worth a video.</Text>
        <View style={styles.panel}>
          {ideas.map((i) => (
            <Pressable
              key={i.id}
              style={styles.idea}
              onPress={async () => {
                await setIdeaDone(db, i.id, !i.done);
                load();
              }}
              onLongPress={() =>
                Alert.alert('Delete this idea?', i.text, [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteIdea(db, i.id);
                      load();
                    },
                  },
                ])
              }
            >
              <Ionicons
                name={i.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={i.done ? colors.muted : colors.text}
              />
              <Text style={[styles.ideaText, !!i.done && styles.ideaDone]}>{i.text}</Text>
            </Pressable>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Add an idea"
              placeholderTextColor={colors.muted}
              value={newIdea}
              onChangeText={setNewIdea}
              onSubmitEditing={createIdea}
              returnKeyType="done"
              {...inputColors}
            />
            <PillButton label="Add" onPress={createIdea} />
          </View>
          {ideas.length > 0 && <Text style={[styles.rowMeta, { marginTop: 10 }]}>Tap to tick off, hold to delete.</Text>}
        </View>
      </FadeIn>


    </Animated.ScrollView>
    <CollapsingHeader title="Life" y={y} />
    </View>
  );
}

const CELL = 18;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 30 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 34, color: colors.text },
  section: { gap: 6 },
  bento: { gap: 10, marginTop: 4 },
  bentoRow: { flexDirection: 'row', gap: 10 },
  bentoStack: { flex: 1, gap: 10 },
  tile: { padding: 16, minHeight: 96 },
  tileLabel: { fontFamily: fonts.serif, fontSize: 13, color: colors.muted },
  tileValue: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 34, lineHeight: 42, color: colors.text, marginTop: 4 },
  tileSub: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 14, height: 66 },
  sparkCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  sparkBar: { width: '100%', borderRadius: 4 },
  sparkEmpty: { height: 4, backgroundColor: colors.line },
  sparkDay: { fontFamily: fonts.sansRegular, fontSize: 10, color: colors.muted },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 6 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  stat: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 24, color: colors.text, marginTop: 14 },

  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  gridCol: { gap: 4 },
  cell: { width: CELL, height: CELL, borderRadius: 5 },
  cellEmpty: { borderWidth: 1, borderColor: colors.line },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontFamily: fonts.sansRegular, fontSize: 11, color: colors.muted, marginHorizontal: 4 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 64, fontFamily: fonts.sansRegular, fontSize: 13, color: colors.text },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.raised, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barValue: { width: 28, fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, textAlign: 'right' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.text },
  rowMeta: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  suggestions: { gap: 8, marginTop: 14, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  readCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  readTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readMeta: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  readTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 22, lineHeight: 28, color: colors.text, marginTop: 6 },
  readHook: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 6 },
  research: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
  researchText: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: colors.text, marginTop: 2 },
  researchLink: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },

  idea: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 },
  ideaText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.text },
  ideaDone: { color: colors.muted, textDecorationLine: 'line-through' },
});
