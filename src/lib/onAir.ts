import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { radioAudioMode, wav } from './tts';

/*
 * Keeping the radio alive in the background. Android freezes an app's timers once you switch
 * to Spotify, so the hosts couldn't step in between songs. While a show is on air, Lifelog plays
 * a silent looping clip as a media app (with a "Lifelog Radio" player in the notifications).
 * That keeps the app running, and the player's status updates (they keep coming in the
 * background, unlike timers) are the heartbeat that drives the show.
 * The silence asks for no audio focus, so Spotify keeps playing undisturbed.
 */

let keeper: AudioPlayer | null = null;
const beats = new Set<() => void>();

async function silence(): Promise<string> {
  const file = new File(Paths.cache, 'radio-silence.wav');
  if (!file.exists) {
    file.create();
    await file.write(wav(new Uint8Array(24000 * 2 * 2), 24000)); // 2 s of zeros
  }
  return file.uri;
}

export async function goOnAir(title: string, station: string): Promise<void> {
  if (keeper) return updateOnAir(title, station);
  await radioAudioMode();
  keeper = createAudioPlayer(await silence(), { updateInterval: 1000 });
  keeper.loop = true;
  keeper.addListener('playbackStatusUpdate', () => beats.forEach((f) => f()));
  keeper.play();
  try {
    keeper.setActiveForLockScreen(true, { title, artist: station }, { showSeekForward: false, showSeekBackward: false });
  } catch {}
}

export function updateOnAir(title: string, station: string): void {
  try {
    keeper?.updateLockScreenMetadata({ title, artist: station });
  } catch {}
}

export function goOffAir(): void {
  if (!keeper) return;
  try {
    keeper.clearLockScreenControls();
    keeper.pause();
    keeper.remove();
  } catch {}
  keeper = null;
}

/** Runs `f` about once a second while on air, in the foreground and the background. */
export function onBeat(f: () => void): () => void {
  beats.add(f);
  return () => beats.delete(f);
}

/** Waits `ms`, even in the background (a frozen timer is rescued by the heartbeat). */
export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const done = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const off = onBeat(() => {
      if (Date.now() >= end) done();
    });
  });
}
