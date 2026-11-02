import type { SQLiteDatabase } from 'expo-sqlite';
import type { ChatMessage } from './chat';

/*
 * Chat sessions. "New chat" starts a fresh conversation; old ones stay in History.
 * A chat row is only created when its first message is sent, so empty chats never pile up.
 */

export type Chat = {
  id: number;
  title: string | null;
  created_at: number;
  updated_at: number;
  learned_at: number | null;
};
export type ChatSummary = Chat & { preview: string | null; count: number };
export type Message = ChatMessage & { id: number; created_at: number };

const HOUR = 3600e3;
/** A message from the friend joins the latest chat if it was active this recently, else starts a new one. */
const JOIN_WINDOW = 3 * HOUR;

export const chatTitle = (c: Pick<Chat, 'title'>) => c.title?.trim() || 'New chat';

export function getChat(db: SQLiteDatabase, id: number): Promise<Chat | null> {
  return db.getFirstAsync<Chat>('SELECT * FROM chats WHERE id = ?', id);
}

export function latestChat(db: SQLiteDatabase): Promise<Chat | null> {
  return db.getFirstAsync<Chat>('SELECT * FROM chats ORDER BY updated_at DESC LIMIT 1');
}

export function listChats(db: SQLiteDatabase): Promise<ChatSummary[]> {
  return db.getAllAsync<ChatSummary>(
    `SELECT c.*, count(m.id) AS count,
       (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS preview
     FROM chats c LEFT JOIN messages m ON m.chat_id = c.id
     GROUP BY c.id ORDER BY c.updated_at DESC`,
  );
}

export function chatMessages(db: SQLiteDatabase, chatId: number): Promise<Message[]> {
  return db.getAllAsync<Message>(
    'SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at, id',
    chatId,
  );
}

export async function createChat(db: SQLiteDatabase, title: string | null = null, at = Date.now()): Promise<number> {
  const res = await db.runAsync('INSERT INTO chats(title, created_at, updated_at) VALUES (?, ?, ?)', title, at, at);
  return res.lastInsertRowId;
}

/** Adds a message and marks the chat as active. */
export async function addMessage(
  db: SQLiteDatabase,
  chatId: number,
  role: ChatMessage['role'],
  content: string,
  at = Date.now(),
): Promise<number> {
  const res = await db.runAsync(
    'INSERT INTO messages(chat_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    chatId,
    role,
    content,
    at,
  );
  await db.runAsync('UPDATE chats SET updated_at = max(updated_at, ?) WHERE id = ?', at, chatId);
  return res.lastInsertRowId;
}

export async function renameChat(db: SQLiteDatabase, id: number, title: string): Promise<void> {
  await db.runAsync('UPDATE chats SET title = ? WHERE id = ?', title.trim() || null, id);
}

/** Deletes the chat, its messages and anything learned only from it. Reads it led to stay. */
export async function deleteChat(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM chats WHERE id = ?', id);
}

/** Where a check-in or daily message from the friend goes: the live conversation, or a new one. */
export async function chatForIncoming(db: SQLiteDatabase, at: number, title: string): Promise<number> {
  const latest = await latestChat(db);
  if (latest && at - latest.updated_at < JOIN_WINDOW) return latest.id;
  return createChat(db, title, at);
}

/** Chats that went quiet (1 h without a message) and have something new to learn from. */
export function quietChatsToLearn(db: SQLiteDatabase): Promise<Chat[]> {
  return db.getAllAsync<Chat>(
    `SELECT c.* FROM chats c
     WHERE c.updated_at < ? AND (c.learned_at IS NULL OR c.learned_at < c.updated_at)
       AND (SELECT count(*) FROM messages WHERE chat_id = c.id AND role = 'user') >= 2
     ORDER BY c.updated_at LIMIT 3`,
    Date.now() - HOUR,
  );
}
