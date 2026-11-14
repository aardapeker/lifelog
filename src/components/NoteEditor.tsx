import Ionicons from './Icon';
import { useAudioRecorder } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic, Pulse } from './motion';
import { PhotoViewer } from './PhotoViewer';
import { IconButton, InfoTile, PillButton } from './ui';
import { runBackgroundJobs } from '../lib/background';
import { getSetting, setSetting } from '../lib/db';
import { fixGrammar } from '../lib/grammar';
import { deleteNote, entryTitle, formatTime, getNote, saveNote } from '../lib/notes';
import { deleteNotePhotos, deletePhotoFile, importPhoto, listPhotos, photoUri, pickPhoto, syncPhotos } from '../lib/photos';
import { takePendingShare } from '../lib/share';
import { colors, inputColors, fonts, radius, TAB_BAR_SPACE } from '../lib/theme';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { prepareMicrophone, transcribe, VOICE_RECORDING } from '../lib/voice';
import { showAlert } from '../lib/dialog';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Mic = 'idle' | 'recording' | 'transcribing';
type Fixing = 'idle' | 'fixing' | 'saving';

/** How the editor was left: saved (which entry, new or not), thrown away, or the entry deleted. */
export type EditorResult = { kind: 'saved'; id: number; isNew: boolean } | { kind: 'discarded' } | { kind: 'deleted' };

/**
 * The editor for one entry (noteId null = a new one). It lives in the Write tab; whoever shows it
 * gives it a fresh `key` per entry, so nothing from one entry can leak into the next.
 * voice: start recording right away (the widget's Talk). shared: an Android share is waiting.
 */
export function NoteEditor({
  noteId,
  voice,
  shared,
  onDone,
}: {
  noteId: number | null;
  voice?: boolean;
  shared?: boolean;
  onDone: (r: EditorResult) => void;
}) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null); // a photo open full screen
  const [captions, setCaptions] = useState<Record<string, string | null>>({});
  const [createdAt, setCreatedAt] = useState<number>(Date.now());
  const [mic, setMic] = useState<Mic>('idle');
  const [seconds, setSeconds] = useState(0);
  const [fixing, setFixing] = useState<Fixing>('idle');
  const [beforeFix, setBeforeFix] = useState<string | null>(null); // for Undo
  const savedPhotos = useRef<string[]>([]); // what the database had when we opened
  const savedBody = useRef(''); // the text the database had when we opened
  const [restored, setRestored] = useState(false);
  const draftKey = `draft.${noteId ?? 'new'}`;
  const recorder = useAudioRecorder(VOICE_RECORDING);

  useEffect(() => {
    (async () => {
      if (noteId !== null) {
        const n = await getNote(db, noteId);
        if (n) {
          savedBody.current = n.body;
          setBody(n.body);
          setCreatedAt(n.created_at);
        }
        const ps = await listPhotos(db, noteId);
        savedPhotos.current = ps.map((p) => p.file);
        setPhotos(ps.map((p) => p.file));
        setCaptions(Object.fromEntries(ps.map((p) => [p.file, p.caption])));
      }
      // writing that never got saved (app closed, phone died, another entry opened): bring it back
      const draft = await loadDraft();
      let text = savedBody.current;
      if (draft && (draft.body !== savedBody.current || draft.photos.join() !== savedPhotos.current.join())) {
        text = draft.body;
        setBody(draft.body);
        setPhotos(draft.photos);
        setRestored(true);
      }
      // opened from Android's share menu: the shared text / image joins the entry (after any draft, never over it)
      if (noteId === null && shared) {
        const share = takePendingShare();
        if (share?.text) setBody(text.trim() ? `${text.trimEnd()}\n\n${share.text}` : share.text);
        if (share?.imageUri) {
          importPhoto(share.imageUri)
            .then((file) => setPhotos((p) => [...p, file]))
            .catch(() => showAlert("Couldn't add the shared image"));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, noteId]);

  // every change is kept as a draft right away, so nothing typed is ever lost
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const t = setTimeout(() => {
      setSetting(db, draftKey, JSON.stringify({ body, photos })).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [db, draftKey, body, photos]);

  // leaving this entry (another one opened in the tab): keep what's typed, even the last half second
  const latest = useRef({ body, photos });
  latest.current = { body, photos };
  const done = useRef(false); // saved / discarded / deleted: nothing to keep
  useEffect(
    () => () => {
      if (done.current || !loaded.current) return;
      const { body: b, photos: p } = latest.current;
      if (b !== savedBody.current || p.join() !== savedPhotos.current.join()) {
        setSetting(db, draftKey, JSON.stringify({ body: b, photos: p })).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadDraft = async (): Promise<{ body: string; photos: string[] } | null> => {
    try {
      const d = JSON.parse(await getSetting(db, draftKey, 'null'));
      return d && (d.body?.trim() || d.photos?.length) ? { body: d.body ?? '', photos: d.photos ?? [] } : null;
    } catch {
      return null;
    }
  };
  const clearDraft = () => db.runAsync('DELETE FROM kv WHERE key = ?', draftKey).catch(() => {});

  // a blank new entry: the keyboard comes up when you arrive on the tab (not when the tab resets in the background)
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useFocusEffect(
    useCallback(() => {
      if (noteId !== null || voice) return;
      const t = setTimeout(() => {
        if (!latest.current.body.trim()) input.current?.focus();
      }, 350);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Android's back button / gesture saves, like Save (only while the Write tab is on screen)
  const saveRef = useRef<() => void>(() => {});
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!changedRef.current()) return false; // nothing written: back works as usual
        saveRef.current();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // opened from the widget's Talk button: start listening right away
  useEffect(() => {
    if (noteId === null && voice) {
      const t = setTimeout(() => startRecording(), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mic !== 'recording') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [mic]);

  /** Throwing away this visit's changes: forget photos taken in it. */
  const discard = async () => {
    photos.filter((f) => !savedPhotos.current.includes(f)).forEach(deletePhotoFile);
    await clearDraft();
    done.current = true;
    onDone({ kind: 'discarded' });
  };

  /** Asks first if there's something to lose. */
  const confirmDiscard = () => {
    if (!changed()) return discard();
    showAlert(noteId === null ? 'Throw this away?' : 'Undo your changes?', 'What you wrote this time will be gone.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: noteId === null ? 'Discard' : 'Undo changes', style: 'destructive', onPress: discard },
    ]);
  };

  const changed = () =>
    body !== savedBody.current ||
    photos.join() !== savedPhotos.current.join();
  const changedRef = useRef(changed); // for the back button, which is registered once
  changedRef.current = changed;

  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      await saveNow();
    } finally {
      saving.current = false;
    }
  };
  saveRef.current = save;
  const saveNow = async () => {
    if (mic === 'recording') await stopRecording();
    if (!changed()) {
      await clearDraft();
      done.current = true;
      onDone(noteId === null ? { kind: 'discarded' } : { kind: 'saved', id: noteId, isNew: false });
      return;
    }
    if (!body.trim() && !photos.length) {
      if (noteId === null) return discard();
      return remove(); // emptied an existing entry: ask before deleting it
    }
    let text = body.trim();
    // optional: fix grammar automatically on save (if it fails, save as written)
    if (text && (await getSetting(db, 'autoGrammar')) === '1') {
      setFixing('saving');
      text = (await fixGrammar(db, text).catch(() => text)).trim();
      setFixing('idle');
    }
    const savedId = await saveNote(db, noteId, text);
    await syncPhotos(db, savedId, photos);
    await clearDraft();
    haptic.success();
    runBackgroundJobs(db).catch(() => {}); // captions, search index, facts: never block saving
    done.current = true;
    onDone({ kind: 'saved', id: savedId, isNew: noteId === null });
  };

  const remove = () => {
    if (noteId === null) return confirmDiscard();
    showAlert('Delete this entry?', 'It will be gone for good, and your friend will forget it too.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNotePhotos(db, noteId);
          photos.forEach(deletePhotoFile);
          await deleteNote(db, noteId);
          await clearDraft();
          done.current = true;
          onDone({ kind: 'deleted' });
        },
      },
    ]);
  };

  const startRecording = async () => {
    try {
      await prepareMicrophone();
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMic('recording');
    } catch (e) {
      showAlert("Couldn't start recording", e instanceof Error ? e.message : String(e));
    }
  };

  const stopRecording = async () => {
    setMic('transcribing');
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('The recording was empty.');
      const text = await transcribe(recorder.uri);
      setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${text}` : text));
    } catch (e) {
      showAlert("Couldn't turn that into text", e instanceof Error ? e.message : String(e));
    } finally {
      setMic('idle');
    }
  };

  const fix = async () => {
    if (!body.trim()) return;
    setFixing('fixing');
    try {
      const fixed = await fixGrammar(db, body);
      if (fixed !== body) {
        setBeforeFix(body);
        setBody(fixed);
      }
    } catch (e) {
      showAlert("Couldn't fix it", e instanceof Error ? e.message : String(e));
    } finally {
      setFixing('idle');
    }
  };

  const undoFix = () => {
    if (beforeFix !== null) setBody(beforeFix);
    setBeforeFix(null);
  };

  const addPhoto = () => {
    const pick = async (source: 'camera' | 'library') => {
      try {
        const file = await pickPhoto(source);
        if (file) setPhotos((p) => [...p, file]);
      } catch (e) {
        showAlert("Couldn't add the photo", e instanceof Error ? e.message : String(e));
      }
    };
    showAlert('Add a photo', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Gallery', onPress: () => pick('library') },
      { text: 'Camera', onPress: () => pick('camera') },
    ]);
  };

  const removePhoto = (file: string) => {
    setPhotos((p) => p.filter((f) => f !== file));
    // files that were never saved can go right away; saved ones are removed on Save
    if (!savedPhotos.current.includes(file)) deletePhotoFile(file);
  };

  const d = new Date(createdAt);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 8 }]} behavior="padding">
      <View style={styles.bar}>
        {/* new: throw it away · editing: stop without saving the changes */}
        <IconButton icon="close" label={noteId === null ? 'Discard' : 'Stop editing'} onPress={confirmDiscard} />
        <View style={{ alignItems: 'center' }}>
          {noteId !== null && <Text style={styles.editing}>Editing</Text>}
          <Text style={styles.barTitle}>
            {d.getDate()} {MONTHS[d.getMonth()]}
          </Text>
        </View>
        {noteId !== null ? (
          <IconButton icon="trash-outline" label="Delete entry" onPress={remove} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{entryTitle(createdAt)}</Text>
        {restored && (
          <Pressable onPress={() => setRestored(false)}>
            <Text style={styles.restored}>Brought back what you didn't get to save. Tap to hide.</Text>
          </Pressable>
        )}
        <View style={styles.tiles}>
          <InfoTile label="Written" value={formatTime(createdAt)} />
          <InfoTile label="Length" value={words === 1 ? '1 word' : `${words} words`} />
          <InfoTile label="Photos" value={String(photos.length)} />
        </View>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {photos.map((f) => (
              <View key={f}>
                <Pressable onPress={() => setViewing(photos.indexOf(f))} accessibilityLabel="Open photo">
                  <Image source={{ uri: photoUri(f) }} style={styles.photo} />
                </Pressable>
                <Pressable style={styles.photoRemove} onPress={() => removePhoto(f)} accessibilityLabel="Remove photo">
                  <Ionicons name="close" size={14} color={colors.accentText} />
                </Pressable>
                {!!captions[f] && (
                  <Text style={styles.caption} numberOfLines={2}>
                    {captions[f]}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        <TextInput
          style={styles.input}
          multiline
          scrollEnabled={false}
          ref={input}
          placeholder="What happened today? Or tap the mic and just talk."
          placeholderTextColor={colors.muted}
          value={body}
          onChangeText={(t) => {
            setBody(t);
            setBeforeFix(null); // typing after a fix makes Undo meaningless
          }}
          textAlignVertical="top"
          {...inputColors}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboard ? 14 : insets.bottom + TAB_BAR_SPACE - 10 }]}>
        {mic === 'recording' ? (
          <Pressable style={styles.recording} onPress={stopRecording} accessibilityLabel="Stop recording">
            <Pulse style={styles.recDot} />
            <Text style={styles.recText}>Listening {mm}</Text>
            <Text style={styles.recStop}>Tap to stop</Text>
          </Pressable>
        ) : mic === 'transcribing' ? (
          <View style={styles.recording}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.recText}>Turning it into text…</Text>
          </View>
        ) : fixing !== 'idle' ? (
          <View style={styles.recording}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.recText}>{fixing === 'saving' ? 'Fixing and saving…' : 'Fixing grammar…'}</Text>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <IconButton icon="mic-outline" label="Record a voice note" onPress={startRecording} size={54} />
            <IconButton icon="image-outline" label="Add a photo" onPress={addPhoto} size={54} />
            {beforeFix !== null ? (
              <IconButton icon="arrow-undo-outline" label="Undo grammar fix" onPress={undoFix} size={54} />
            ) : (
              <IconButton icon="sparkles-outline" label="Fix grammar" onPress={fix} size={54} />
            )}
            <PillButton label="Save entry" onPress={save} style={{ flex: 1, paddingVertical: 17 }} />
          </View>
        )}
      </View>
      <PhotoViewer uris={photos.map(photoUri)} captions={photos.map((f) => captions[f] ?? null)} start={viewing} onClose={() => setViewing(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  restored: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: -8, marginBottom: 14 },
  screen: { flex: 1 }, // see-through: the tabs' background (plain, or the song's colour) shows
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  barTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 20, color: colors.text },
  editing: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetContent: { padding: 22, paddingBottom: 40 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 32, lineHeight: 38, color: colors.text },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 22 },
  photos: { gap: 10, paddingBottom: 20 },
  photo: { width: 132, height: 132, borderRadius: radius.sm, backgroundColor: colors.raised },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { width: 132, marginTop: 6, fontFamily: fonts.sansRegular, fontSize: 11, lineHeight: 15, color: colors.muted },
  input: {
    minHeight: 240,
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 26,
    color: colors.text,
    padding: 0,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surface },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recording: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },
  recText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  recStop: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
});
