import Ionicons from '../components/Icon';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../components/ui';
import { chatTitle, deleteChat, listChats, type ChatSummary } from '../lib/chats';
import { formatDate } from '../lib/notes';
import { colors, fonts, radius } from '../lib/theme';

/** All conversations, newest first. Tap to continue one, hold to delete it. */
export default function ChatHistoryScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<ChatSummary[]>([]);

  const load = useCallback(() => {
    listChats(db).then(setChats);
  }, [db]);
  useFocusEffect(load);

  const openChat = (id: number) => router.navigate({ pathname: '/chat', params: { id: String(id) } });

  const remove = (c: ChatSummary) =>
    Alert.alert(
      'Delete this chat?',
      `"${chatTitle(c)}" and anything your friend learned only from it will be forgotten. Your journal stays.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteChat(db, c.id);
            load();
          },
        },
      ],
    );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
        <Text style={styles.barTitle}>Chat history</Text>
        <IconButton
          icon="create-outline"
          label="New chat"
          onPress={() => router.navigate({ pathname: '/chat', params: { new: '1' } })}
        />
      </View>
      <FlatList
        style={styles.sheet}
        data={chats}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        ListEmptyComponent={<Text style={styles.empty}>No chats yet. Start one from the Chat tab.</Text>}
        ListFooterComponent={
          chats.length ? <Text style={styles.hint}>Hold a chat to delete it.</Text> : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => openChat(item.id)}
            onLongPress={() => remove(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {chatTitle(item)}
              </Text>
              {!!item.preview && (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview}
                </Text>
              )}
              <Text style={styles.meta}>
                {formatDate(item.updated_at)}, {item.count === 1 ? '1 message' : `${item.count} messages`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  preview: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 3 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 6 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted, marginTop: 20 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 16 },
});
