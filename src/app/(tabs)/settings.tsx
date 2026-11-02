import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authenticate, canUseBiometrics } from '../../components/LockGate';
import { PillButton, SectionTitle, StatusLine, type Status } from '../../components/ui';
import { backupNow, getPassphrase, lastBackupAt, restoreFromFile, setPassphrase } from '../../lib/backup';
import {
  getCheckinSettings,
  ROTATION,
  saveCheckinSettings,
  shiftFor,
  SHIFTS,
  type CheckinSettings,
  type Shift,
} from '../../lib/checkins';
import { deleteFact, listFacts, type Fact } from '../../lib/facts';
import {
  backgroundAvailable,
  lastBackgroundRun,
  maybeSendDigest,
  runResearch,
  syncBackgroundTask,
} from '../../lib/autonomy';
import {
  getAutonomySettings,
  parseNeverList,
  saveAutonomySettings,
  type AutonomySettings,
} from '../../lib/autonomySettings';
import { formatDate } from '../../lib/notes';
import {
  dayParam,
  getPlannerSettings,
  midnight,
  PUSH_LEVELS,
  savePlannerSettings,
  type PlannerSettings,
} from '../../lib/planner';
import { weekStart } from '../../lib/recap';
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

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.keyTitle}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.raised, true: colors.accent }}
        thumbColor={value ? colors.accentText : colors.muted}
      />
    </View>
  );
}

function Segment<T extends string>(props: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {props.options.map((o) => (
        <Pressable
          key={o.key}
          style={[styles.segmentItem, o.key === props.value && styles.segmentActive]}
          onPress={() => props.onChange(o.key)}
        >
          <Text style={[styles.segmentText, o.key === props.value && styles.segmentTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Fingerprint lock + encrypted backup / restore. */
function PrivacySection() {
  const db = useSQLiteContext();
  const [lock, setLock] = useState(false);
  const [hasPass, setHasPass] = useState(false);
  const [pass, setPass] = useState('');
  const [last, setLast] = useState(0);
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'lockEnabled').then((v) => setLock(v === '1'));
      getPassphrase().then((p) => setHasPass(!!p));
      lastBackupAt(db).then(setLast);
    }, [db]),
  );

  const toggleLock = (on: boolean) =>
    run(async () => {
      if (on && !(await canUseBiometrics())) throw new Error('Set up a fingerprint or screen lock in Android settings first.');
      if (!(await authenticate(on ? 'Turn on the lock' : 'Turn off the lock'))) throw new Error('Not changed.');
      await setSetting(db, 'lockEnabled', on ? '1' : '0');
      setLock(on);
      return on ? 'Lifelog now asks for your fingerprint.' : 'Lock is off.';
    });

  const savePass = () =>
    run(async () => {
      await setPassphrase(pass);
      setPass('');
      setHasPass(true);
      return "Passphrase saved. Write it down somewhere: without it a backup can't be opened.";
    });

  const backup = () =>
    run(async () => {
      await backupNow(db);
      setLast(Date.now());
      return 'Backup created. If you picked Drive, it is safe there.';
    });

  const restore = () => {
    if (!pass.trim()) {
      Alert.alert('Type the passphrase first', 'Enter the passphrase the backup was made with, then tap Restore.');
      return;
    }
    Alert.alert('Replace everything?', 'All entries, chats and settings on this phone are replaced with the backup.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            const ok = await restoreFromFile(db, pass);
            if (!ok) return 'No file picked.';
            await setPassphrase(pass);
            setPass('');
            setHasPass(true);
            return 'Restored. Welcome back.';
          }),
      },
    ]);
  };

  return (
    <Section title="Privacy" hint="Your journal never leaves this phone, except as an encrypted backup.">
      <Toggle label="Fingerprint lock" hint="Asked when the app opens." value={lock} onChange={toggleLock} />
      <View style={styles.divider} />
      <Text style={styles.keyTitle}>Backup</Text>
      <Text style={styles.hint}>
        {last ? `Last backup: ${formatDate(last)}.` : 'No backup yet.'} The file is encrypted with your passphrase.
        Pick Drive in the share sheet to keep it safe.
      </Text>
      <TextInput
        style={styles.input}
        placeholder={hasPass ? 'Passphrase saved. Type to change it or to restore' : 'Choose a backup passphrase'}
        placeholderTextColor={colors.muted}
        value={pass}
        onChangeText={setPass}
        secureTextEntry
        autoCapitalize="none"
        selectionColor={colors.text}
      />
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        {!!pass.trim() && <PillButton label="Save passphrase" onPress={savePass} ghost />}
        <PillButton label="Back up now" onPress={backup} disabled={!hasPass} />
        <PillButton label="Restore" onPress={restore} ghost />
      </View>
      <StatusLine status={status} />
    </Section>
  );
}

/** Messages from the friend at break time, following the shift rotation. */
function CheckinSection() {
  const db = useSQLiteContext();
  const [s, setS] = useState<CheckinSettings | null>(null);
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getCheckinSettings(db).then(setS);
    }, [db]),
  );
  if (!s) return null;

  const thisWeek = shiftFor(s, Date.now());
  const update = (patch: Partial<CheckinSettings>) => setS({ ...s, ...patch });
  const setThisWeek = (shift: Shift) => update({ anchorWeek: weekStart(Date.now()), anchorShift: shift });

  const save = (next = s) =>
    run(async () => {
      await saveCheckinSettings(db, next);
      return next.enabled ? 'Saved. Your next check-ins are being written.' : 'Check-ins are off.';
    });

  return (
    <Section title="Check-ins" hint="Your friend messages you at break time. Never during work, never on Sundays.">
      <Toggle
        label="Message me on breaks"
        value={s.enabled}
        onChange={(enabled) => {
          const next = { ...s, enabled };
          setS(next);
          save(next);
        }}
      />
      {s.enabled && (
        <>
          <Text style={styles.label}>This week I'm on</Text>
          <Segment options={SHIFTS} value={thisWeek} onChange={setThisWeek} />
          <Text style={styles.hint}>
            Rotation: {ROTATION.map((r) => SHIFTS.find((x) => x.key === r)!.label).join(', then ')}.
          </Text>
          <Text style={styles.label}>Break time for each shift</Text>
          <View style={styles.times}>
            {SHIFTS.map((sh) => (
              <View key={sh.key} style={{ flex: 1 }}>
                <Text style={styles.timeLabel}>{sh.label}</Text>
                <TextInput
                  style={[styles.input, { textAlign: 'center' }]}
                  value={s.times[sh.key]}
                  onChangeText={(t) => update({ times: { ...s.times, [sh.key]: t } })}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  selectionColor={colors.text}
                />
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <PillButton label="Save" onPress={() => save()} />
          </View>
        </>
      )}
      <StatusLine status={status} />
    </Section>
  );
}

/** The friend acting without being asked: research, activities, one daily message. */
function AutonomySection() {
  const db = useSQLiteContext();
  const [s, setS] = useState<AutonomySettings | null>(null);
  const [never, setNever] = useState('');
  const [lastRun, setLastRun] = useState(0);
  const [available, setAvailable] = useState(true);
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getAutonomySettings(db).then((a) => {
        setS(a);
        setNever(a.never.join(', '));
      });
      lastBackgroundRun(db).then(setLastRun);
      backgroundAvailable().then(setAvailable).catch(() => {});
    }, [db]),
  );
  if (!s) return null;

  const save = (next = s) =>
    run(async () => {
      const full = { ...next, never: parseNeverList(never) };
      await saveAutonomySettings(db, full);
      await syncBackgroundTask(db);
      setS(full);
      return full.enabled ? 'Saved. Your friend checks in every few hours.' : 'Off. Your friend only acts when you open the app.';
    });

  const runNow = () =>
    run(async () => {
      await save();
      const researched = await runResearch(db);
      const digest = await maybeSendDigest(db, true);
      if (digest === 'sent') return `Done. Looked up ${researched} thing(s), your message is in the chat.`;
      return researched
        ? `Looked up ${researched} thing(s), but there was nothing worth a message yet.`
        : 'Nothing to look up or suggest right now. Write a few entries and try again.';
    });

  const ago = lastRun ? Math.round((Date.now() - lastRun) / 3600e3) : null;

  return (
    <Section
      title="On Its Own"
      hint="Your friend looks things up from what you write, finds things to do nearby, and sends one message a day. No asking."
    >
      <Toggle
        label="Let my friend act on its own"
        hint="Runs every few hours in the background, and whenever you open the app."
        value={s.enabled}
        onChange={(enabled) => {
          const next = { ...s, enabled };
          setS(next);
          save(next);
        }}
      />
      {s.enabled && (
        <>
          <Text style={styles.label}>Daily message time</Text>
          <TextInput
            style={[styles.input, { width: 100, textAlign: 'center' }]}
            value={s.digestTime}
            onChangeText={(digestTime) => setS({ ...s, digestTime })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            selectionColor={colors.text}
          />
          <Text style={[styles.hint, { marginTop: 6 }]}>Only sent when there's something worth it. Never more than once a day.</Text>

          <Text style={styles.label}>Web searches about your entries, per day</Text>
          <Segment
            options={[
              { key: '1', label: '1' },
              { key: '3', label: '3' },
              { key: '5', label: '5' },
            ]}
            value={String(s.researchPerDay) as '1' | '3' | '5'}
            onChange={(v) => setS({ ...s, researchPerDay: Number(v) })}
          />

          <View style={{ marginTop: 16 }}>
            <Toggle
              label="Find things to do nearby"
              hint="Once a day, using your city from Days Off."
              value={s.activities}
              onChange={(activities) => setS({ ...s, activities })}
            />
          </View>

          <Text style={styles.label}>Never look up</Text>
          <TextInput
            style={[styles.input, { minHeight: 70 }]}
            multiline
            textAlignVertical="top"
            value={never}
            onChangeText={setNever}
            placeholder="Topics to keep to yourself, separated by commas"
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
          />
          <Text style={[styles.hint, { marginTop: 6 }]}>
            Entries stay on your phone, but searches go to Google. Anything listed here is never searched.
          </Text>

          <View style={styles.bgBox}>
            <Text style={styles.keyTitle}>Background</Text>
            <Text style={styles.hint}>
              {!available
                ? 'Android is blocking background work for Lifelog.'
                : ago === null
                  ? "Hasn't run in the background yet. Give it a few hours."
                  : `Last ran in the background ${ago === 0 ? 'less than an hour' : `${ago} hour${ago === 1 ? '' : 's'}`} ago.`}
            </Text>
            <Text style={[styles.hint, { marginTop: 6 }]}>
              On Xiaomi, turn on Autostart and set Battery saver to "No restrictions" for Lifelog, or HyperOS will stop it.
            </Text>
            <View style={styles.row}>
              <PillButton label="Open app settings" onPress={() => Linking.openSettings()} ghost />
            </View>
          </View>
        </>
      )}
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <PillButton label="Save" onPress={() => save()} />
        {s.enabled && <PillButton label="Run now" onPress={runNow} ghost />}
      </View>
      <StatusLine status={status} />
    </Section>
  );
}

/** Where you are and how hard to push: the day planner's settings. */
function DaysOffSection() {
  const db = useSQLiteContext();
  const [s, setS] = useState<PlannerSettings | null>(null);
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getPlannerSettings(db).then(setS);
    }, [db]),
  );
  if (!s) return null;

  const save = (next = s) =>
    run(async () => {
      const saved = await savePlannerSettings(db, next);
      setS(saved);
      return saved.place ? `Saved. Planning around ${saved.place}.` : 'Saved.';
    });

  const plan = (offset: number) => {
    if (!s.place) {
      Alert.alert('Set your city first', 'Type your district or city and tap Save.');
      return;
    }
    router.push(`/plan/${dayParam(midnight(Date.now()) + offset * 86_400_000)}`);
  };

  return (
    <Section title="Days Off" hint="Your friend plans free days: weather, real events nearby, your goals, and a push to see people.">
      <Text style={styles.label}>Your district or city</Text>
      <TextInput
        style={styles.input}
        value={s.city}
        onChangeText={(city) => setS({ ...s, city })}
        placeholder="e.g. Maltepe"
        placeholderTextColor={colors.muted}
        selectionColor={colors.text}
      />
      {!!s.place && <Text style={[styles.hint, { marginTop: 6 }]}>Found: {s.place}</Text>}
      <Text style={styles.label}>How hard should I push you to be social?</Text>
      <Segment options={PUSH_LEVELS} value={s.push} onChange={(push) => setS({ ...s, push })} />
      <View style={{ marginTop: 16 }}>
        <Toggle
          label="Remind me the evening before"
          hint="At 20:00 before Sundays, and before the Saturday after Night week."
          value={s.reminders}
          onChange={(reminders) => setS({ ...s, reminders })}
        />
      </View>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <PillButton label="Save" onPress={() => save()} />
        <PillButton label="Plan today" onPress={() => plan(0)} ghost />
        <PillButton label="Plan tomorrow" onPress={() => plan(1)} ghost />
      </View>
      <StatusLine status={status} />
    </Section>
  );
}

/** Facts the friend pulled out of the journal. Wrong ones can be removed. */
function LearnedSection() {
  const db = useSQLiteContext();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [all, setAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listFacts(db).then(setFacts);
    }, [db]),
  );

  const remove = async (id: number) => {
    await deleteFact(db, id);
    setFacts((f) => f.filter((x) => x.id !== id));
  };

  const shown = all ? facts : facts.slice(0, 8);
  return (
    <Section title="What I've Learned" hint="Picked up from your entries. Remove anything that's wrong.">
      {facts.length === 0 ? (
        <Text style={styles.hint}>Nothing yet. Write a few entries and check back.</Text>
      ) : (
        shown.map((f) => (
          <View key={f.id} style={styles.fact}>
            <Text style={styles.factText}>{f.text}</Text>
            <Pressable onPress={() => remove(f.id)} hitSlop={10} accessibilityLabel="Forget this">
              <Text style={styles.factRemove}>Forget</Text>
            </Pressable>
          </View>
        ))
      )}
      {facts.length > 8 && (
        <Pressable onPress={() => setAll(!all)} style={{ marginTop: 12 }}>
          <Text style={styles.more}>{all ? 'Show less' : `Show all ${facts.length}`}</Text>
        </Pressable>
      )}
    </Section>
  );
}

/** Silent proofreading of entries, no lessons. */
function WritingSection() {
  const db = useSQLiteContext();
  const [auto, setAuto] = useState(false);
  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'autoGrammar').then((v) => setAuto(v === '1'));
    }, [db]),
  );
  const toggle = async (on: boolean) => {
    setAuto(on);
    await setSetting(db, 'autoGrammar', on ? '1' : '0');
  };
  return (
    <Section title="Writing" hint="The sparkles button in an entry fixes grammar any time, with Undo.">
      <Toggle
        label="Fix grammar when I save"
        hint="Spelling, grammar and punctuation only. Your words, tone and Turkish stay as they are."
        value={auto}
        onChange={toggle}
      />
    </Section>
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

        <WritingSection />

        <LearnedSection />

        <Section title="Chat" hint="Which AI your friend runs on.">
          <Segment
            options={(Object.keys(PROVIDERS) as Provider[]).map((p) => ({ key: p, label: PROVIDERS[p].label }))}
            value={provider}
            onChange={pickProvider}
          />
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

        <CheckinSection />

        <DaysOffSection />

        <AutonomySection />

        <PrivacySection />

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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bgBox: { marginTop: 18, padding: 14, borderRadius: radius.sm, backgroundColor: colors.raised },
  times: { flexDirection: 'row', gap: 8 },
  timeLabel: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center' },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  factText: { flex: 1, fontFamily: fonts.serif, fontSize: 15, lineHeight: 22, color: colors.text },
  factRemove: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, paddingTop: 2 },
  more: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
});
