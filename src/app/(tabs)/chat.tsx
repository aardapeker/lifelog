import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { getChatConfig, PROVIDERS, type ChatMessage } from '../../lib/chat';
import { buildSystemPrompt } from '../../lib/context';
import { colors, radius } from '../../lib/theme';

type Row = ChatMessage & { id: number | string };

const HISTORY = 20; // how many past messages are sent with each request

export default function ChatScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
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
        setLabel(`${PROVIDERS[c.provider].label} · ${c.model}`);
      });
      db.getAllAsync<Row>('SELECT id, role, content FROM messages ORDER BY id').then(setMessages);
    }, [db]),
  );

  const clear = useCallback(() => {
    Alert.alert('Clear chat?', 'Your journal stays. Only this conversation is deleted.', [
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
  }, [db]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={clear} hitSlop={10} style={{ marginRight: 16 }}>
          <Text style={{ color: colors.muted }}>Clear</Text>
        </Pressable>
      ),
    });
  }, [navigation, clear]);

  const send = async () => {
    const text = input.trim();
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
      setMessages((prev) =>
        prev.map((m) => (m.id === pendingId ? { ...m, content: `⚠️ ${msg}` } : m)),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!hasKey) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>No API key yet</Text>
        <Text style={styles.emptyText}>Paste a Claude or Gemini key in Settings and come back.</Text>
        <Pressable style={styles.button} onPress={() => router.navigate('/settings')}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={90}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {!!label && <Text style={styles.model}>{label}</Text>}
        {messages.length === 0 && (
          <Text style={styles.emptyText}>Say hi. I've read your journal. 👀</Text>
        )}
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
            {m.content ? (
              <Text
                selectable
                style={[styles.bubbleText, m.role === 'user' && { color: colors.accentText }]}
              >
                {m.content}
              </Text>
            ) : (
              <ActivityIndicator color={colors.muted} />
            )}
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
        />
        <Pressable style={[styles.send, (busy || !input.trim()) && { opacity: 0.4 }]} onPress={send}>
          <Text style={styles.buttonText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  model: { color: colors.muted, fontSize: 11, textAlign: 'center', fontFamily: 'monospace' },
  emptyText: { color: colors.muted, textAlign: 'center', marginTop: 8 },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: radius },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    color: colors.text,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius,
  },
  buttonText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
});
