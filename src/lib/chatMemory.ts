import type { SQLiteDatabase } from 'expo-sqlite';
import { tooManyTries } from './db';
import { getAutonomySettings, isNeverResearch } from './autonomySettings';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { chatMessages, getChat, quietChatsToLearn, renameChat } from './chats';

const KINDS = ['person', 'pet', 'place', 'goal', 'plan', 'habit', 'preference', 'event', 'feeling'];

/** A short title right after the first answer, so History isn't a list of "New chat". */
export async function titleChat(db: SQLiteDatabase, chatId: number): Promise<void> {
  const chat = await getChat(db, chatId);
  if (!chat || chat.title) return;
  const ai = await getBackgroundConfig(db);
  if (!ai) return;
  const msgs = (await chatMessages(db, chatId)).slice(0, 4);
  const title = await ai.adapter.complete({
    feature: 'chat',
    apiKey: ai.apiKey,
    model: ai.model,
    maxTokens: 30,
    system:
      'Give this conversation a short title of 2 to 5 words, like a note title. Same language as the conversation. ' +
      'No quotes, no period, no emoji. Output only the title.',
    prompt: msgs.map((m) => `${m.role === 'user' ? 'User' : 'Friend'}: ${m.content.slice(0, 400)}`).join('\n'),
  });
  const clean = title.trim().replace(/^["'“]+|["'”.]+$/g, '').slice(0, 60);
  // only if nobody named it meanwhile
  if (clean) await db.runAsync('UPDATE chats SET title = ? WHERE id = ? AND title IS NULL', clean, chatId);
}

type ChatAnalysis = {
  title?: string;
  facts?: { kind?: string; subject?: string | null; text?: string }[];
  read?: { topic?: string; angles?: string[]; why?: string } | null;
};

let running = false;

/**
 * For chats that went quiet: learn durable facts about the user (so the friend remembers
 * chats like it remembers journal entries) and maybe queue one Read about the topic.
 */
export async function learnFromChats(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  running = true;
  let learned = 0;
  try {
    const settings = await getAutonomySettings(db);
    for (const chat of await quietChatsToLearn(db)) {
      const msgs = await chatMessages(db, chat.id);
      const transcript = msgs
        .slice(-40)
        .map((m) => `${m.role === 'user' ? 'USER' : 'FRIEND'}: ${m.content.slice(0, 1500)}`)
        .join('\n\n');
      try {
        const reply = await ai.adapter.complete({
    feature: 'chat',
          apiKey: ai.apiKey,
          model: ai.model,
          json: true,
          maxTokens: 900,
          system: `You read a chat between a user and their AI friend and return JSON:
1. "title": a 2 to 5 word title for the chat, same language as the chat.
2. "facts": durable facts about the USER worth remembering in a month, only from what the USER said
   (never from the friend's guesses). Each {"kind", "subject", "text"}; kind is one of ${KINDS.join(', ')};
   subject is the person, pet or place it's about, or null; text is one short third-person sentence. Usually 0 to 4.
3. "read": if the user showed real curiosity about a topic the web could teach them more about
   (a technology, a product, a place, a skill, a news subject), propose ONE short article for them:
   {"topic": "short title", "angles": ["3 web searches: the basics", "what's new lately", "practical tips or options"],
   "why": "what they asked or said"}. Otherwise null. Small talk and feelings are not research topics.
   Never propose a read about these: ${settings.never.join(', ') || '(nothing excluded)'}.`,
          prompt: transcript,
        });
        const a = parseJsonReply<ChatAnalysis>(reply);
        await db.withTransactionAsync(async () => {
          if (!chat.title && a.title?.trim()) await renameChat(db, chat.id, a.title.trim().slice(0, 60));

          await db.runAsync('DELETE FROM facts WHERE chat_id = ?', chat.id);
          for (const f of a.facts ?? []) {
            if (!f.text?.trim()) continue;
            await db.runAsync(
              'INSERT INTO facts(chat_id, kind, subject, text, created_at) VALUES (?, ?, ?, ?, ?)',
              chat.id,
              KINDS.includes(f.kind ?? '') ? f.kind! : 'event',
              f.subject?.trim() || null,
              f.text.trim(),
              chat.updated_at,
            );
          }

          // one Read per chat at most, and never on a topic from the "never look up" list
          const r = a.read;
          const angles = (r?.angles ?? []).map((x) => x?.trim()).filter(Boolean).slice(0, 3);
          if (settings.enabled && settings.reads && r?.topic?.trim() && angles.length) {
            const blocked = isNeverResearch(`${r.topic} ${angles.join(' ')}`, settings.never);
            const exists = await db.getFirstAsync('SELECT id FROM reads WHERE chat_id = ?', chat.id);
            if (!blocked && !exists) {
              await db.runAsync(
                'INSERT INTO reads(chat_id, topic, angles, why, created_at) VALUES (?, ?, ?, ?, ?)',
                chat.id,
                r.topic.trim(),
                JSON.stringify(angles),
                r.why?.trim() || null,
                Date.now(),
              );
            }
          }
          await db.runAsync('UPDATE chats SET learned_at = ? WHERE id = ?', Date.now(), chat.id);
        });
        learned++;
      } catch (e) {
        console.warn('learning from chat failed', e);
        if (await tooManyTries(db, `chat.${chat.id}`, e)) await db.runAsync('UPDATE chats SET learned_at = ? WHERE id = ?', Date.now(), chat.id);
        break;
      }
    }
  } finally {
    running = false;
  }
  return learned;
}
