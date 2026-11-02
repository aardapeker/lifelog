import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioRecorder } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, InfoTile, PillButton } from '../../components/ui';
import { runBackgroundJobs } from '../../lib/background';
import { getSetting } from '../../lib/db';
import { fixGrammar } from '../../lib/grammar';
import { deleteNote, entryTitle, formatTime, getNote, saveNote } from '../../lib/notes';
import { deleteNotePhotos, deletePhotoFile, importPhoto, listPhotos, photoUri, pickPhoto, syncPhotos } from '../../lib/photos';
import { takePendingShare } from '../../lib/share';
import { colors, inputColors, fonts, radius } from '../../lib/theme';
import { prepareMicrophone, transcribe, VOICE_RECORDING } from '../../lib/voice';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Mic = 'idle' | 'recording' | 'transcribing';
type Fixing = 'idle' | 'fixing' | 'saving';

export default function NoteScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id, voice, shared } = useLocalSearchParams<{ id: string; voice?: string; shared?: string }>();
  const noteId = id === 'new' ? null : Number(id);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [captions, setCaptions] = useState<Record<string, string | null>>({});
  const [createdAt, setCreatedAt] = useState<number>(Date.now());
  const [mic, setMic] = useState<Mic>('idle');
  const [seconds, setSeconds] = useState(0);
  const [fixing, setFixing] = useState<Fixing>('idle');
  const [beforeFix, setBeforeFix] = useState<string | null>(null); // for Undo
  const savedPhotos = useRef<string[]>([]); // what the database had when we opened
  const recorder = useAudioRecorder(VOICE_RECORDING);

  useEffect(() => {
    if (noteId === null) return;
    getNote(db, noteId).then((n) => {
      if (n) {
        setBody(n.body);
        setCreatedAt(n.created_at);
      }
    });
    listPhotos(db, noteId).then((ps) => {
      savedPhotos.current = ps.map((p) => p.file);
      setPhotos(ps.map((p) => p.file));
      setCaptions(Object.fromEntries(ps.map((p) => [p.file, p.caption])));
    });
  }, [db, noteId]);

  // opened from the widget's Talk button: start listening right away
  useEffect(() => {
    if (noteId === null && voice === '1') {
      const t = setTimeout(() => startRecording(), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // opened from Android's share menu: drop the shared text / image into the new entry
  useEffect(() => {
    if (noteId !== null || shared !== '1') return;
    const share = takePendingShare();
    if (!share) return;
    if (share.text) setBody(share.text);
    if (share.imageUri) {
      importPhoto(share.imageUri)
        .then((file) => setPhotos((p) => [...p, file]))
        .catch(() => Alert.alert("Couldn't add the shared image"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mic !== 'recording') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [mic]);

  /** Leaving without saving: forget photos taken in this visit. */
  const discard = () => {
    photos.filter((f) => !savedPhotos.current.includes(f)).forEach(deletePhotoFile);
    router.back();
  };

  const save = async () => {
    if (mic === 'recording') await stopRecording();
    if (!body.trim() && !photos.length) {
      discard();
      return;
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
    runBackgroundJobs(db).catch(() => {}); // captions, search index, facts: never block saving
    router.back();
  };

  const remove = () => {
    if (noteId === null) return discard();
    Alert.alert('Delete this entry?', 'It will be gone for good, and your friend will forget it too.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNotePhotos(db, noteId);
          photos.forEach(deletePhotoFile);
          await deleteNote(db, noteId);
          router.back();
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
      Alert.alert("Couldn't start recording", e instanceof Error ? e.message : String(e));
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
      Alert.alert("Couldn't turn that into text", e instanceof Error ? e.message : String(e));
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
      Alert.alert("Couldn't fix it", e instanceof Error ? e.message : String(e));
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
        Alert.alert("Couldn't add the photo", e instanceof Error ? e.message : String(e));
      }
    };
    Alert.alert('Add a photo', undefined, [
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
        <IconButton icon="arrow-back" label="Back without saving" onPress={discard} />
        <Text style={styles.barTitle}>
          {d.getDate()} {MONTHS[d.getMonth()]}
        </Text>
        {noteId !== null ? (
          <IconButton icon="trash-outline" label="Delete entry" onPress={remove} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{entryTitle(createdAt)}</Text>
        <View style={styles.tiles}>
          <InfoTile label="Written" value={formatTime(createdAt)} />
          <InfoTile label="Length" value={words === 1 ? '1 word' : `${words} words`} />
          <InfoTile label="Photos" value={String(photos.length)} />
        </View>

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {photos.map((f) => (
              <View key={f}>
                <Image source={{ uri: photoUri(f) }} style={styles.photo} />
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
          autoFocus={noteId === null}
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {mic === 'recording' ? (
          <Pressable style={styles.recording} onPress={stopRecording} accessibilityLabel="Stop recording">
            <View style={styles.recDot} />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  barTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetContent: { padding: 22, paddingBottom: 40 },
  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 38, color: colors.text },
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
