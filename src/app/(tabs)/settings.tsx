import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton, SectionTitle, StatusLine, type Status } from '../../components/ui';
import { getChatConfig, getChatModel, PROVIDERS, saveChatConfig } from '../../lib/chat';
import { getSetting, setSetting } from '../../lib/db';
import { embed, indexPending, indexStats } from '../../lib/embeddings';
import { getKey, maskKey, setKey, type Provider } from '../../lib/keys';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

function useStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const run = async (fn: () => Promise<string>) => {
    setStatus({ kind: 'busy' });
    try {
      setStatus({ kind: 'ok', msg: await fn() });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };
  return [status, run, setStatus] as const;
}

/** One reusable block for any provider's API key (DRY ✅). */
function KeyBlock(props: { provider: Provider; title: string; hint: string; test: (key: string) => Promise<void> }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getKey(props.provider).then(setSaved);
    }, [props.provider]),
  );

  const save = () =>
    run(async () => {
      if (!draft.trim()) throw new Error('Paste a key first.');
      await setKey(props.provider, draft);
      setSaved(draft.trim());
      setDraft('');
      return 'Saved to the encrypted keystore.';
    });

  const test = () =>
    run(async () => {
      const key = draft.trim() || saved;
      if (!key) throw new Error('There is no key to test yet.');
      await props.test(key);
      return 'This key works.';
    });

  const remove = () =>
    run(async () => {
      await setKey(props.provider, '');
      setSaved(null);
      return 'Key removed.';
    });

  return (
    <View>
      <View style={styles.keyHeader}>
        <Text style={styles.keyTitle}>{props.title}</Text>
        <View style={styles.keyState}>
          <View style={[styles.dot, { backgroundColor: saved ? colors.ok : colors.line }]} />
          <Text style={styles.keyStateText}>{saved ? maskKey(saved) : 'Not set'}</Text>
        </View>
      </View>
      <Text style={styles.hint}>{props.hint}</Text>
      <TextInput
        style={styles.input}
        placeholder={saved ? 'Paste a new key to replace it' : 'Paste your key here'}
        placeholderTextColor={colors.muted}
        value={draft}
        onChangeText={setDraft}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={colors.text}
      />
      <View style={styles.row}>
        <PillButton label="Save" onPress={save} />
        <PillButton label="Test" onPress={test} ghost />
        {saved && <PillButton label="Remove" onPress={remove} ghost />}
      </View>
      <StatusLine status={status} />
    </View>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('');
  const [stats, setStats] = useState({ done: 0, waiting: 0 });
  const [chatStatus, runChat, setChatStatus] = useStatus();
  const [profileStatus, runProfile] = useStatus();
  const [indexStatus, runIndex] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'name').then(setName);
      getSetting(db, 'profile').then(setProfile);
      getChatConfig(db).then((c) => {
        setProvider(c.provider);
        setModel(c.model);
      });
      indexStats(db).then(setStats);
    }, [db]),
  );

  const pickProvider = async (p: Provider) => {
    setProvider(p);
    setModel(await getChatModel(db, p));
    setChatStatus({ kind: 'idle' });
  };

  const saveChat = () =>
    runChat(async () => {
      await saveChatConfig(db, provider, model);
      return `Your friend now talks through ${PROVIDERS[provider].label}.`;
    });

  const testChat = () =>
    runChat(async () => {
      const key = await getKey(provider);
      if (!key) throw new Error(`Save a ${PROVIDERS[provider].label} key first.`);
      await PROVIDERS[provider].test(key, model.trim() || PROVIDERS[provider].defaultModel);
      return 'The model answered. Tap Save to use it.';
    });

  const saveProfile = () =>
    runProfile(async () => {
      await setSetting(db, 'name', name.trim());
      await setSetting(db, 'profile', profile);
      return 'Saved.';
    });

  const reindex = () =>
    runIndex(async () => {
      const n = await indexPending(db);
      const s = await indexStats(db);
      setStats(s);
      if (s.waiting) throw new Error(`${s.waiting} piece(s) still waiting. Check the Gemini key or your connection.`);
      return n ? `Indexed ${n} new piece(s). Everything is searchable.` : 'Everything is already searchable.';
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: TAB_BAR_SPACE + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Settings</Text>

        <Section title="About You" hint="Your friend reads this before every reply.">
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Arda"
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
          />
          <Text style={styles.label}>Who you are</Text>
          <TextInput
            style={[styles.input, styles.profile]}
            multiline
            textAlignVertical="top"
            placeholder="Job, people in your life, goals, what matters to you…"
            placeholderTextColor={colors.muted}
            value={profile}
            onChangeText={setProfile}
            selectionColor={colors.text}
          />
          <View style={styles.row}>
            <PillButton label="Save" onPress={saveProfile} />
          </View>
          <StatusLine status={profileStatus} />
        </Section>

        <Section title="Chat" hint="Which AI your friend runs on.">
          <View style={styles.segment}>
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
              <Pressable
                key={p}
                style={[styles.segmentItem, p === provider && styles.segmentActive]}
                onPress={() => pickProvider(p)}
              >
                <Text style={[styles.segmentText, p === provider && styles.segmentTextActive]}>
                  {PROVIDERS[p].label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={colors.text}
          />
          <View style={styles.row}>
            <PillButton label="Save" onPress={saveChat} />
            <PillButton label="Test" onPress={testChat} ghost />
          </View>
          <StatusLine status={chatStatus} />
        </Section>

        <Section title="API Keys" hint="Kept in your phone's encrypted keystore. Only sent to the AI you call.">
          <KeyBlock
            provider="gemini"
            title="Gemini"
            hint="From aistudio.google.com. Powers search, and chat when Gemini is picked. Turn on billing so Google doesn't train on your journal."
            test={async (key) => {
              await embed('test', 'RETRIEVAL_QUERY', key);
            }}
          />
          <View style={styles.divider} />
          <KeyBlock
            provider="anthropic"
            title="Claude"
            hint="Optional. From console.anthropic.com, starts with sk-ant-."
            test={async (key) => PROVIDERS.anthropic.test(key, await getChatModel(db, 'anthropic'))}
          />
        </Section>

        <Section title="Memory">
          <Text style={styles.stat}>
            {stats.done} {stats.done === 1 ? 'piece' : 'pieces'} of your journal can be found by meaning
            {stats.waiting ? `, ${stats.waiting} waiting` : ''}.
          </Text>
          <Text style={styles.hint}>New entries are indexed when you save them.</Text>
          <View style={styles.row}>
            <PillButton label="Index now" onPress={reindex} ghost />
          </View>
          <StatusLine status={indexStatus} />
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 30 },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.text },

  section: { gap: 6 },
  sectionHint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 8 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 18 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 20 },

  keyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  keyTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.text },
  keyState: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  keyStateText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },

  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 14 },
  stat: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 25, color: colors.text, marginBottom: 6 },

  input: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  profile: { minHeight: 140, lineHeight: 22 },

  segment: { flexDirection: 'row', backgroundColor: colors.raised, borderRadius: radius.pill, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 11, borderRadius: radius.pill, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted },
  segmentTextActive: { fontFamily: fonts.sans, color: colors.accentText },

  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
