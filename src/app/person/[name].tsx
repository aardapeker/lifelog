import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DetailScreen, detailStyles } from '../../components/DetailScreen';
import { personPage } from '../../lib/insights';
import type { Note } from '../../lib/notes';

/** Everything the journal knows about one person or pet. */
export default function PersonScreen() {
  const db = useSQLiteContext();
  const { name } = useLocalSearchParams<{ name: string }>();
  const who = decodeURIComponent(name ?? '');
  const [facts, setFacts] = useState<{ id: number; text: string }[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    personPage(db, who).then((p) => {
      setFacts(p.facts);
      setNotes(p.notes);
    });
  }, [db, who]);

  return (
    <DetailScreen barTitle="People & Pets" title={who} notes={notes} emptyText="No entries mention them yet.">
      <Text style={[detailStyles.meta, { marginBottom: 12 }]}>
        Mentioned in {notes.length === 1 ? '1 entry' : `${notes.length} entries`}.
      </Text>
      {facts.map((f) => (
        <Text key={f.id} style={detailStyles.fact}>
          {f.text}
        </Text>
      ))}
    </DetailScreen>
  );
}
