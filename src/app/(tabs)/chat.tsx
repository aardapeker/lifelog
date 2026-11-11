import Ionicons from '../../components/Icon';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { Glass } from '../../components/Glass';
import { LinkedText } from '../../components/LinkedText';
import { FadeIn, PressScale, TypingDots } from '../../components/motion';
import { Chip, IconButton, PillButton } from '../../components/ui';
import { Avatar, Bell } from '../../components/TopBar';
import { ForYou } from '../../components/ForYou';
import { getChatConfig, PROVIDERS, type ChatMessage } from '../../lib/chat';
import { titleChat } from '../../lib/chatMemory';
import { addMessage, chatMessages, chatTitle, createChat, getChat, latestChat } from '../../lib/chats';
import { deliverDue } from '../../lib/checkins';
import { buildSystemPrompt, searchTool } from '../../lib/context';
import { songsTool, spotifyConnected } from '../../lib/spotify';
import { colors, inputColors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';

type Row = ChatMessage & { id: number | string; key?: string }; // key stays the same while a reply streams in

const HISTORY = 20; // how many past messages are sent with each request
const STARTERS = ['How was my week?', 'What have I been worried about?', 'Remind me what I planned'];

/** 🔥 Roast mode: the friend roasts your week from the journal, the way a best friend would. */
const ROAST_ASK = '🔥 Roast my week';
const ROAST =
  '\n\nROAST MODE, for this reply only: the listener asked you to roast their week. Go through what they actually ' +
  'wrote in the last 7 days and roast it like a stand-up comedian who is also their best friend: specific callbacks, ' +
  'exaggeration, running gags (their cat, their servis, their sleep, their excuses), 6 to 10 punchy lines. ' +
  'Lovingly: never about their body, their money troubles, their health or anyone they lost; nothing that would ' +
  'actually hurt. End with one genuinely warm line that shows you are proud of them. Same language as their journal.';

/**
 * APIs want user/assistant turns to alternate and start with the user. Check-ins and daily messages
 * start a chat with the friend talking, so a stand-in user turn goes first: dropping them would make
 * the friend forget what it just said.
 */
function toApiMessages(rows: Row[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const { role, content } of rows) {
    const last = out[out.length - 1];
    if (last?.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(You texted me first. Your message is next.)' });
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
  const [tab, setTab] = useState<'chat' | 'foryou'>('chat');
  // opened to a specific chat (history, a Read's "ask about it", ＋ → Ask): show the chat side
  useEffect(() => {
    if (params.id || params.new || params.ask) setTab('chat');
  }, [params.id, params.new, params.ask]);
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [label, setLabel] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const keyboardOpen = useKeyboardVisible();
  const opened = useRef<{ id: number | null; at: number } | null>(null); // what's on screen, and since when
  const old = useRef(new Set<string>()); // messages that were already there when the chat opened: no entrance animation

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
      old.current = new Set(msgs.map((m) => String(m.id)));
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
    const roast = text === ROAST_ASK;
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
    setMessages([...history, { id: pendingId, key: pendingId, role: 'assistant', content: '' }]);

    try {
      const system = (await buildSystemPrompt(db)) + (roast ? ROAST : '');
      const reply = await PROVIDERS[provider].stream({
        apiKey,
        model,
        system,
        messages: toApiMessages(history.slice(-HISTORY)),
        tools: [searchTool(db), ...((await spotifyConnected()) ? [songsTool()] : [])],
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
          onPress={() => router.push('/settings/ai')}
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
        <Avatar size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {tab === 'foryou' ? 'For you' : chatId === null ? 'New chat' : chatTitle({ title })}
          </Text>
          {tab === 'chat' && !!label && (
            <Text style={styles.model} numberOfLines={1}>
              {label}
            </Text>
          )}
        </View>
        {tab === 'chat' && <IconButton icon="flame-outline" label="Roast my week" onPress={() => send(ROAST_ASK)} />}
        {tab === 'chat' && <IconButton icon="time-outline" label="Chat history" onPress={() => router.push('/chats')} />}
        {tab === 'chat' && !isEmptyNew && <IconButton icon="create-outline" label="New chat" onPress={startNew} />}
        <Bell />
      </View>

      {/* Chat, or what your friend made for you on its own */}
      <View style={styles.switch}>
        {(['chat', 'foryou'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.switchItem, tab === t && styles.switchOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.switchText, tab === t && styles.switchTextOn]}>{t === 'chat' ? 'Chat' : 'For you'}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'foryou' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
          <ForYou />
        </ScrollView>
      ) : (
      <>

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
              {[...STARTERS, ROAST_ASK].map((q) => (
                <Chip key={q} label={q} onPress={() => send(q)} />
              ))}
            </View>
          </View>
        )}
        {messages.map((m) => {
          const key = m.key ?? String(m.id);
          const bubble =
            m.role === 'user' ? (
              <View style={styles.mine}>
                <Text selectable style={styles.mineText}>
                  {m.content}
                </Text>
              </View>
            ) : (
              <View style={styles.theirs}>
                {m.content ? <LinkedText text={m.content} style={styles.theirsText} /> : <TypingDots />}
              </View>
            );
          // new messages slide up into the thread; the ones already there just sit
          return old.current.has(key) ? (
            <View key={key}>{bubble}</View>
          ) : (
            <FadeIn key={key} from={m.role === 'user' ? 18 : 10}>
              {bubble}
            </FadeIn>
          );
        })}
      </ScrollView>

      <Glass radius={26} style={[styles.composer, { marginBottom: keyboardOpen ? 8 : TAB_BAR_SPACE - 30 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Write a message"
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
          {...inputColors}
        />
        <PressScale
          style={[styles.send, !canSend && { backgroundColor: '#4A4949' }]}
          onPress={() => send()}
          disabled={!canSend}
          scaleTo={0.85}
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={20} color={canSend ? colors.accentText : colors.muted} />
        </PressScale>
      </Glass>
      </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', paddingHorizontal: 28 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 10 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 24, color: colors.text },
  switch: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 6, backgroundColor: colors.raised, borderRadius: 999, padding: 4 },
  switchItem: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
  switchOn: { backgroundColor: colors.accent },
  switchText: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted },
  switchTextOn: { fontFamily: fonts.sans, color: colors.accentText },
  model: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },

  thread: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 18 },
  intro: { marginTop: 24 },
  bigTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 46, lineHeight: 50, color: colors.text, marginBottom: 14 },
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
