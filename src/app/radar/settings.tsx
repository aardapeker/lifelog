import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '../../components/Icon';
import { Header } from '../../radar/components/Header';
import { Pill } from '../../radar/components/Pill';
import { splitList } from '../../radar/format';
import { colors, ui, fonts } from '../../radar/theme';
import type { DigestSettings, RadarSettings, Topic, TopicInput } from '../../radar/types';
import { Page, usePageBottom } from '../../components/Page';
import { useRadar } from '../../radar/useRadar';
import { inputColors } from '../../lib/theme';
import { showAlert } from '../../lib/dialog';
import { getKey, maskKey, setKey } from '../../lib/keys';
import { testTmdbKey, TMDB_LISTS } from '../../radar/local/sources/tmdb';

/*
 * Radar's settings: your topics (keywords, words to skip, where else to look), the morning digest,
 * languages, and hidden sites. On the server these were the web app's Topics and Settings dialogs.
 */

const COLORS = ['#F5C211', '#9AD8AE', '#51A2DA', '#D97757', '#C79BFF', '#FF6B8B', '#7FE0D0', '#FFB347'];
const TIMES = ['05:30', '06:00', '07:00', '08:00', '12:00', '18:00'];
const MIN_POINTS = [0, 5, 20, 50, 100];
const QUAKE_MAGS = [0, 3, 3.5, 4, 4.5, 5]; // 0 = off

export default function RadarSettingsScreen() {
  const r = useRadar();
  const insets = useSafeAreaInsets();
  const pageBottom = usePageBottom(); // room for the docked mini player
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [s, setS] = useState<RadarSettings | null>(null);
  const [d, setD] = useState<DigestSettings | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [tmdbKey, setTmdbKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyMsg, setKeyMsg] = useState('');

  const load = useCallback(() => {
    getKey('tmdb').then(setTmdbKey);
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
    <Page>
      <Header title="Radar settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 + pageBottom }]} keyboardShouldPersistTaps="handled">
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
                showAlert(`Delete ${t.name}?`, 'Its news goes too (saved items included).', [
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
                  {[
                    t.keywords.join(', '),
                    ...(t.sources.youtubeChannels ?? []),
                    ...t.sources.githubRepos,
                    ...t.sources.mastodonTags.map((x) => `#${x}`),
                    t.sources.feeds?.length ? `${t.sources.feeds.length} RSS` : '',
                    ...(t.sources.devtoTags ?? []).map((x) => `dev.to/${x}`),
                    t.sources.arxiv ? 'arXiv' : '',
                    ...TMDB_LISTS.filter((l) => t.sources.tmdbLists?.includes(l.id)).map((l) => l.label),
                    ...(t.sources.tmdbPeople ?? []),
                    t.sources.spotifyArtists ? '♪ my Spotify artists' : '',
                    ...(t.sources.artists ?? []).map((a) => `♪ ${a}`),
                    t.sources.onThisDay ? 'On this day' : '',
                    t.sources.quakeMinMag ? `quakes M${t.sources.quakeMinMag}+` : '',
                    t.sources.f1 ? 'F1' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
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
              <Switch value={d.enabled} onValueChange={(v) => saveD({ ...d, enabled: v })} trackColor={{ true: colors.up }} />
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

        <Text style={[ui.label, styles.section]}>🎬 TMDB key (movies & series)</Text>
        <Text style={ui.muted}>
          Free at themoviedb.org: sign up, then Settings → API. Either the "API Key" or the "Read Access Token" works. Kept in the phone's keystore. This
          product uses the TMDB API but is not endorsed or certified by TMDB.
        </Text>
        <Text style={ui.body}>{maskKey(tmdbKey)}</Text>
        <TextInput
          value={keyDraft}
          onChangeText={(v) => {
            setKeyDraft(v);
            setKeyMsg('');
          }}
          placeholder="Paste the key"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          {...inputColors}
        />
        <View style={styles.chips}>
          <Pill
            label="Save key"
            variant="solid"
            disabled={!keyDraft.trim()}
            onPress={async () => {
              setKeyMsg('Checking…');
              if (!(await testTmdbKey(keyDraft))) return setKeyMsg("TMDB didn't accept that key. Copied all of it?");
              await setKey('tmdb', keyDraft);
              setTmdbKey(keyDraft.trim());
              setKeyDraft('');
              setKeyMsg('Saved. Pick lists or people in a topic.');
            }}
          />
          {tmdbKey && (
            <Pill
              label="Remove"
              onPress={async () => {
                await setKey('tmdb', '');
                setTmdbKey(null);
              }}
            />
          )}
        </View>
        {!!keyMsg && <Text style={ui.muted}>{keyMsg}</Text>}

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
    </Page>
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
  const [feeds, setFeeds] = useState(topic?.sources.feeds?.join('\n') ?? '');
  const [devtoTags, setDevtoTags] = useState(topic?.sources.devtoTags?.join(', ') ?? '');
  const [arxiv, setArxiv] = useState(topic?.sources.arxiv ?? false);
  const [tmdbLists, setTmdbLists] = useState<string[]>(topic?.sources.tmdbLists ?? []);
  const [tmdbPeople, setTmdbPeople] = useState(topic?.sources.tmdbPeople?.join(', ') ?? '');
  const [artists, setArtists] = useState(topic?.sources.artists?.join(', ') ?? '');
  const [quakeMin, setQuakeMin] = useState(topic?.sources.quakeMinMag ?? 0);
  const [quakeArea, setQuakeArea] = useState<'near' | 'turkey'>(topic?.sources.quakeArea ?? 'near');
  const [f1, setF1] = useState(topic?.sources.f1 ?? false);
  const [spotifyArtists, setSpotifyArtists] = useState(topic?.sources.spotifyArtists ?? false);
  const [onThisDay, setOnThisDay] = useState(topic?.sources.onThisDay ?? false);
  const [busy, setBusy] = useState(false);

  // the sources this topic uses: only those are open in the form, the rest wait as "＋" chips
  const sources: { key: string; label: string; used: boolean; open: () => void; clear: () => void }[] = [
    { key: 'youtube', label: 'YouTube', used: !!youtube.trim(), open: () => {}, clear: () => setYoutube('') },
    { key: 'rss', label: 'RSS', used: !!feeds.trim(), open: () => {}, clear: () => setFeeds('') },
    {
      key: 'music',
      label: 'Music',
      used: !!artists.trim() || spotifyArtists,
      open: () => setSpotifyArtists(true), // your Spotify top artists: works with one tap
      clear: () => (setArtists(''), setSpotifyArtists(false)),
    },
    { key: 'movies', label: 'Movies', used: tmdbLists.length > 0 || !!tmdbPeople.trim(), open: () => {}, clear: () => (setTmdbLists([]), setTmdbPeople('')) },
    { key: 'quakes', label: 'Quakes', used: quakeMin > 0, open: () => setQuakeMin(3), clear: () => setQuakeMin(0) },
    { key: 'f1', label: 'F1', used: f1, open: () => setF1(true), clear: () => setF1(false) },
    { key: 'github', label: 'GitHub', used: !!repos.trim(), open: () => {}, clear: () => setRepos('') },
    { key: 'mastodon', label: 'Mastodon', used: !!tags.trim(), open: () => {}, clear: () => setTags('') },
    { key: 'devto', label: 'DEV', used: !!devtoTags.trim(), open: () => {}, clear: () => setDevtoTags('') },
    { key: 'arxiv', label: 'arXiv', used: arxiv, open: () => setArxiv(true), clear: () => setArxiv(false) },
    { key: 'history', label: 'On this day', used: onThisDay, open: () => setOnThisDay(true), clear: () => setOnThisDay(false) },
  ];
  const [open, setOpen] = useState(() => new Set(sources.filter((x) => x.used).map((x) => x.key)));
  const [skipOpen, setSkipOpen] = useState(!!exclude.trim());
  const add = (key: string) => {
    sources.find((x) => x.key === key)?.open();
    setOpen(new Set([...open, key]));
  };
  const remove = (key: string) => {
    sources.find((x) => x.key === key)?.clear();
    setOpen(new Set([...open].filter((k) => k !== key)));
  };
  /** One open source: its title, a ✕ that removes it (and what was in it), and its fields. */
  const box = (key: string, title: string, children: ReactNode) =>
    open.has(key) && (
      <View style={styles.source}>
        <View style={styles.sourceHead}>
          <Text style={styles.sourceTitle}>{title}</Text>
          <Pressable onPress={() => remove(key)} hitSlop={10} accessibilityLabel={`Remove ${title}`}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
        {children}
      </View>
    );
  // a name, plus something to follow: keywords, or any of the sources (a topic can be just quakes or artists)
  const follows =
    splitList(keywords).length > 0 ||
    [youtube, repos, tags, devtoTags, tmdbPeople, artists].some((v) => splitList(v).length > 0) ||
    /https?:\/\//i.test(feeds) ||
    arxiv ||
    spotifyArtists ||
    onThisDay ||
    tmdbLists.length > 0 ||
    quakeMin > 0 ||
    f1;
  const ok = !!name.trim() && follows;
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
          feeds: feeds.split(/[\s,]+/).map((f) => f.trim()).filter((f) => /^https?:\/\//i.test(f)),
          devtoTags: splitList(devtoTags).map((t) => t.replace(/^#/, '').toLowerCase()),
          arxiv,
          tmdbLists,
          tmdbPeople: splitList(tmdbPeople),
          artists: splitList(artists),
          quakeMinMag: quakeMin || null,
          quakeArea,
          f1,
          spotifyArtists,
          onThisDay,
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
      <Field label="Keywords for news (optional)" value={keywords} onChange={setKeywords} placeholder="Linux, Linux kernel" />
      {skipOpen ? (
        <Field label="Skip headlines with" value={exclude} onChange={setExclude} placeholder="fedora hat" />
      ) : (
        <Pressable onPress={() => setSkipOpen(true)} hitSlop={6}>
          <Text style={styles.link}>＋ Skip words</Text>
        </Pressable>
      )}

      {box('youtube', 'YouTube', <Field label="Channels" value={youtube} onChange={setYoutube} placeholder="@TheLinuxEXP, @DistroTube" />)}
      {box(
        'rss',
        'RSS',
        <Field
          label="Feeds, one per line (everything they post comes in)"
          value={feeds}
          onChange={setFeeds}
          placeholder={'https://www.phoronix.com/rss.php\nhttps://fedoramagazine.org/feed/'}
          multiline
        />,
      )}
      {box(
        'music',
        'Music',
        <>
          <View style={styles.switchRow}>
            <Text style={[ui.body, { flex: 1 }]}>My top Spotify artists (kept up to date)</Text>
            <Switch value={spotifyArtists} onValueChange={setSpotifyArtists} trackColor={{ true: colors.up }} />
          </View>
          <Field label="More artists (new albums, EPs and singles)" value={artists} onChange={setArtists} placeholder="Pinhani, Duman, Radiohead" />
        </>,
      )}
      {box(
        'movies',
        'Movies & series',
        <>
          <View style={styles.chips}>
            {TMDB_LISTS.map((l) => {
              const on = tmdbLists.includes(l.id);
              return <Pill key={l.id} label={l.label} variant={on ? 'on' : 'plain'} onPress={() => setTmdbLists(on ? tmdbLists.filter((x) => x !== l.id) : [...tmdbLists, l.id])} />;
            })}
          </View>
          <Field label="Directors & actors (their new films)" value={tmdbPeople} onChange={setTmdbPeople} placeholder="Christopher Nolan, Nuri Bilge Ceylan" />
        </>,
      )}
      {box(
        'quakes',
        'Earthquakes',
        <>
          <View style={styles.chips}>
            {QUAKE_MAGS.filter(Boolean).map((m) => (
              <Pill key={m} label={`${m}+`} variant={quakeMin === m ? 'on' : 'plain'} onPress={() => setQuakeMin(m)} />
            ))}
          </View>
          <View style={styles.chips}>
            <Pill label="Near Istanbul (300 km)" variant={quakeArea === 'near' ? 'on' : 'plain'} onPress={() => setQuakeArea('near')} />
            <Pill label="All of Turkey" variant={quakeArea === 'turkey' ? 'on' : 'plain'} onPress={() => setQuakeArea('turkey')} />
          </View>
        </>,
      )}
      {box('f1', 'Formula 1', <Text style={ui.muted}>The podium after each race, and the next race's start in Istanbul time.</Text>)}
      {box('github', 'GitHub', <Field label="Repos (new releases)" value={repos} onChange={setRepos} placeholder="torvalds/linux" />)}
      {box('mastodon', 'Mastodon', <Field label="Hashtags" value={tags} onChange={setTags} placeholder="linux, fedora" />)}
      {box('devto', 'DEV', <Field label="dev.to tags" value={devtoTags} onChange={setDevtoTags} placeholder="typescript, react, java" />)}
      {box('history', 'On this day', <Text style={ui.muted}>Three moments from history every morning, from Wikipedia.</Text>)}
      {box('arxiv', 'arXiv', <Text style={ui.muted}>Papers (AI, languages, software, OS, security) that mention the keywords.</Text>)}

      {sources.some((x) => !open.has(x.key)) && (
        <View style={styles.chips}>
          {sources
            .filter((x) => !open.has(x.key))
            .map((x) => (
              <Pill key={x.key} label={x.label} icon="add" onPress={() => add(x.key)} />
            ))}
        </View>
      )}
      {!ok && <Text style={ui.muted}>{name.trim() ? 'Add keywords or pick something to follow, then Save works.' : 'Give the topic a name, then Save works.'}</Text>}
      <View style={styles.chips}>
        <Pill label={busy ? 'Saving…' : 'Save'} variant="solid" onPress={save} disabled={!ok || busy} />
        <Pill label="Cancel" onPress={onCancel} />
        {onDelete && <Pill label="Delete" icon="trash-outline" onPress={onDelete} />}
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]}
        {...inputColors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  section: { marginTop: 22 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  topicName: { color: colors.paper, fontSize: 16, fontFamily: fonts.sansBold, marginBottom: 2 },
  form: { padding: 16, gap: 14 },
  fieldLabel: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 13 },
  input: { backgroundColor: '#333232', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: colors.paper, fontFamily: fonts.sansRegular, fontSize: 15 }, // Lifelog's text field
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchOn: { borderWidth: 3, borderColor: colors.paper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { color: colors.muted, fontFamily: fonts.sansRegular, fontSize: 14 },
  source: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  sourceHead: { flexDirection: 'row', alignItems: 'center' },
  sourceTitle: { flex: 1, color: colors.paper, fontFamily: fonts.sansBold, fontSize: 15 },
});
