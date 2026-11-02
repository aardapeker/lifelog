import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { LinkedText } from '../../components/LinkedText';
import { Chip, IconButton, PillButton } from '../../components/ui';
import { getChatConfig, PROVIDERS, type ChatMessage } from '../../lib/chat';
import { titleChat } from '../../lib/chatMemory';
import { addMessage, chatMessages, chatTitle, createChat, getChat, latestChat } from '../../lib/chats';
import { deliverDue } from '../../lib/checkins';
import { buildSystemPrompt, searchTool } from '../../lib/context';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';

type Row = ChatMessage & { id: number | string };

const HISTORY = 20; // how many past messages are sent with each request
const STARTERS = ['How was my week?', 'What have I been worried about?', 'Remind me what I planned'];

/** APIs want user/assistant turns to alternate and start with the user; check-ins can break that. */
function toApiMessages(rows: Row[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const { role, content } of rows) {
    const last = out[out.length - 1];
    if (last?.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

export default function ChatScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; new?: string; ask?: string }>();
  const [chatId, setChatId] = useState<number | null>(null); // null = a new chat, saved on first message
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Row[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [label, setLabel] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const keyboardOpen = useKeyboardVisible();
  const opened = useRef<{ id: number | null; at: number } | null>(null); // what's on screen, and since when

  const open = useCallback(
    async (id: number | null) => {
      opened.current = { id, at: Date.now() };
      setChatId(id);
      if (id === null) {
        setTitle(null);
        setMessages([]);
        return;
      }
      const [chat, msgs] = await Promise.all([getChat(db, id), chatMessages(db, id)]);
      setTitle(chat?.title ?? null);
      setMessages(msgs);
    },
    [db],
  );

  const startNew = useCallback(() => {
    if (busy) return;
    setInput('');
    open(null);
  }, [busy, open]);

  // opened from History (?id=), from a Read (?new=1&ask=…)
  useEffect(() => {
    if (params.new === '1') {
      open(null);
      if (params.ask) setInput(params.ask);
    } else if (params.id) {
      open(Number(params.id));
    } else {
      return;
    }
    router.setParams({ id: undefined, new: undefined, ask: undefined });
  }, [params.id, params.new, params.ask, open]);

  useFocusEffect(
    useCallback(() => {
      getChatConfig(db).then((c) => {
        setHasKey(!!c.apiKey);
        setLabel(`${PROVIDERS[c.provider].label}, ${c.model}`);
      });
      (async () => {
        // check-ins whose time has come appear as messages from the friend
        await deliverDue(db).catch(() => 0);
        const latest = await latestChat(db);
        const current = opened.current;
        if (!current) {
          // first visit: continue the most recent conversation
          await open(latest?.id ?? null);
        } else if (latest && latest.id !== current.id && latest.created_at > current.at && !input.trim()) {
          // the friend started a new conversation while you were away
          await open(latest.id);
        } else if (current.id !== null) {
          await open(current.id);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, open]),
  );

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
    let id = chatId;
    if (id === null) {
      id = await createChat(db);
      opened.current = { id, at: Date.now() };
      setChatId(id);
    }
    const now = Date.now();
    const userId = await addMessage(db, id, 'user', text, now);
    const history: Row[] = [...messages, { id: userId, role: 'user', content: text }];
    const pendingId = `pending-${now}`;
    setMessages([...history, { id: pendingId, role: 'assistant', content: '' }]);

    try {
      const system = await buildSystemPrompt(db);
      const reply = await PROVIDERS[provider].stream({
        apiKey,
        model,
        system,
        messages: toApiMessages(history.slice(-HISTORY)),
        tools: [searchTool(db)],
        onText: (full) =>
          setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content: full } : m))),
      });
      const replyId = await addMessage(db, id, 'assistant', reply);
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, id: replyId } : m)));
      if (!title) {
        const chatIdForTitle = id;
        titleChat(db, chatIdForTitle)
          .then(() => getChat(db, chatIdForTitle))
          .then((c) => {
            if (opened.current?.id === chatIdForTitle) setTitle(c?.title ?? null);
          })
          .catch(() => {});
      }
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
        <PillButton
          label="Open Settings"
          onPress={() => router.navigate('/settings')}
          style={{ marginTop: 22, alignSelf: 'flex-start' }}
        />
      </View>
    );
  }

  const canSend = !busy && !!input.trim();
  const isEmptyNew = chatId === null && messages.length === 0;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 12 }]} behavior="padding">
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {chatId === null ? 'New chat' : chatTitle({ title })}
          </Text>
          {!!label && <Text style={styles.model}>{label}</Text>}
        </View>
        <IconButton icon="time-outline" label="Chat history" onPress={() => router.push('/chats')} />
        {!isEmptyNew && <IconButton icon="create-outline" label="New chat" onPress={startNew} />}
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
                <LinkedText text={m.content} style={styles.theirsText} />
              ) : (
                <ActivityIndicator color={colors.text} style={{ alignSelf: 'flex-start' }} />
              )}
            </View>
          ),
        )}
      </ScrollView>

      <View style={[styles.composer, { marginBottom: keyboardOpen ? 8 : TAB_BAR_SPACE - 30 + insets.bottom }]}>
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
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 6 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.text },
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
