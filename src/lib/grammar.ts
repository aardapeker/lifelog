import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig } from './chat';

/**
 * Silently fixes grammar and spelling. Keeps the writer's words, tone, language and
 * line breaks; returns only the corrected text, no explanations.
 */
export async function fixGrammar(db: SQLiteDatabase, text: string): Promise<string> {
  if (!text.trim()) return text;
  const ai = await getBackgroundConfig(db);
  if (!ai) throw new Error('Add an API key in Settings to fix grammar.');

  const fixed = await ai.adapter.complete({
    apiKey: ai.apiKey,
    model: ai.model,
    maxTokens: Math.min(4000, Math.ceil(text.length / 2) + 200),
    system:
      'You are a proofreader for a personal journal. Fix grammar, spelling, punctuation and capitalization only. ' +
      'Keep the original words, meaning, tone, slang and language wherever they are already correct; ' +
      'do not rewrite, shorten, or make it more formal. Leave words in other languages (for example Turkish) as they are. ' +
      'Keep the same paragraphs and line breaks. Reply with the corrected text only: no quotes, no comments, no explanations. ' +
      'If nothing needs fixing, reply with the text unchanged.',
    prompt: text,
  });

  const out = fixed.trim().replace(/^```(?:\w+)?\n?|\n?```$/g, '').trim();
  // guard against a model that answers with commentary instead of the text
  if (!out || out.length < text.trim().length * 0.5) return text;
  return out;
}
