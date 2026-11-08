import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, PillButton } from '../../components/ui';
import {
  deleteMilestone,
  getMilestone,
  milestoneDate,
  milestoneDateInput,
  parseMilestoneDate,
  saveMilestone,
} from '../../lib/milestones';
import { colors, fonts, inputColors, radius } from '../../lib/theme';

const EMOJIS = ['💼', '🏠', '🎓', '❤️', '🛵', '✈️', '🏆', '🐈', '👶', '🕊️', '🏥', '🎬'];

/** Add or edit one milestone: emoji, title, date (day, month or just year), a line of story, chapter or moment. */
export default function MilestoneScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [story, setStory] = useState('');
  const [emoji, setEmoji] = useState('');
  const [big, setBig] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    getMilestone(db, Number(id)).then((m) => {
      if (!m) return router.back();
      setTitle(m.title);
      setDate(milestoneDateInput(m));
      setStory(m.story ?? '');
      setEmoji(m.emoji ?? '');
      setBig(!!m.big);
    });
  }, [db, id, isNew]);

  const parsed = parseMilestoneDate(date);

  const save = async () => {
    if (!title.trim()) return setError('Give it a title.');
    if (!parsed) return setError('Date: like 1.10.2026, or 10.2026, or just 2026.');
    await saveMilestone(db, { id: isNew ? undefined : Number(id), ...parsed, title, story, emoji, big: big ? 1 : 0 });
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this milestone?', title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMilestone(db, Number(id));
          router.back();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <Text style={styles.barTitle}>{isNew ? 'New milestone' : 'Milestone'}</Text>
        {isNew ? <View style={{ width: 44 }} /> : <IconButton icon="trash-outline" label="Delete" onPress={remove} />}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.emojis}>
          {EMOJIS.map((e) => (
            <Text key={e} onPress={() => setEmoji(emoji === e ? '' : e)} style={[styles.emoji, emoji === e && styles.emojiOn]}>
              {e}
            </Text>
          ))}
        </View>

        <Text style={styles.label}>What happened</Text>
        <TextInput
          style={[styles.input, styles.titleInput]}
          value={title}
          onChangeText={setTitle}
          placeholder="First day at Arvato"
          placeholderTextColor={colors.muted}
          {...inputColors}
        />

        <Text style={styles.label}>When</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="1.10.2026 (or 10.2026, or 2026)"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          {...inputColors}
        />
        {!!date && <Text style={styles.hint}>{parsed ? milestoneDate(parsed) : 'Like 1.10.2026, 10.2026 or 2026'}</Text>}

        <Text style={styles.label}>The story (optional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          value={story}
          onChangeText={setStory}
          placeholder="One line about it"
          placeholderTextColor={colors.muted}
          multiline
          {...inputColors}
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>A life chapter</Text>
            <Text style={styles.hint}>A new job, a new home, school, a relationship. Shown bigger on the timeline.</Text>
          </View>
          <Switch value={big} onValueChange={setBig} />
        </View>

        {!!error && <Text style={[styles.hint, { color: '#FF8A8A' }]}>{error}</Text>}
        <PillButton label="Save" onPress={save} full style={{ marginTop: 18 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  content: { paddingHorizontal: 22, paddingTop: 12 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  emoji: { fontSize: 24, width: 46, height: 46, lineHeight: 46, textAlign: 'center', borderRadius: 23, backgroundColor: colors.surface, overflow: 'hidden' },
  emojiOn: { backgroundColor: colors.raised, borderWidth: 2, borderColor: colors.text },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.text,
  },
  titleInput: { fontFamily: fonts.serif, fontSize: 19 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22 },
  switchLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
});
