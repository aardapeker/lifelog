import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../components/motion';
import { UNREAD } from '../components/TopBar';
import { IconButton } from '../components/ui';
import { IconTile } from '../components/IconTile';
import { clearInbox, inboxItems, KIND_LOOK, markAllRead, markRead, openNotification, type InboxItem } from '../lib/notify';
import { colors, fonts, radius } from '../lib/theme';

const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = new Date(at);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 🔔 Everything the app told you, newest first. New ones have a red dot; tap one to go where it points. */
export default function InboxScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const load = useCallback(() => {
    inboxItems(db).then(setItems).catch(() => setItems([]));
  }, [db]);
  useFocusEffect(load);

  const open = async (it: InboxItem) => {
    await markRead(db, it.id);
    setItems((all) => all?.map((x) => (x.id === it.id ? { ...x, read: 1 } : x)) ?? null);
    let data: Record<string, unknown> | null = null;
    try {
      data = it.data ? JSON.parse(it.data) : null;
    } catch {}
    openNotification(data);
  };

  const unread = items?.filter((i) => !i.read).length ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>Notifications</Text>
        <IconButton
          icon={unread ? 'checkmark-done' : 'trash-outline'}
          label={unread ? 'Mark all as read' : 'Clear all'}
          onPress={async () => {
            if (unread) await markAllRead(db);
            else await clearInbox(db);
            load();
          }}
        />
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 10 }}
        ListEmptyComponent={
          items ? (
            <Text style={styles.empty}>Nothing yet. Check-ins, Reads, day-off plans and radio news land here.</Text>
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const look = KIND_LOOK[item.kind] ?? { icon: 'sparkles-outline' as const, tint: '#B0B0B0', label: 'Lifelog' };
          return (
            <FadeIn delay={Math.min(index, 8) * 40}>
              <Pressable style={[styles.item, !item.read && styles.itemNew]} onPress={() => open(item)} accessibilityLabel={`${item.read ? '' : 'New. '}${item.title}: ${item.body}`}>
                <IconTile icon={look.icon} tint={look.tint} size={38} />
                <View style={{ flex: 1 }}>
                  <View style={styles.row}>
                    <Text style={styles.kind}>{look.label}</Text>
                    <Text style={styles.time}>{ago(item.at)}</Text>
                  </View>
                  {item.title !== 'Lifelog' && (
                    <Text style={[styles.title, !item.read && { fontFamily: fonts.sans }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  )}
                  <Text style={styles.body} numberOfLines={4}>
                    {item.body}
                  </Text>
                </View>
                {!item.read && <View style={styles.dot} />}
              </Pressable>
            </FadeIn>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  barTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 20, color: colors.text },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: 40 },
  item: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'flex-start' },
  itemNew: { backgroundColor: colors.raised },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  kind: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  time: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  title: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.text, marginTop: 4 },
  body: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UNREAD, marginTop: 6 },
});
