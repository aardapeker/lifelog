import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { inline, SearchedFor, SourceList } from '../../components/Article';
import { Glass, GlassArea } from '../../components/Glass';
import Ionicons from '../../components/Icon';
import { MarkdownInput, MarkdownToolbar, useMarkdown } from '../../components/MarkdownInput';
import { ShowWash } from '../../components/radioParts';
import { Chip, IconButton, PillButton } from '../../components/ui';
import { showAlert } from '../../lib/dialog';
import { useFirstFrame } from '../../lib/perf';
import {
  deleteProject,
  factCheck,
  fixChecked,
  diffStats,
  diffWords,
  getProject,
  isRunning,
  listVersions,
  restoreVersion,
  research,
  reviseScript,
  saveScript,
  scenesOf,
  spokenMinutes,
  writeScript,
  type Check,
  type DiffPart,
  type Project,
  type Version,
} from '../../lib/studio';
import { colors, fonts, frost, inputColors, radius } from '../../lib/theme';
import { useKeyboardHeight } from '../../lib/useKeyboardVisible';

type Tab = 'script' | 'research' | 'kit' | 'changes';

/** One documentary: its research, the script (edit by hand or by asking the AI) and the publish kit. */
export default function StudioProjectScreen() {
  useFirstFrame('Studio project');
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = Number(id);
  const [p, setP] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('script');
  const [script, setScript] = useState('');
  const [note, setNote] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const next = await getProject(db, pid);
    setP(next);
    return next;
  }, [db, pid]);

  // the script shown in the editor follows the AI's rewrites, but not while you're typing
  const typing = useRef(false);
  useEffect(() => {
    load().then((next) => next?.script && setScript(next.script));
  }, [load]);

  // while the AI works (research, writing, rewriting), check on it every 1.5 s
  const busy = !!p && (isRunning(pid) || p.status === 'researching' || p.status === 'writing');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      const next = await load();
      if (next?.script && !typing.current) setScript(next.script);
    }, 1500);
    return () => clearInterval(t);
  }, [busy, load]);
  // when a job ends, show its result
  useEffect(() => {
    if (!busy && p?.script && !typing.current) setScript(p.script);
  }, [busy, p?.script]);

  const editor = useMarkdown(script, (t) => {
    typing.current = true;
    setScript(t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveScript(db, pid, t).catch(() => {});
      typing.current = false;
    }, 800);
  });

  const run = (work: Promise<void>) => {
    load();
    work.then(load);
    setTimeout(load, 300); // the status flips right away; show it
  };

  const remove = () =>
    showAlert('Delete this documentary?', 'The research and the script go with it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProject(db, pid);
          router.back();
        },
      },
    ]);

  const rewriteAll = () =>
    showAlert('Write a new script?', 'A fresh script from the research replaces this one, your edits too.', [
      { text: 'Keep mine', style: 'cancel' },
      { text: 'Write new', onPress: () => run(writeScript(db, pid)) },
    ]);

  if (!p)
    return (
      <View style={styles.screen}>
        <ShowWash />
      </View>
    );
  const stats = script ? spokenMinutes(script) : null;
  const scenes = script ? scenesOf(script).length : 0;

  return (
    <View style={styles.screen}>
      <ShowWash />
      <GlassArea>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          <Text style={styles.barTitle} numberOfLines={1}>
            Studio
          </Text>
          <IconButton icon="trash-outline" label="Delete documentary" onPress={remove} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 160 + keyboard }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{p.kit?.titles[0] ?? p.topic}</Text>
          <Text style={styles.sub}>
            {p.topic}
            {p.angle ? ` · ${p.angle}` : ''} · {p.minutes} min
          </Text>

          {/* what it's doing, or why it stopped */}
          {busy && (
            <Glass radius={radius.md} style={styles.working} fill={frost.backgroundColor}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.workingText}>{p.step ?? 'Working…'}</Text>
            </Glass>
          )}
          {p.status === 'error' && !busy && (
            <Glass radius={radius.md} style={styles.problem} fill={frost.backgroundColor}>
              <Text style={styles.err}>{p.error ?? 'Something went wrong.'}</Text>
              <PillButton label="Try again" onPress={() => run(p.research ? writeScript(db, pid) : research(db, pid))} />
            </Glass>
          )}

          {p.research && (
            <View style={styles.tabs}>
              <Chip label="Script" active={tab === 'script'} onPress={() => setTab('script')} />
              <Chip label={`Research · ${p.research.sources.length} sources`} active={tab === 'research'} onPress={() => setTab('research')} />
              {p.kit && <Chip label="Publish kit" active={tab === 'kit'} onPress={() => setTab('kit')} />}
              {!!p.script && <Chip label="Changes" active={tab === 'changes'} onPress={() => setTab('changes')} />}
            </View>
          )}

          {/* ── the script ── */}
          {tab === 'script' && p.research && (
            <View style={{ gap: 12 }}>
              {!script ? (
                !busy && (
                  <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
                    <Text style={styles.cardText}>
                      Research is done: {p.research.notes.length} angles, {p.research.sources.length} sources. Next, the script in scenes and the publish kit.
                    </Text>
                    <PillButton label={`Write the ${p.minutes}-minute script`} onPress={() => run(writeScript(db, pid))} full />
                  </Glass>
                )
              ) : (
                <>
                  {stats && (
                    <Text style={styles.stats}>
                      {scenes} scenes · {stats.words.toLocaleString('en')} words · about {stats.minutes} min of narration
                    </Text>
                  )}
                  {/* tell the AI what to change */}
                  <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder='Tell the AI: "make scene 3 funnier", "shorter intro"…'
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      multiline
                      editable={!busy}
                      {...inputColors}
                    />
                    <View style={styles.row}>
                      <PillButton
                        label="Change it"
                        disabled={!note.trim() || busy}
                        onPress={() => {
                          run(reviseScript(db, pid, note));
                          setNote('');
                        }}
                      />
                      <PillButton label="New script" ghost disabled={busy} onPress={rewriteAll} />
                    </View>
                  </Glass>
                  <FactCheck
                    check={p.research?.check}
                    busy={busy}
                    onCheck={() => run(factCheck(db, pid))}
                    onFix={(items) => run(fixChecked(db, pid, items))}
                  />
                  <Glass radius={radius.lg} style={styles.editorCard} fill={frost.backgroundColor}>
                    <MarkdownInput editor={editor} style={[styles.editor, busy && { opacity: 0.5 }]} placeholder="The script…" />
                  </Glass>
                  <Text style={styles.hint}>Each scene: "## N. Name", then "&gt; Visual: what to show", then the narration. Saved as you type.</Text>
                </>
              )}
            </View>
          )}

          {/* ── the research ── */}
          {tab === 'research' && p.research && (
            <View style={{ gap: 14 }}>
              {p.research.notes.map((n) => (
                <Glass key={n.heading} radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
                  <Text style={styles.noteHead}>{n.heading}</Text>
                  <Text style={styles.noteText} selectable>
                    {inline(n.text)}
                  </Text>
                </Glass>
              ))}
              <SourceList sources={p.research.sources} />
              <SearchedFor queries={p.research.queries} />
            </View>
          )}

          {/* ── the publish kit ── */}
          {/* ── every version of the script, what each step changed, and going back ── */}
          {tab === 'changes' && (
            <Changes
              pid={pid}
              script={script}
              busy={busy}
              stamp={p.updated_at}
              onRestore={(v) =>
                showAlert('Go back to this version?', `"${v.label}" becomes the script. The one you have now is kept in the list, so you can come back to it.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Go back',
                    onPress: async () => {
                      await restoreVersion(db, pid, v);
                      setScript(v.script);
                      await load();
                    },
                  },
                ])
              }
            />
          )}

          {tab === 'kit' && p.kit && (
            <View style={{ gap: 14 }}>
              <KitCard title="Titles" items={p.kit.titles} />
              <KitCard title="Thumbnail text" items={p.kit.thumbnail} />
              <KitCard title="Description" items={[p.kit.description]} />
              <KitCard title="Tags" items={[p.kit.tags.join(', ')]} />
              {p.kit.shorts.map((s, i) => (
                <KitCard key={i} title={`Short ${i + 1}: ${s.title}`} items={[s.script]} />
              ))}
            </View>
          )}
        </ScrollView>

        {/* the editor's turn-into buttons, above the keyboard */}
        {tab === 'script' && editor.focused && (
          <View style={[styles.toolbar, { bottom: keyboard ? keyboard + 6 : insets.bottom + 10 }]}>
            <MarkdownToolbar editor={editor} />
          </View>
        )}
      </GlassArea>
    </View>
  );
}

/** A block of the publish kit: each line copies with a tap. */
function KitCard({ title, items }: { title: string; items: string[] }) {
  const [copied, setCopied] = useState(-1);
  if (!items.filter(Boolean).length) return null;
  return (
    <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
      <Text style={styles.noteHead}>{title}</Text>
      {items.map((t, i) => (
        <Pressable
          key={i}
          style={styles.copyRow}
          onPress={() => {
            Clipboard.setStringAsync(t).catch(() => {});
            setCopied(i);
            setTimeout(() => setCopied(-1), 1500);
          }}
          accessibilityLabel={`Copy ${title}`}
        >
          <Text style={[styles.cardText, { flex: 1 }]} selectable>
            {t}
          </Text>
          <Ionicons name={copied === i ? 'checkmark' : 'copy-outline'} size={18} color={copied === i ? colors.ok : colors.muted} />
        </Pressable>
      ))}
    </Glass>
  );
}

/**
 * The script's history, like commits: every AI rewrite, and your own edits before it, newest first. Tap one
 * to see what that step changed (added words green, removed ones red and struck through); "Go back" makes an
 * old version the script again (the current one is kept first, so going back can be undone too).
 */
function Changes({ pid, script, busy, stamp, onRestore }: { pid: number; script: string; busy: boolean; stamp: number; onRestore: (v: Version) => void }) {
  const db = useSQLiteContext();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [open, setOpen] = useState<number | null>(null); // a version's id, or 0 for your current edits
  useEffect(() => {
    listVersions(db, pid).then(setVersions).catch(() => setVersions([]));
  }, [db, pid, stamp]);
  if (!versions) return null;
  const edited = !!versions.length && versions[0].script !== script; // typing since the last version
  const rows: { key: number; label: string; at: number | null; before: string; after: string; version: Version | null }[] = [
    ...(edited ? [{ key: 0, label: 'Your edits (now)', at: null, before: versions[0].script, after: script, version: null }] : []),
    ...versions.map((v, i) => ({ key: v.id, label: v.label, at: v.created_at, before: versions[i + 1]?.script ?? '', after: v.script, version: v })),
  ];
  if (!rows.length)
    return (
      <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
        <Text style={styles.cardText}>No versions yet. From now on, every AI rewrite is kept here (and your edits before it), so you can see what changed and go back.</Text>
      </Glass>
    );
  const current = edited ? null : versions[0]?.id; // the version that IS the script now
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => {
        const isOpen = open === r.key;
        const parts = isOpen ? diffWords(r.before, r.after) : null;
        const st = parts ? diffStats(parts) : null;
        return (
          <Glass key={r.key} radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
            <Pressable onPress={() => setOpen(isOpen ? null : r.key)} style={styles.versionHead} accessibilityLabel={`${r.label}: show what changed`}>
              <View style={[styles.checkDot, { backgroundColor: r.key === current || r.key === 0 ? '#5BE0A0' : colors.muted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardText} numberOfLines={isOpen ? undefined : 1}>
                  {r.label}
                </Text>
                <Text style={styles.hint}>
                  {r.at ? new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not kept as a version yet'}
                  {r.key === current ? ' · the script now' : ''}
                  {st ? ` · +${st.added} −${st.removed} words` : ''}
                </Text>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {parts && (r.before ? <Diff parts={parts} /> : <Text style={styles.hint}>The first version: nothing to compare it with.</Text>)}
            {isOpen && r.version && r.key !== current && <PillButton label="Go back to this version" ghost disabled={busy} onPress={() => onRestore(r.version!)} />}
          </Glass>
        );
      })}
    </View>
  );
}

/** A diff as text: long unchanged stretches are cut to their ends, so the changes stand out. */
function Diff({ parts }: { parts: DiffPart[] }) {
  if (!parts.some((p) => p.op !== 'same')) return <Text style={styles.hint}>No changes.</Text>;
  const KEEP = 12; // words of context on each side of a change
  return (
    <Text style={styles.diff} selectable>
      {parts.map((p, i) => {
        if (p.op === 'add') return <Text key={i} style={styles.added}>{p.text}</Text>;
        if (p.op === 'del') return <Text key={i} style={styles.removed}>{p.text}</Text>;
        const words = p.text.match(/\S+\s*/g) ?? [];
        if (words.length <= KEEP * 2 + 4) return <Text key={i}>{p.text}</Text>;
        const head = i === 0 ? '' : words.slice(0, KEEP).join('');
        const tail = i === parts.length - 1 ? '' : words.slice(-KEEP).join('');
        return (
          <Text key={i}>
            {head}
            <Text style={styles.hint}>{head ? ' … ' : '… '}</Text>
            {tail ? `\n${tail}` : ''}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * The fact check: what looked wrong (red) or couldn't be confirmed (amber), per scene, with the pages
 * Google found. "Fix these" asks the AI to correct or soften exactly those lines.
 */
function FactCheck({ check, busy, onCheck, onFix }: { check?: Check; busy: boolean; onCheck: () => void; onFix: (items: Check['items']) => void }) {
  const wrong = check?.items.filter((c) => c.verdict === 'wrong').length ?? 0;
  const unsure = (check?.items.length ?? 0) - wrong;
  const when = check ? new Date(check.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <Glass radius={radius.lg} style={styles.card} fill={frost.backgroundColor}>
      <Text style={styles.noteHead}>Fact check</Text>
      {!check ? (
        <Text style={styles.hint}>Every date, number, name and quote, in the narration and the visual notes, checked with Google Search.</Text>
      ) : (
        <Text style={styles.cardText}>
          {check.items.length
            ? `${wrong ? `${wrong} wrong` : ''}${wrong && unsure ? ', ' : ''}${unsure ? `${unsure} not confirmed` : ''}`
            : `All ${check.scenes - check.failed} scenes check out ✓`}
          <Text style={styles.hint}>
            {'  '}· {when}
            {check.failed ? ` · ${check.failed} scene${check.failed > 1 ? 's' : ''} couldn't be checked (offline?)` : ''}
          </Text>
        </Text>
      )}
      {check?.items.map((c, i) => (
        <View key={i} style={styles.checkRow}>
          <View style={[styles.checkDot, { backgroundColor: c.verdict === 'wrong' ? colors.danger : '#E3A43B' }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.hint}>
              Scene {c.scene} · {c.chapter} · {c.verdict === 'wrong' ? 'WRONG' : 'NOT CONFIRMED'}
            </Text>
            <Text style={styles.cardText}>{c.claim}</Text>
            <Text style={[styles.cardText, { color: colors.muted }]}>→ {c.note}</Text>
          </View>
        </View>
      ))}
      {!!check?.sources.length && <SourceList sources={check.sources.slice(0, 8)} />}
      <View style={styles.row}>
        {!!check?.items.length && <PillButton label="Fix these with AI" disabled={busy} onPress={() => onFix(check.items)} />}
        <PillButton label={check ? 'Check again' : 'Fact check'} ghost={!!check?.items.length} disabled={busy} onPress={onCheck} />
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  barTitle: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  content: { padding: 20, paddingTop: 8, gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted },
  working: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  workingText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text },
  problem: { padding: 14, gap: 10 },
  err: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.danger },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  card: { padding: 16, gap: 10 },
  cardText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.text },
  stats: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', textAlignVertical: 'top', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15, maxHeight: 120 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  editorCard: { padding: 16 },
  editor: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 27, color: colors.text, minHeight: 300 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  versionHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  diff: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: 'rgba(255,255,255,0.78)' },
  added: { color: '#B8F5CF', backgroundColor: 'rgba(91, 224, 160, 0.22)' },
  removed: { color: '#FFB4B4', backgroundColor: 'rgba(255, 90, 90, 0.18)', textDecorationLine: 'line-through' },
  checkDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  noteHead: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  noteText: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: colors.text },
  copyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  toolbar: { position: 'absolute', left: 12, right: 12, paddingTop: 8, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: 'rgba(20,19,19,0.92)' },
});
