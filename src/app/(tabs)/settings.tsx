import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DEFAULT_CHAT_MODEL, testClaudeKey } from '../../lib/claude';
import { getSetting, setSetting } from '../../lib/db';
import { embed, indexPending, indexStats } from '../../lib/embeddings';
import { getKey, maskKey, setKey, type Provider } from '../../lib/keys';
import { colors, radius } from '../../lib/theme';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'busy') return <ActivityIndicator color={colors.muted} style={{ marginTop: 8 }} />;
  return (
    <Text style={{ marginTop: 8, color: status.kind === 'ok' ? colors.ok : colors.danger }}>{status.msg}</Text>
  );
}

function Button({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable style={[styles.btn, ghost && styles.btnGhost]} onPress={onPress}>
      <Text style={[styles.btnText, ghost && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** One reusable card for any provider's API key (DRY ✅). */
function KeyCard(props: {
  provider: Provider;
  title: string;
  hint: string;
  test: (key: string) => Promise<void>;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useFocusEffect(
    useCallback(() => {
      getKey(props.provider).then(setSaved);
    }, [props.provider]),
  );

  const run = async (fn: () => Promise<string>) => {
    setStatus({ kind: 'busy' });
    try {
      setStatus({ kind: 'ok', msg: await fn() });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };

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
      if (!key) throw new Error('No key to test.');
      await props.test(key);
      return 'Works! ✅';
    });

  const remove = () =>
    run(async () => {
      await setKey(props.provider, '');
      setSaved(null);
      return 'Key removed.';
    });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.hint}>{props.hint}</Text>
      <Text style={styles.current}>Current: {maskKey(saved)}</Text>
      <TextInput
        style={styles.input}
        placeholder="Paste API key"
        placeholderTextColor={colors.muted}
        value={draft}
        onChangeText={setDraft}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <Button label="Save" onPress={save} />
        <Button label="Test" onPress={test} ghost />
        {saved && <Button label="Remove" onPress={remove} ghost />}
      </View>
      <StatusLine status={status} />
    </View>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState('');
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [stats, setStats] = useState({ done: 0, waiting: 0 });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [indexStatus, setIndexStatus] = useState<Status>({ kind: 'idle' });

  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'profile').then(setProfile);
      getSetting(db, 'chatModel', DEFAULT_CHAT_MODEL).then(setModel);
      indexStats(db).then(setStats);
    }, [db]),
  );

  const saveProfile = async () => {
    await setSetting(db, 'profile', profile);
    await setSetting(db, 'chatModel', model.trim() || DEFAULT_CHAT_MODEL);
    setStatus({ kind: 'ok', msg: 'Saved.' });
  };

  const reindex = async () => {
    setIndexStatus({ kind: 'busy' });
    const n = await indexPending(db);
    const s = await indexStats(db);
    setStats(s);
    setIndexStatus(
      s.waiting === 0
        ? { kind: 'ok', msg: `Embedded ${n} chunk(s). All caught up.` }
        : { kind: 'err', msg: `Embedded ${n}, ${s.waiting} still waiting. Check the Gemini key or connection.` },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={90}>
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
        <KeyCard
          provider="anthropic"
          title="Claude (chat)"
          hint="console.anthropic.com → API Keys. Starts with sk-ant-"
          test={(key) => testClaudeKey(key, model.trim() || DEFAULT_CHAT_MODEL)}
        />
        <KeyCard
          provider="gemini"
          title="Gemini (memory search)"
          hint="aistudio.google.com → Get API key. Enable billing so your notes aren't used for training."
          test={async (key) => {
            await embed('test', 'RETRIEVAL_QUERY', key);
          }}
        />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>About me</Text>
          <Text style={styles.hint}>
            Who you are, your job, people in your life, goals. The AI reads this every time.
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 140 }]}
            multiline
            textAlignVertical="top"
            placeholder="I'm Arda, 30, I live in Istanbul…"
            placeholderTextColor={colors.muted}
            value={profile}
            onChangeText={setProfile}
          />
          <Text style={[styles.hint, { marginTop: 12 }]}>Chat model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <Button label="Save" onPress={saveProfile} />
          </View>
          <StatusLine status={status} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Memory index</Text>
          <Text style={styles.hint}>
            {stats.done} chunk(s) indexed · {stats.waiting} waiting. New entries are embedded automatically.
          </Text>
          <View style={styles.row}>
            <Button label="Index now" onPress={reindex} ghost />
          </View>
          <StatusLine status={indexStatus} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius, padding: 16 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  current: { color: colors.accent, fontSize: 13, marginTop: 10, fontFamily: 'monospace' },
  input: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.accentText, fontWeight: '700' },
});
