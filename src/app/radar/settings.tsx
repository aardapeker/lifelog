import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../../radar/components/Header';
import { Pill } from '../../radar/components/Pill';
import { splitList } from '../../radar/format';
import { colors, ui } from '../../radar/theme';
import type { DigestSettings, RadarSettings, Topic, TopicInput } from '../../radar/types';
import { useRadar } from '../../radar/useRadar';

/*
 * Radar's settings: your topics (keywords, words to skip, where else to look), the morning digest,
 * languages, and hidden sites. On the server these were the web app's Topics and Settings dialogs.
 */

const COLORS = ['#F5C211', '#9AD8AE', '#51A2DA', '#D97757', '#C79BFF', '#FF6B8B', '#7FE0D0', '#FFB347'];
const TIMES = ['05:30', '06:00', '07:00', '08:00', '12:00', '18:00'];
const MIN_POINTS = [0, 5, 20, 50, 100];

export default function RadarSettingsScreen() {
  const r = useRadar();
  const insets = useSafeAreaInsets();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [s, setS] = useState<RadarSettings | null>(null);
  const [d, setD] = useState<DigestSettings | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(() => {
    r.topics().then(setTopics);
    r.settings().then(setS);
    r.digestSettings().then(setD);
    r.hiddenSites().then(setHidden);
  }, [r]);
  useFocusEffect(load);

  const saveS = (next: RadarSettings) => {
    setS(next);
    r.saveSettings(next).catch(() => {});
  };
  const saveD = (next: DigestSettings) => {
    setD(next);
    r.saveDigestSettings(next).catch(() => {});
  };

  return (
    <View style={ui.screen}>
      <Header title="Radar settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
        <Text style={ui.label}>Topics</Text>
        <Text style={ui.muted}>Radar follows topics, not people. Each one searches its keywords, plus the channels, repos and hashtags you add.</Text>
        {topics.map((t) =>
          editing === t.id ? (
            <TopicForm
              key={t.id}
              topic={t}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                await r.saveTopic(t.id, input);
                setEditing(null);
                load();
              }}
              onDelete={() =>
                Alert.alert(`Delete ${t.name}?`, 'Its news goes too (saved items included).', [
                  { text: 'Keep it', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await r.deleteTopic(t.id);
                      setEditing(null);
                      load();
                    },
                  },
                ])
              }
            />
          ) : (
            <Pressable key={t.id} onPress={() => setEditing(t.id)} style={({ pressed }) => [ui.card, styles.topic, pressed && { borderColor: colors.muted }]}>
              <View style={[styles.dot, { backgroundColor: t.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.topicName}>{t.name}</Text>
                <Text style={ui.muted} numberOfLines={2}>
                  {[t.keywords.join(', '), ...(t.sources.youtubeChannels ?? []), ...t.sources.githubRepos, ...t.sources.mastodonTags.map((x) => `#${x}`)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={ui.muted}>Edit</Text>
            </Pressable>
          ),
        )}
        {editing === 'new' ? (
          <TopicForm
            onCancel={() => setEditing(null)}
            onSave={async (input) => {
              await r.saveTopic(null, input);
              setEditing(null);
              load();
            }}
          />
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <Pill label="Add a topic" icon="add" onPress={() => setEditing('new')} />
          </View>
        )}

        {d && (
          <>
            <Text style={[ui.label, styles.section]}>☀️ Morning digest</Text>
            <View style={styles.switchRow}>
              <Text style={[ui.body, { flex: 1 }]}>A notification with the best unread news, once a day</Text>
              <Switch value={d.enabled} onValueChange={(v) => saveD({ ...d, enabled: v })} trackColor={{ true: colors.accent }} />
            </View>
            {d.enabled && (
              <>
                <View style={styles.chips}>
                  {TIMES.map((t) => (
                    <Pill key={t} label={t} variant={d.time === t ? 'on' : 'plain'} onPress={() => saveD({ ...d, time: t })} />
                  ))}
                </View>
                <Text style={ui.muted}>It comes with the first background check after this time (Android decides exactly when, usually within an hour or two).</Text>
              </>
            )}
          </>
        )}

        {s && (
          <>
            <Text style={[ui.label, styles.section]}>Languages</Text>
            <View style={styles.chips}>
              <Pill label="English" icon="lock-closed" variant="on" onPress={() => {}} />
              <Pill
                label="Türkçe"
                variant={s.languages.includes('tr') ? 'on' : 'plain'}
                onPress={() => saveS({ ...s, languages: s.languages.includes('tr') ? s.languages.filter((l) => l !== 'tr') : [...s.languages, 'tr'] })}
              />
            </View>
            <Text style={ui.muted}>English is always on: lots of items don't say their language, so "Turkish only" can't be reliable.</Text>

            <Text style={[ui.label, styles.section]}>Hacker News: minimum points</Text>
            <View style={styles.chips}>
              {MIN_POINTS.map((n) => (
                <Pill key={n} label={String(n)} variant={s.hackerNewsMinPoints === n ? 'on' : 'plain'} onPress={() => saveS({ ...s, hackerNewsMinPoints: n })} />
              ))}
            </View>
          </>
        )}

        {hidden.length > 0 && (
          <>
            <Text style={[ui.label, styles.section]}>Hidden sites</Text>
            {hidden.map((h) => (
              <View key={h} style={styles.switchRow}>
                <Text style={[ui.body, { flex: 1 }]}>{h}</Text>
                <Pill
                  label="Show again"
                  onPress={async () => {
                    await r.setHidden(h, false);
                    load();
                  }}
                />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TopicForm({ topic, onSave, onCancel, onDelete }: { topic?: Topic; onSave: (t: TopicInput) => Promise<void>; onCancel: () => void; onDelete?: () => void }) {
  const [name, setName] = useState(topic?.name ?? '');
  const [color, setColor] = useState(topic?.color ?? COLORS[4]);
  const [keywords, setKeywords] = useState(topic?.keywords.join(', ') ?? '');
  const [exclude, setExclude] = useState(topic?.excludeWords.join(', ') ?? '');
  const [youtube, setYoutube] = useState(topic?.sources.youtubeChannels?.join(', ') ?? '');
  const [repos, setRepos] = useState(topic?.sources.githubRepos.join(', ') ?? '');
  const [tags, setTags] = useState(topic?.sources.mastodonTags.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const ok = name.trim() && splitList(keywords).length > 0;
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        color,
        keywords: splitList(keywords),
        excludeWords: splitList(exclude),
        sources: {
          githubRepos: splitList(repos),
          mastodonTags: splitList(tags).map((t) => t.replace(/^#/, '')),
          youtubeChannels: splitList(youtube),
          arxiv: topic?.sources.arxiv ?? false,
          stockSymbol: topic?.sources.stockSymbol ?? null,
        },
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[ui.card, styles.form]}>
      <Field label="Name" value={name} onChange={setName} placeholder="Linux" />
      <View style={styles.colors}>
        {COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel={`Colour ${c}`} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]} />
        ))}
      </View>
      <Field label="Keywords (comma between them)" value={keywords} onChange={setKeywords} placeholder="Linux, Linux kernel" />
      <Field label="Skip headlines with" value={exclude} onChange={setExclude} placeholder="fedora hat" />
      <Field label="YouTube channels" value={youtube} onChange={setYoutube} placeholder="@TheLinuxEXP, @DistroTube" />
      <Field label="GitHub repos (new releases)" value={repos} onChange={setRepos} placeholder="torvalds/linux" />
      <Field label="Mastodon hashtags" value={tags} onChange={setTags} placeholder="linux, fedora" />
      <View style={styles.chips}>
        <Pill label={busy ? 'Saving…' : 'Save'} variant="solid" onPress={save} disabled={!ok || busy} />
        <Pill label="Cancel" onPress={onCancel} />
        {onDelete && <Pill label="Delete" icon="trash-outline" onPress={onDelete} />}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={styles.input}
        cursorColor={colors.accent}
        selectionColor="rgba(255,122,69,0.35)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  section: { marginTop: 22 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  topicName: { color: colors.paper, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  form: { padding: 16, gap: 14 },
  fieldLabel: { color: colors.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.paper, fontSize: 15 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchOn: { borderWidth: 3, borderColor: colors.paper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
