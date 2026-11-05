import { createAudioPlaylist, type AudioPlaylist } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { beat } from './heartbeat';
import { radioAudioMode, wav } from './tts';

/*
 * Keeping the radio alive in the background, and the lock screen buttons.
 *
 * Android freezes an app's timers once you switch to Spotify. While a show is on air, Lifelog
 * plays a silent looping playlist as a media app ("Lifelog Radio" in the notifications and on
 * the lock screen). That keeps the app running; the playlist's status updates (they keep coming
 * in the background, unlike timers) are the heartbeat that drives the show. The silence asks
 * for no audio focus, so Spotify keeps playing undisturbed.
 *
 * The lock screen's ⏯ and ⏭ act on that silent playlist; we watch it and turn them into
 * pause / play / skip for the show.
 */

let keeper: AudioPlaylist | null = null;
export type Remote = { pause: () => void; play: () => void; next: () => void };
let remote: Remote | null = null;

const TRACK_SECONDS = 60;
let lastPlaying = true;
let lastTime = 0;
let expectedChange = false; // our own play/pause, not a button press
let armed = false; // buttons count only once the silence has really started (loading looks like "paused")

async function silence(): Promise<string> {
  const file = new File(Paths.cache, 'radio-silence-60s.wav');
  if (!file.exists) {
    file.create();
    await file.write(wav(new Uint8Array(8000 * 2 * TRACK_SECONDS), 8000)); // 60 s of zeros, small
  }
  return file.uri;
}

export async function goOnAir(title: string, station: string): Promise<void> {
  if (keeper) return updateOnAir(title, station);
  await radioAudioMode();
  const uri = await silence();
  // two tracks, so the lock screen shows ⏭ (it's only offered for playlists)
  keeper = createAudioPlaylist({ sources: [uri, uri], updateInterval: 1000, loop: 'all' });
  lastPlaying = true;
  lastTime = 0;
  armed = false;
  keeper.addListener('playlistStatusUpdate', (s) => {
    beat();
    if (!armed) {
      armed = s.playing;
      lastPlaying = true;
    } else if (s.playing !== lastPlaying) {
      if (!expectedChange) (s.playing ? remote?.play : remote?.pause)?.();
      expectedChange = false;
      lastPlaying = s.playing;
    }
    lastTime = s.currentTime;
  });
  keeper.addListener('trackChanged', () => {
    // a silent track running out on its own isn't a button press
    if (armed && lastTime < TRACK_SECONDS - 3) remote?.next();
    lastTime = 0;
  });
  keeper.play();
  try {
    keeper.setActiveForLockScreen(true, { title, artist: station }, { showNextTrack: true, showSeekForward: false, showSeekBackward: false });
  } catch {}
}

export function updateOnAir(title: string, station: string): void {
  try {
    keeper?.updateLockScreenMetadata({ title, artist: station });
  } catch {}
}

/** Keeps the lock screen's play/pause in step when the show is paused or resumed in the app. */
export function setOnAirPlaying(playing: boolean): void {
  if (!keeper || playing === lastPlaying) return;
  expectedChange = true;
  if (playing) keeper.play();
  else keeper.pause();
}

/** What the lock screen buttons should do. Returns a function that unhooks them. */
export function onRemote(r: Remote): () => void {
  remote = r;
  return () => {
    if (remote === r) remote = null;
  };
}

export function goOffAir(): void {
  if (!keeper) return;
  try {
    keeper.clearLockScreenControls();
    keeper.pause();
    keeper.destroy();
  } catch {}
  keeper = null;
}

export { onBeat, waitMs } from './heartbeat';
