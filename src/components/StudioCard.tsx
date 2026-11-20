import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listProjects, type Project } from '../lib/studio';
import { colors, fonts, frost, radius } from '../lib/theme';
import { PressScale } from './motion';
import { SectionTitle } from './ui';

/** Life tab: the way into Studio, with the documentaries in the works. */
export function StudioCard() {
  const db = useSQLiteContext();
  const [projects, setProjects] = useState<Project[]>([]);
  useFocusEffect(
    useCallback(() => {
      listProjects(db)
        .then((p) => setProjects(p.slice(0, 3)))
        .catch(() => {});
    }, [db]),
  );
  return (
    <View>
      <SectionTitle title="Studio" />
      <Text style={styles.hint}>Documentaries for your channel: the AI researches and writes, you polish on the weekend.</Text>
      <PressScale scaleTo={0.97} onPress={() => router.push('/studio')} style={styles.card} accessibilityLabel="Open Studio">
        <View style={styles.top}>
          <Text style={styles.title}>🎬 Studio</Text>
          <Text style={styles.go}>›</Text>
        </View>
        {projects.length ? (
          projects.map((p) => (
            <Text key={p.id} style={styles.row} numberOfLines={1}>
              {p.kit?.titles[0] ?? p.topic}
            </Text>
          ))
        ) : (
          <Text style={styles.sub}>Pick a topic and get a researched script.</Text>
        )}
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 10 },
  card: { borderRadius: radius.md, padding: 18, gap: 10, ...frost },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text },
  go: { fontFamily: fonts.sans, fontSize: 26, color: colors.muted },
  row: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
});
