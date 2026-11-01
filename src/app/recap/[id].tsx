import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, PillButton, StatusLine, type Status } from '../../components/ui';
import { getRecap, weekLabel, writeRecap, type Recap } from '../../lib/recap';
import { colors, fonts, radius } from '../../lib/theme';

/** The friend's Sunday letter about your week. */
export default function RecapScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    getRecap(db, Number(id)).then(setRecap);
  }, [db, id]);

  const rewrite = async () => {
    if (!recap) return;
    setStatus({ kind: 'busy' });
    try {
      const fresh = await writeRecap(db, recap.week_start);
      if (fresh) setRecap(fresh);
      setStatus({ kind: 'idle' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>{recap ? weekLabel(recap.week_start) : ''}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
        <Text style={styles.title}>{'Your Week,\nin a Letter'}</Text>
        <Text style={styles.body} selectable>
          {recap?.body ?? ''}
        </Text>
        <PillButton label="Write it again" onPress={rewrite} ghost style={{ alignSelf: 'flex-start', marginTop: 28 }} />
        <StatusLine status={status} />
      </ScrollView>
    </View>
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
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 24 },
  title: { fontFamily: fonts.serif, fontSize: 38, lineHeight: 44, color: colors.text, marginBottom: 22 },
  body: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 30, color: colors.text },
});
