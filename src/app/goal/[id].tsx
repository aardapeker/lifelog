import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { DetailScreen, detailStyles } from '../../components/DetailScreen';
import { IconButton, PillButton } from '../../components/ui';
import { deleteGoal, getGoal, goalNotes, setGoalDone, type Goal } from '../../lib/insights';
import type { Note } from '../../lib/notes';

/** A goal's timeline: every entry that's about it. */
export default function GoalScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  const load = () => {
    getGoal(db, Number(id)).then(setGoal);
    goalNotes(db, Number(id)).then(setNotes);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [db, id]);

  if (!goal) return null;
  const since = new Date(goal.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const remove = () =>
    Alert.alert('Delete this goal?', 'Your entries stay. Only the goal and its links go.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(db, goal.id);
          router.back();
        },
      },
    ]);

  return (
    <DetailScreen
      barTitle={goal.done ? 'Done' : 'Goal'}
      title={goal.title}
      right={<IconButton icon="trash-outline" label="Delete goal" onPress={remove} />}
      notes={notes}
      emptyText="No entries about this yet. Write about it and they'll show up here."
    >
      <Text style={detailStyles.meta}>
        Added {since}. {notes.length === 1 ? '1 entry' : `${notes.length} entries`} so far.
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <PillButton
          label={goal.done ? 'Not done yet' : 'Mark as done'}
          ghost={!!goal.done}
          onPress={async () => {
            await setGoalDone(db, goal.id, !goal.done);
            load();
          }}
        />
      </View>
    </DetailScreen>
  );
}
