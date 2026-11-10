import Ionicons, { ICON_STYLES, setIconStyle, useIconStyle } from '../../components/Icon';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Children, cloneElement, isValidElement, useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authenticate, canUseBiometrics } from '../../components/LockGate';
import * as IntentLauncher from 'expo-intent-launcher';
import { bigTitleMotion, CollapsingHeader, useCollapsingHeader } from '../../components/CollapsingHeader';
import { haptic } from '../../components/motion';
import {
  connectSpotify,
  disconnectSpotify,
  getSpotifyClientId,
  setSpotifyClientId,
  SPOTIFY_REDIRECT,
  spotifyConnected,
  remoteReady,
  spotifyName,
  testPlayback,
  likedAccess,
} from '../../lib/spotify';
import { bannedSongs, getRadioPrefs, likedSongs, saveRadioPrefs, toggleLiked, unbanSong, type RadioPrefs, type SongRef } from '../../lib/songMemory';
import { Chip, IconButton, InfoButton, PillButton, SectionTitle, StatusLine, type Status } from '../../components/ui';
import { UsageSection } from '../../components/UsageSection';
import { IconTile } from '../../components/IconTile';
import { requestPinWidget } from 'react-native-android-widget';
import { exportJson } from '../../lib/insights';
import { SETTINGS_PAGES, type SettingsPage } from '../../lib/settingsPages';
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
import { planAhead } from '../../lib/ahead';
import { learnFromChats } from '../../lib/chatMemory';
import { writePendingReads } from '../../lib/reads';
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
import { getBackgroundModel, getChatConfig, getChatModel, getJobProvider, getRadioModel, MODEL_CHOICES, PROVIDERS, saveChatConfig, setJobProvider, type Job } from '../../lib/chat';
import { VOICE_MODELS } from '../../lib/tts';
import { priceHint } from '../../lib/usage';
import { getSetting, setSetting } from '../../lib/db';
import { embed, indexPending, indexStats } from '../../lib/embeddings';
import { getKey, maskKey, setKey, type Provider } from '../../lib/keys';
import { useBottomSpace } from '../../components/MiniPlayer';
import { colors, inputColors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

/** A field name or a switch at the very top of a panel doesn't need the space it keeps above itself elsewhere. */
function flushTop(children: ReactNode): ReactNode {
  const all = Children.toArray(children);
  const first = all[0];
  if (!isValidElement<{ style?: unknown; first?: boolean }>(first)) return children;
  if (first.type === Toggle) all[0] = cloneElement(first, { first: true });
  else if (first.props.style === styles.label) all[0] = cloneElement(first, { style: [styles.label, { marginTop: 0 }] });
  return all;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      <View style={styles.panel}>{flushTop(children)}</View>
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
        {...inputColors}
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

function Toggle({
  label,
  hint,
  value,
  onChange,
  first,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean; // the top of a panel: no space above
}) {
  return (
    <View style={[styles.toggle, first && { marginTop: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.keyTitle}>{label}</Text>
        {hint && <Text style={[styles.hint, { marginTop: 3 }]}>{hint}</Text>}
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
      if (!(await authenticate(on ? 'Turn on the lock' : 'Turn off the lock')).ok) throw new Error('Not changed.');
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
      const name = await backupNow(db);
      setLast(Date.now());
      return `Made ${name}. If you picked Drive, tap Save in Drive's own dialog, or it won't upload.`;
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
      <Text style={[styles.hint, { marginTop: 6 }]}>
        To restore from Drive: open the Drive app, tap ⋮ on the .lifelog file, then Send a copy → Lifelog. Works even when
        the Restore picker doesn't show Drive (common on Xiaomi).
      </Text>
      <TextInput
        style={styles.input}
        placeholder={hasPass ? 'Passphrase saved. Type to change it or to restore' : 'Choose a backup passphrase'}
        placeholderTextColor={colors.muted}
        value={pass}
        onChangeText={setPass}
        secureTextEntry
        autoCapitalize="none"
        {...inputColors}
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
                  {...inputColors}
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

// Xiaomi's own settings pages; any other phone (or a renamed page) falls back to the app's settings
const openAutostart = () =>
  IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
    packageName: 'com.miui.securitycenter',
    className: 'com.miui.permcenter.autostart.AutoStartManagementActivity',
  }).catch(() => Linking.openSettings());
const openBatterySaver = () =>
  IntentLauncher.startActivityAsync('miui.intent.action.HIDDEN_APPS_CONFIG_ACTIVITY', {
    extra: { package_name: 'dev.arda.lifelog', package_label: 'Lifelog' },
  }).catch(() => Linking.openSettings());

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
      await learnFromChats(db);
      const researched = await runResearch(db);
      const wrote = await writePendingReads(db, true);
      const digest = await maybeSendDigest(db, true);
      const ahead = await planAhead(db, true);
      if (digest === 'sent' && wrote) return 'Done. A new Read is ready, and your message is in the chat.';
      if (digest === 'sent') return `Done. Looked up ${researched} thing(s), your message is in the chat.`;
      const week = ahead ? ` Your friend's next ${ahead} daily message(s) are scheduled.` : '';
      return researched
        ? `Looked up ${researched} thing(s), nothing worth a link yet.${week}`
        : `Nothing new to look up.${week}`;
    });

  const ago = lastRun ? Math.round((Date.now() - lastRun) / 3600e3) : null;
  const asleep = !available || ago === null || ago > 6; // the task should run every ~2 hours

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
            {...inputColors}
          />
          <Text style={[styles.hint, { marginTop: 6 }]}>
            One message every day: what it found for you, or just checking in. Written a week ahead, so it arrives even if
            Android keeps the app asleep.
          </Text>

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

          <View style={{ marginTop: 16 }}>
            <Toggle
              label="Write me a Read after chats"
              hint="When a chat goes quiet, your friend may research its topic and write you a short article. At most one a day."
              value={s.reads}
              onChange={(reads) => setS({ ...s, reads })}
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
            {...inputColors}
          />
          <Text style={[styles.hint, { marginTop: 6 }]}>
            Entries stay on your phone, but searches go to Google. Anything listed here is never searched.
          </Text>

          <View style={[styles.bgBox, asleep && styles.bgBoxWarn]}>
            <Text style={styles.keyTitle}>{asleep ? 'Xiaomi is putting me to sleep' : 'Background'}</Text>
            <Text style={styles.hint}>
              {!available
                ? 'Android is blocking background work for Lifelog.'
                : ago === null
                  ? "Hasn't run in the background yet. Give it a few hours."
                  : `Last woke up on its own ${ago === 0 ? 'less than an hour' : `${ago} hour${ago === 1 ? '' : 's'}`} ago.`}
            </Text>
            <Text style={[styles.hint, { marginTop: 6 }]}>
              HyperOS stops apps it doesn't trust. Turn on Autostart for Lifelog, then set Battery saver to "No
              restrictions". Messages written ahead still arrive either way.
            </Text>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <PillButton label="Autostart" onPress={openAutostart} ghost />
              <PillButton label="Battery saver" onPress={openBatterySaver} ghost />
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
        {...inputColors}
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

/** Your own Spotify app (Client ID), the login, and what it unlocks. */
function SpotifySection() {
  const db = useSQLiteContext();
  const [clientId, setClientId] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [status, run] = useStatus();

  useFocusEffect(
    useCallback(() => {
      getSpotifyClientId().then((id) => setClientId(id ?? ''));
      spotifyConnected().then((on) => (on ? spotifyName().then(setWho).catch(() => setWho('you')) : setWho(null)));
    }, []),
  );

  const connect = () =>
    run(async () => {
      await setSpotifyClientId(clientId);
      if (!(await connectSpotify())) return 'Cancelled.';
      const name = await spotifyName();
      setWho(name);
      await setSetting(db, 'spotify.likedAccess', '1'); // a fresh login includes Liked Songs
      await setSetting(db, 'spotify.liked', '{}');
      // also open the direct line to the Spotify app now (Spotify asks once to allow it)
      const direct = await remoteReady(true);
      return `Connected as ${name}.${direct ? ' Direct line to the Spotify app: on.' : ''} Ask your friend for a song, or open Radio from the Journal.`;
    });

  const disconnect = () =>
    run(async () => {
      await disconnectSpotify();
      setWho(null);
      return 'Disconnected.';
    });

  return (
    <Section
      title="Spotify"
      hint="Songs you can play right from the chat, the song you were listening to on every entry, and Lifelog Radio. Needs Premium."
    >
      {who ? (
        <>
          <Text style={styles.keyTitle}>Connected as {who}</Text>
          <Text style={styles.hint}>Test plays one song the way the radio does and says what Spotify sees.</Text>
          <View style={styles.row}>
            <PillButton label="Test playback" onPress={() => run(testPlayback)} />
            <PillButton label="Disconnect" onPress={disconnect} ghost />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            {'One-time setup, about 5 minutes:\n' +
              '1. Open developer.spotify.com/dashboard and tap Create app (any name).\n' +
              '2. Under Redirect URIs, add the address below. Tick "Web API" and save.\n' +
              '3. Open the app\'s Settings, copy the Client ID and paste it here.'}
          </Text>
          <Text style={styles.label}>Redirect URI (hold to copy)</Text>
          <Text selectable style={[styles.input, { color: colors.text }]}>
            {SPOTIFY_REDIRECT}
          </Text>
          <Text style={styles.label}>Client ID</Text>
          <TextInput
            style={styles.input}
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="32 letters and numbers"
            placeholderTextColor={colors.muted}
            {...inputColors}
          />
          <View style={styles.row}>
            <PillButton label="Connect Spotify" onPress={connect} />
          </View>
        </>
      )}
      <StatusLine status={status} />
    </Section>
  );
}

const HITS = [0, 1, 2, 3, 4].map((n) => ({ key: String(n), label: n ? String(n) : 'None' }));
const TALKS: { key: RadioPrefs['talk']; label: string }[] = [
  { key: 'short', label: 'Short' },
  { key: 'normal', label: 'Normal' },
  { key: 'long', label: 'Long' },
];
const KEEPS = [
  { key: '1', label: '1 day' },
  { key: '3', label: '3 days' },
  { key: '7', label: '1 week' },
  { key: '30', label: '1 month' },
];
const FAVS: { key: RadioPrefs['favourites']; label: string }[] = [
  { key: 'never', label: 'Never' },
  { key: 'sometimes', label: 'Sometimes' },
  { key: 'often', label: 'Often' },
];

/** How Lifelog Radio picks songs: hits vs deep cuts, favourites coming back, banned songs. */
function RadioSection() {
  const db = useSQLiteContext();
  const [p, setP] = useState<RadioPrefs | null>(null);
  const [bans, setBans] = useState<SongRef[]>([]);
  const [hearts, setHearts] = useState<SongRef[]>([]);
  const [access, setAccess] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getRadioPrefs(db).then(setP);
      bannedSongs(db).then(setBans);
      likedSongs(db).then(setHearts);
      likedAccess(db).then(setAccess);
    }, [db]),
  );
  if (!p) return null;

  const update = (patch: Partial<RadioPrefs>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveRadioPrefs(db, next);
  };

  return (
    <Section title="Radio" hint="How Lifelog Radio picks songs. Every show still digs for songs you haven't heard on it yet.">
      <Text style={styles.label}>Talk between songs</Text>
      <Segment options={TALKS} value={p.talk} onChange={(talk) => update({ talk })} />
      <Text style={styles.hint}>Long talks are more fun, and use more of Gemini's free voice quota.</Text>
      <Text style={styles.label}>Big hits per show</Text>
      <Segment options={HITS} value={String(p.hits)} onChange={(v) => update({ hits: Number(v) })} />
      <Text style={styles.hint}>The rest are deep cuts: album tracks, B-sides, forgotten gems.</Text>
      <View style={styles.labelRow}>
        <Text style={[styles.label, styles.labelInRow]}>Keep recent shows for</Text>
        <InfoButton
          title="Recent shows"
          points={[
            'Every radio show is kept with its whole script: closed by accident, stopped, or finished.',
            'On the Radio tab, Recent shows lets you Resume one where it stopped, or play it again From the start.',
            'Nothing is written again: the hosts say the same lines and jokes, with the same songs.',
            'The newest 3 shows also keep their voices (~20 MB each), so playing them again costs nothing.',
            'Older shows keep only the script; playing one voices the talks again, which uses some of the daily voice quota.',
            'Keeping shows is free: a few KB each on your phone. After the time you pick here, they are deleted.',
            'Tap Save show (or 🔖 in Recent shows) to keep a show for good, with all its voices. Saved shows ignore the time here.',
            'Settings → Usage shows how much room the radio takes on your phone.',
          ]}
        />
      </View>
      <Segment options={KEEPS} value={String(p.keepDays)} onChange={(v) => update({ keepDays: Number(v) })} />
      <Text style={styles.hint}>Tap ! to see how it works.</Text>
      <Text style={styles.label}>Your favourites coming back</Text>
      <Segment options={FAVS} value={p.favourites} onChange={(favourites) => update({ favourites })} />
      <Text style={styles.hint}>Songs from your entries, hearted songs and your Spotify Liked Songs go in one bag (a song on several lists gets more tickets); each show draws 2 (4 on Often). Songs that played lately get rarer.</Text>
      <Toggle
        label="Use my Spotify Liked Songs"
        hint={access ? undefined : 'Disconnect and connect Spotify again above to allow this.'}
        value={p.spotifyLiked}
        onChange={(spotifyLiked) => update({ spotifyLiked })}
      />
      <Toggle
        label="Surprise themes"
        hint="Each show gets a random twist: one-hit wonders, duets, one year of the era…"
        value={p.twists}
        onChange={(twists) => update({ twists })}
      />
      <SongList
        title="Hearted"
        icon="heart"
        empty="Tap the heart on the radio to keep a song coming back."
        songs={hearts}
        action="heart-dislike-outline"
        actionLabel="Remove the heart"
        onAction={async (s) => {
          await toggleLiked(db, s);
          setHearts((h) => h.filter((x) => x.id !== s.id));
        }}
      />
      <SongList
        title="Never play"
        icon="ban-outline"
        empty="Nothing banned. The 🚫 on the radio adds songs here."
        songs={bans}
        action="refresh-outline"
        actionLabel="Let it play again"
        onAction={async (s) => {
          await unbanSong(db, s.id);
          setBans((b) => b.filter((x) => x.id !== s.id));
        }}
      />
    </Section>
  );
}

/** A field name with a small icon in front (instead of an emoji). */
function Label({ icon, children }: { icon: ComponentProps<typeof Ionicons>['name']; children: ReactNode }) {
  return (
    <View style={styles.labelRow}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>{children}</Text>
    </View>
  );
}

/** A row of model chips for one provider; the current model shows even if it's a custom one. */
function ModelChips({ provider, value, onPick, extra }: { provider: Provider; value: string; onPick: (m: string) => void; extra?: { id: string; label: string } }) {
  const choices = MODEL_CHOICES[provider];
  const all = [...(extra ? [extra] : []), ...choices, ...(value && !choices.some((c) => c.id === value) && value !== extra?.id ? [{ id: value, label: value }] : [])];
  return (
    <View style={styles.chips}>
      {all.map((c) => (
        <Chip key={c.id} label={c.label} active={c.id === value} onPress={() => onPick(c.id)} />
      ))}
    </View>
  );
}

/** The other jobs: who writes the radio, who does the chores, which voice reads the radio. Saved on tap. */
function JobModels({ provider }: { provider: Provider }) {
  const db = useSQLiteContext();
  const [radioOn, setRadioOn] = useState<Provider | ''>(''); // '' = same as chat
  const [backOn, setBackOn] = useState<Provider | ''>('');
  const [radio, setRadio] = useState('');
  const [background, setBackground] = useState('');
  const [voice, setVoice] = useState(VOICE_MODELS[0].id);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [chatModel, setChatModel] = useState(''); // what "Chat model" means right now
  const radioP = radioOn || provider;
  const backP = backOn || provider;

  useFocusEffect(
    useCallback(() => {
      getJobProvider(db, 'radio').then(setRadioOn);
      getJobProvider(db, 'background').then(setBackOn);
      getSetting(db, 'voiceModel', VOICE_MODELS[0].id).then(setVoice);
      Promise.all((Object.keys(PROVIDERS) as Provider[]).map(async (p) => [p, !!(await getKey(p))] as const)).then((all) =>
        setKeys(Object.fromEntries(all)),
      );
    }, [db]),
  );
  useEffect(() => {
    getRadioModel(db, radioP).then(setRadio);
    getChatModel(db, radioP).then(setChatModel);
  }, [db, radioP]);
  const modelName = (id: string) => MODEL_CHOICES[radioP]?.find((m) => m.id === id)?.label ?? id;
  useEffect(() => {
    getBackgroundModel(db, backP).then(setBackground);
  }, [db, backP]);

  const save = (key: string, value: string, set: (v: string) => void) => {
    set(value);
    setSetting(db, key, value);
  };
  /** "Same as chat", then every provider: a job can run on another AI than the chat. */
  const ProviderChips = ({ job, value, set }: { job: Job; value: Provider | ''; set: (p: Provider | '') => void }) => (
    <View style={styles.chips}>
      {(['', ...Object.keys(PROVIDERS)] as (Provider | '')[]).map((p) => (
        <Chip
          key={p || 'same'}
          label={p ? `${PROVIDERS[p].label}${keys[p] ? '' : ' (no key)'}` : 'Same as chat'}
          active={value === p}
          onPress={() => {
            set(p);
            setJobProvider(db, job, p);
          }}
        />
      ))}
    </View>
  );
  const noKey = (p: Provider | '') => (p && !keys[p] ? ` No ${PROVIDERS[p].label} key yet, so it uses ${PROVIDERS[provider].label} until you add one.` : '');

  return (
    <>
      <Label icon="radio-outline">Radio writer</Label>
      <Text style={styles.subLabel}>AI</Text>
      <ProviderChips job="radio" value={radioOn} set={setRadioOn} />
      <Text style={styles.subLabel}>Model</Text>
      <ModelChips
        provider={radioP}
        value={radio}
        extra={{ id: '', label: `${radioOn && radioOn !== provider ? 'Default' : 'Chat model'}${chatModel ? ` (${modelName(chatModel)})` : ''}` }}
        onPick={(m) => save(`radioModel.${radioP}`, m, setRadio)}
      />
      <Text style={styles.hint}>
        {radio ? priceHint(radio) : 'Writes the shows with the chat model.'} The cheaper one is a bit less funny.{noKey(radioOn)}
      </Text>

      <Label icon="cog-outline">Background jobs</Label>
      <Text style={styles.subLabel}>AI</Text>
      <ProviderChips job="background" value={backOn} set={setBackOn} />
      <Text style={styles.subLabel}>Model</Text>
      <ModelChips provider={backP} value={background} onPick={(m) => save(`backgroundModel.${backP}`, m, setBackground)} />
      <Text style={styles.hint}>
        Facts, photo captions, check-ins, milestones. {priceHint(background)}. Claude Haiku is the cheapest of all.{noKey(backOn)}
      </Text>

      <Label icon="mic-outline">Radio voice (Gemini)</Label>
      <View style={styles.chips}>
        {VOICE_MODELS.map((v) => (
          <Chip key={v.id} label={v.label} active={v.id === voice} onPress={() => save('voiceModel', v.id, setVoice)} />
        ))}
      </View>
      <Text style={styles.hint}>{priceHint(voice)}. The other one is the backup when a daily limit runs out.</Text>
    </>
  );
}

/** The look of every icon in the app, with a live preview. */
function IconsSection() {
  const db = useSQLiteContext();
  const style = useIconStyle();
  const PREVIEW: ComponentProps<typeof Ionicons>['name'][] = ['book-outline', 'leaf-outline', 'chatbubble-ellipses-outline', 'radio-outline', 'mic-outline', 'image-outline', 'notifications-outline'];
  return (
    <Section title="Icons" hint="The style of every icon in the app.">
      <Segment options={ICON_STYLES} value={style} onChange={(s) => setIconStyle(db, s)} />
      <View style={styles.iconPreview}>
        {PREVIEW.map((n) => (
          <Ionicons key={n} name={n} size={24} color={colors.text} />
        ))}
      </View>
    </Section>
  );
}

/** A folding list of songs, each with one action (un-heart, un-ban). */
function SongList(props: {
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  empty: string;
  songs: SongRef[];
  action: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
  onAction: (s: SongRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.songList}>
      <Pressable style={styles.songListHead} onPress={() => setOpen((o) => !o)} accessibilityLabel={`${props.title}, ${props.songs.length} songs`}>
        <View style={[styles.labelRow, { marginTop: 12, marginBottom: 12 }]}>
          <Ionicons name={props.icon} size={15} color={colors.muted} />
          <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>
            {props.title} · {props.songs.length}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open &&
        (props.songs.length ? (
          props.songs.map((s) => (
            <View key={s.id} style={styles.songRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.songName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {s.artist}
                </Text>
              </View>
              <Pressable onPress={() => props.onAction(s)} hitSlop={10} accessibilityLabel={`${props.actionLabel}: ${s.name}`}>
                <Ionicons name={props.action} size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.hint}>{props.empty}</Text>
        ))}
    </View>
  );
}

/** Silent proofreading of entries, no lessons. */
function WritingSection() {
  const db = useSQLiteContext();
  const [auto, setAuto] = useState(false);
  const [buzz, setBuzz] = useState(true);
  useFocusEffect(
    useCallback(() => {
      getSetting(db, 'autoGrammar').then((v) => setAuto(v === '1'));
      getSetting(db, 'haptics', '1').then((v) => setBuzz(v === '1'));
    }, [db]),
  );
  const toggle = async (on: boolean) => {
    setAuto(on);
    await setSetting(db, 'autoGrammar', on ? '1' : '0');
  };
  const toggleBuzz = async (on: boolean) => {
    setBuzz(on);
    haptic.setEnabled(on);
    await setSetting(db, 'haptics', on ? '1' : '0');
  };
  return (
    <Section title="Writing" hint="The sparkles button in an entry fixes grammar any time, with Undo.">
      <Toggle
        label="Fix grammar when I save"
        hint="Spelling, grammar and punctuation only. Your words, tone and Turkish stay as they are."
        value={auto}
        onChange={toggle}
      />
      <View style={{ marginTop: 16 }}>
        <Toggle label="Buzz when I save" hint="One short vibration when an entry is saved." value={buzz} onChange={toggleBuzz} />
      </View>
    </Section>
  );
}


/** Home screen widget and the JSON export (Privacy & Data). */
function WidgetAndExport() {
  const db = useSQLiteContext();
  const pinWidget = async () => {
    try {
      const ok = await requestPinWidget({ widgetName: 'Lifelog' });
      if (!ok) throw new Error('not supported');
    } catch {
      Alert.alert(
        "Your launcher didn't allow it",
        'On Xiaomi: Settings → Apps → Manage apps → Lifelog → Other permissions → turn on "Home screen shortcuts", then try again. ' +
          'Or long-press the home screen → Widgets → Lifelog.',
      );
    }
  };
  const exportAll = async () => {
    try {
      await exportJson(db);
    } catch (e) {
      Alert.alert("Couldn't export", e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <Section title="Home Screen" hint="A widget with Talk, Write and the radio, so a break is enough for an entry.">
        <PillButton label="Add widget to home screen" onPress={pinWidget} full />
        <Text style={[styles.hint, { marginTop: 10 }]}>
          Nothing happens on Xiaomi? Turn on "Home screen shortcuts" for Lifelog in its app permissions first.
        </Text>
      </Section>
      <Section
        title="Export"
        hint="Your whole journal as one JSON file, ready to move to your own server one day. Not encrypted, so keep it private."
      >
        <PillButton label="Export everything" onPress={exportAll} ghost full />
      </Section>
    </>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { section } = useLocalSearchParams<{ section: string }>();
  const page: SettingsPage = section in SETTINGS_PAGES ? (section as SettingsPage) : 'me';
  const { y, onScroll } = useCollapsingHeader();
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

  // the switch IS the choice: it takes effect at once (it used to wait for Save and looked like tabs)
  const pickProvider = async (p: Provider) => {
    const m = await getChatModel(db, p);
    setProvider(p);
    setModel(m);
    await saveChatConfig(db, p, m);
    setChatStatus(
      (await getKey(p))
        ? { kind: 'ok', msg: `Now using ${PROVIDERS[p].label}.` }
        : { kind: 'err', msg: `No ${PROVIDERS[p].label} key yet: add it under API Keys below.` },
    );
  };
  const pickChatModel = async (m: string) => {
    setModel(m);
    await saveChatConfig(db, provider, m);
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
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 60 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageTop}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        </View>
        <View style={styles.pageTitle}>
          <IconTile icon={SETTINGS_PAGES[page].icon} tint={SETTINGS_PAGES[page].tint} size={40} />
          <Animated.Text style={[styles.title, bigTitleMotion(y), { flexShrink: 1 }]}>{SETTINGS_PAGES[page].title}</Animated.Text>
        </View>

        {page === 'me' && (
        <>
        <Section title="About You" hint="Your friend reads this before every reply.">
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Arda"
            placeholderTextColor={colors.muted}
            {...inputColors}
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
            {...inputColors}
          />
          <View style={styles.row}>
            <PillButton label="Save" onPress={saveProfile} />
          </View>
          <StatusLine status={profileStatus} />
        </Section>

        <WritingSection />

        <LearnedSection />
        <IconsSection />
        </>
        )}

        {page === 'ai' && (
        <>

        <Section title="AI Models" hint="Which AI does each job. Prices are per 1M tokens; AI Usage below shows what it adds up to.">
          <Segment
            options={(Object.keys(PROVIDERS) as Provider[]).map((p) => ({ key: p, label: `${PROVIDERS[p].label}${p === provider ? ' ✓' : ''}` }))}
            value={provider}
            onChange={pickProvider}
          />
          <Text style={styles.hint}>
            Chat, radio scripts and background jobs run on {PROVIDERS[provider].label}. The radio voices, web search and
            voice notes always use Gemini.
          </Text>
          <Label icon="chatbubble-ellipses-outline">Chat friend</Label>
          <ModelChips provider={provider} value={model} onPick={pickChatModel} />
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            autoCorrect={false}
            {...inputColors}
          />
          <Text style={styles.hint}>{priceHint(model)}. Tap a model, or type any model name and Save.</Text>
          <View style={styles.row}>
            <PillButton label="Save" onPress={saveChat} />
            <PillButton label="Test" onPress={testChat} ghost />
          </View>
          <StatusLine status={chatStatus} />
          <JobModels provider={provider} />
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
          <View style={styles.divider} />
          <KeyBlock
            provider="xai"
            title="Grok"
            hint="Optional. From console.x.ai (prepaid credits), starts with xai-."
            test={async (key) => PROVIDERS.xai.test(key, await getChatModel(db, 'xai'))}
          />
        </Section>

        <UsageSection />
        </>
        )}

        {page === 'friend' && (
          <>
            <CheckinSection />
            <DaysOffSection />
            <AutonomySection />
          </>
        )}

        {page === 'music' && (
          <>
            <SpotifySection />
            <RadioSection />
          </>
        )}

        {page === 'privacy' && (
        <>
        <PrivacySection />
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
        <WidgetAndExport />
        </>
        )}
      </Animated.ScrollView>
      <CollapsingHeader title={SETTINGS_PAGES[page].title} y={y} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 24, marginBottom: 10 },
  iconPreview: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, paddingHorizontal: 6 },
  pageTop: { flexDirection: 'row', marginBottom: -10 },
  songList: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 6 },
  songListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  songName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 30 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 34, color: colors.text },

  section: { gap: 6 },
  sectionHint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 8 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 20 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 20 },

  keyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  keyTitle: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.text },
  keyState: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  keyStateText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },

  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 8 },
  // a field's name: room above (a new field starts) and a little below (it belongs to what follows)
  label: { fontFamily: fonts.sans, fontSize: 13, letterSpacing: 0.2, color: colors.muted, marginTop: 24, marginBottom: 10 },
  subLabel: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, opacity: 0.7, marginTop: 4, marginBottom: 8 },
  labelInRow: { marginTop: 0, marginBottom: 0 },
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

  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22 },
  bgBox: { marginTop: 18, padding: 14, borderRadius: radius.sm, backgroundColor: colors.raised },
  bgBoxWarn: { borderWidth: 1, borderColor: colors.text },
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
