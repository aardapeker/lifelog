import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, GlassArea } from '../../components/Glass';
import Ionicons from '../../components/Icon';
import { FadeIn, PressScale } from '../../components/motion';
import { ShowWash } from '../../components/radioParts';
import { Chip, IconButton, InfoButton, PillButton } from '../../components/ui';
import { useFirstFrame } from '../../lib/perf';
import { createProject, dropIdea, LENGTHS, listIdeas, listProjects, refreshIdeas, research, type Idea, type Project } from '../../lib/studio';
import { colors, fonts, frost, inputColors, radius } from '../../lib/theme';

/** What a project is up to, for its row. */
const STATUS: Record<Project['status'], { label: string; color: string }> = {
  new: { label: 'New', color: colors.muted },
  researching: { label: 'Researching…', color: '#8FD3FF' },
  researched: { label: 'Researched · write the script', color: '#FFD86B' },
  writing: { label: 'Writing…', color: '#8FD3FF' },
  ready: { label: 'Script ready', color: colors.ok },
  error: { label: 'Stopped', color: colors.danger },
};

/**
 * Studio: documentaries for the YouTube channel. Start one from a topic (or an idea Studio found in your
 * week), and it researches, writes the script in scenes and the publish kit. You polish it on the weekend.
 */
export default function StudioScreen() {
  useFirstFrame('Studio');
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState('');

  const load = useCallback(async () => {
    setProjects(await listProjects(db));
    setIdeas(await listIdeas(db));
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      load();
      // fresh ideas once a week, quietly
      refreshIdeas(db).then(setIdeas).catch(() => {});
    }, [db, load]),
  );

  const newIdeas = async () => {
    setThinking(true);
    setProblem('');
    try {
      setIdeas(await refreshIdeas(db, true));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  };

  const start = async () => {
    if (!topic.trim()) return;
    const id = await createProject(db, topic, minutes, angle);
    research(db, id); // runs on; the project page shows its progress
    setTopic('');
    setAngle('');
    router.push(`/studio/${id}`);
  };

  return (
    <View style={styles.screen}>
      <ShowWash />
      <GlassArea>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          <Text style={styles.barTitle}>Studio</Text>
          <InfoButton
            title="How Studio works"
            points={[
              'Pick a topic. Studio researches it with Google Search (every fact keeps its source), then writes an English documentary script in scenes: narration plus what to show.',
              'Edit the script yourself, or tell the AI what to change ("make scene 3 funnier"). It also writes titles, the description with chapters, tags, thumbnail text and Shorts.',
              'Next steps (coming): AI voice and pictures per scene, then a DaVinci Resolve project for your weekend edit, and a blog post from each video.',
              'Research uses your Gemini key (Google Search); the writing uses your chat model.',
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>🎬 Studio</Text>
          <Text style={styles.sub}>Documentaries for your channel: the AI researches and writes, you polish.</Text>

          {/* a new documentary */}
          <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
            <Text style={styles.label}>NEW DOCUMENTARY</Text>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="Topic, e.g. The rise and fall of Nokia"
              multiline
              placeholderTextColor={colors.muted}
              style={styles.input}
              {...inputColors}
            />
            <TextInput
              value={angle}
              onChangeText={setAngle}
              placeholder="Focus (optional), e.g. why it failed"
              multiline
              placeholderTextColor={colors.muted}
              style={styles.input}
              {...inputColors}
            />
            <View style={styles.chips}>
              {LENGTHS.map((m) => (
                <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
            <PillButton label="Research it" onPress={start} disabled={!topic.trim()} full />
          </Glass>

          {/* ideas from your week */}
          <View style={styles.sectionRow}>
            <Text style={styles.section}>Ideas for you</Text>
            {thinking ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Pressable onPress={newIdeas} hitSlop={8} accessibilityLabel="New ideas">
                <Ionicons name="refresh" size={20} color={colors.muted} />
              </Pressable>
            )}
          </View>
          {!!problem && <Text style={styles.err}>{problem}</Text>}
          {ideas.length === 0 ? (
            <Text style={styles.hint}>Tap ↻ for ideas from your Radar topics, Reads and interests.</Text>
          ) : (
            ideas.map((i, k) => (
              <FadeIn key={i.id} delay={k * 40}>
                <PressScale scaleTo={0.98} onPress={() => setTopic(i.title)} onLongPress={() => dropIdea(db, i.id).then(load)} style={styles.idea}>
                  <Text style={styles.ideaTitle}>{i.title}</Text>
                  {!!i.why && <Text style={styles.ideaWhy}>{i.why}</Text>}
                </PressScale>
              </FadeIn>
            ))
          )}

          {/* your projects */}
          {projects.length > 0 && <Text style={[styles.section, { marginTop: 24 }]}>Your documentaries</Text>}
          {projects.map((p) => (
            <PressScale key={p.id} scaleTo={0.98} onPress={() => router.push(`/studio/${p.id}`)} style={styles.project}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.projectTitle} numberOfLines={2}>
                  {p.kit?.titles[0] ?? p.topic}
                </Text>
                <Text style={[styles.status, { color: STATUS[p.status].color }]}>
                  {STATUS[p.status].label} · {p.minutes} min
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </PressScale>
          ))}
        </ScrollView>
      </GlassArea>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  barTitle: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  content: { padding: 20, paddingTop: 8, gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 8 },
  card: { padding: 16, gap: 10 },
  label: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', textAlignVertical: 'top', borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  section: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  err: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.danger },
  idea: { padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)', gap: 4 },
  ideaTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  ideaWhy: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted },
  project: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)' },
  projectTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  status: { fontFamily: fonts.sansRegular, fontSize: 13 },
});
