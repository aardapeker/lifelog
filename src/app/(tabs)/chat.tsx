import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, PillButton } from '../../components/ui';
import { getChatConfig, PROVIDERS, type ChatMessage } from '../../lib/chat';
import { buildSystemPrompt } from '../../lib/context';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';

type Row = ChatMessage & { id: number | string };

const HISTORY = 20; // how many past messages are sent with each request
const STARTERS = ['How was my week?', 'What have I been worried about?', 'Remind me what I planned'];

export default function ChatScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Row[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [label, setLabel] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);

  useFocusEffect(
    useCallback(() => {
      getChatConfig(db).then((c) => {
        setHasKey(!!c.apiKey);
        setLabel(`${PROVIDERS[c.provider].label}, ${c.model}`);
      });
      db.getAllAsync<Row>('SELECT id, role, content FROM messages ORDER BY id').then(setMessages);
    }, [db]),
  );

  const clear = () => {
    Alert.alert('Clear this chat?', 'Your journal stays. Only this conversation is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await db.runAsync('DELETE FROM messages');
          setMessages([]);
        },
      },
    ]);
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const { provider, model, apiKey } = await getChatConfig(db);
    if (!apiKey) {
      setHasKey(false);
      return;
    }

    setInput('');
    setBusy(true);
    const now = Date.now();
    const userRes = await db.runAsync(
      'INSERT INTO messages(role, content, created_at) VALUES (?, ?, ?)',
      'user',
      text,
      now,
    );
    const history: Row[] = [...messages, { id: userRes.lastInsertRowId, role: 'user', content: text }];
    const pendingId = `pending-${now}`;
    setMessages([...history, { id: pendingId, role: 'assistant', content: '' }]);

    try {
      const system = await buildSystemPrompt(db, text);
      const reply = await PROVIDERS[provider].stream({
        apiKey,
        model,
        system,
        messages: history.slice(-HISTORY).map(({ role, content }) => ({ role, content })),
        onText: (full) =>
          setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content: full } : m))),
      });
      const res = await db.runAsync(
        'INSERT INTO messages(role, content, created_at) VALUES (?, ?, ?)',
        'assistant',
        reply,
        Date.now(),
      );
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, id: res.lastInsertRowId } : m)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content: `Couldn't answer: ${msg}` } : m)));
    } finally {
      setBusy(false);
    }
  };

  if (!hasKey) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.bigTitle}>{'Add a Key\nto Begin'}</Text>
        <Text style={styles.muted}>One Gemini key is enough. Paste it in Settings, then come back.</Text>
        <PillButton label="Open Settings" onPress={() => router.navigate('/settings')} style={{ marginTop: 22, alignSelf: 'flex-start' }} />
      </View>
    );
  }

  const canSend = !busy && !!input.trim();

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 12 }]} behavior="padding">
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Chat</Text>
          {!!label && <Text style={styles.model}>{label}</Text>}
        </View>
        {messages.length > 0 && <IconButton icon="refresh" label="Clear chat" onPress={clear} />}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.intro}>
            <Text style={styles.bigTitle}>{"I've Read\nYour Journal"}</Text>
            <Text style={styles.muted}>Ask me anything about your days, or just tell me how the shift went.</Text>
            <View style={styles.starters}>
              {STARTERS.map((q) => (
                <Chip key={q} label={q} onPress={() => send(q)} />
              ))}
            </View>
          </View>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={styles.mine}>
              <Text selectable style={styles.mineText}>
                {m.content}
              </Text>
            </View>
          ) : (
            <View key={m.id} style={styles.theirs}>
              {m.content ? (
                <Text selectable style={styles.theirsText}>
                  {m.content}
                </Text>
              ) : (
                <ActivityIndicator color={colors.text} style={{ alignSelf: 'flex-start' }} />
              )}
            </View>
          ),
        )}
      </ScrollView>

      <View style={[styles.composer, { marginBottom: TAB_BAR_SPACE - 30 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
          selectionColor={colors.text}
          cursorColor={colors.text}
        />
        <Pressable
          style={[styles.send, !canSend && { backgroundColor: '#4A4949' }]}
          onPress={() => send()}
          disabled={!canSend}
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={20} color={canSend ? colors.accentText : colors.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', paddingHorizontal: 28 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 },
  title: { fontFamily: fonts.serif, fontSize: 34, color: colors.text },
  model: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },

  thread: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 18 },
  intro: { marginTop: 24 },
  bigTitle: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 50, color: colors.text, marginBottom: 14 },
  muted: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, maxWidth: 320 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },

  // the friend writes like a letter: no bubble, serif
  theirs: { alignSelf: 'stretch', paddingRight: 20 },
  theirsText: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 27, color: colors.text },
  // you: white bubble on the right
  mine: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  mineText: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 21, color: colors.accentText },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    paddingLeft: 20,
    paddingRight: 5,
    paddingVertical: 5,
    borderRadius: 26,
    backgroundColor: colors.raised,
  },
  input: {
    flex: 1,
    maxHeight: 130,
    minHeight: 42,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
