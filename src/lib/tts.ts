import { fetch } from 'expo/fetch';
import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { jsonHeaders } from './gemini';
import { getKey } from './keys';

/*
 * A voice that sounds like a person: Gemini's text-to-speech (same Gemini key as everything else).
 * The style is plain English ("warm late-night radio DJ"), the language is detected from the text.
 * If there's no key or the call fails, Android's own (robotic) voice steps in, so the show goes on.
 */

const INTERACTIONS = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.8-flash-tts';

export type VoiceStyle = { voice: string; style: string };
export const RADIO_HOST: VoiceStyle = {
  voice: 'Puck', // "upbeat"
  style: 'a warm, charismatic late-night radio DJ, playful and relaxed, smiling while talking',
};

/** Turns text into a .wav file in the cache. Returns its uri. */
export async function synthesize(text: string, v: VoiceStyle = RADIO_HOST): Promise<string> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('A natural voice needs a Gemini key.');
  const res = await fetch(INTERACTIONS, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          type: 'user_input',
          content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: v.style }] }],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: v.voice }] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini voice ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { steps?: { type: string; content?: { type: string; data?: string }[] }[] };
  const audio = (json.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'audio' && c.data)
    .pop();
  if (!audio?.data) throw new Error('Gemini returned no audio.');
  const file = new File(Paths.cache, `voice-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`);
  file.create();
  await file.write(audio.data, { encoding: 'base64' });
  return file.uri;
}

export type Talking = { done: Promise<boolean>; stop: () => void }; // done: true if it finished, false if stopped

/** Plays a voice clip. Gives up after 90 s if the player never reports the end, so nothing hangs. */
export function playClip(uri: string): Talking {
  const player = createAudioPlayer(uri);
  let settle: (finished: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => (settle = r));
  let over = false;
  const end = (finished: boolean) => {
    if (over) return;
    over = true;
    clearTimeout(guard);
    sub.remove();
    player.remove();
    settle(finished);
  };
  const guard = setTimeout(() => end(true), 90_000);
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) end(true);
  });
  player.play();
  return {
    done,
    stop: () => {
      player.pause();
      end(false);
    },
  };
}

/** Android's built-in voice, the fallback. */
export function speakRobot(text: string, language: string): Talking {
  let settle: (finished: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => (settle = r));
  Speech.speak(text, { language, onDone: () => settle(true), onError: () => settle(true), onStopped: () => settle(false) });
  return { done, stop: () => Speech.stop() };
}

/** Deletes the voice clips left in the cache. */
export function clearClips(): void {
  try {
    for (const f of Paths.cache.list()) {
      if (f instanceof File && /^voice-.*\.wav$/.test(f.name)) f.delete();
    }
  } catch {}
}
