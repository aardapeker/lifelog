import { createAudioPlaylist, type AudioPlaylist } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { breadcrumb } from './crashLog';
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
export type Remote = { pause: () => void; play: () => void; next: () => void; previous: () => void };
let remote: Remote | null = null;

const TRACK_SECONDS = 60;
const TRACKS = 3; // silent tracks in the lock-screen playlist
let lastPlaying = true;
let lastTime = 0;
let expectedChange = false; // our own play/pause, not a button press
let armed = false; // buttons count only once the silence has really started (loading looks like "paused")
let lastIndex = 0; // which silent track is on: it changing is a ⏭ press (or the silence running out)
let changedAt = 0; // when the track last changed: the reload right after looks like a pause + play
const SETTLE_MS = 2500;
const TOGGLE_WAIT_MS = 700; // a play/pause from the lock screen waits this long, in case it's really a ⏭
let pendingToggle: ReturnType<typeof setTimeout> | null = null;

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
  breadcrumb('on air: audio mode');
  await radioAudioMode();
  breadcrumb('on air: silence file');
  const uri = await silence();
  // three tracks, so the lock screen shows ⏮ ⏭ (only offered for playlists) AND the direction can be
  // told apart: with two, "back one" and "forward one" were the same move, so ⏮ skipped forward
  breadcrumb('on air: creating the silent playlist');
  keeper = createAudioPlaylist({ sources: [uri, uri, uri], updateInterval: 1000, loop: 'all' });
  lastPlaying = true;
  lastTime = 0;
  lastIndex = 0;
  changedAt = 0;
  armed = false;
  /**
   * ⏭ on the lock screen moves the silent playlist to its other track. Seen either through the
   * trackChanged event or the status' index (whichever comes first; the other is ignored), so
   * one tap is always one skip. The silence running out on its own (near its end) isn't a tap.
   */
  const trackMoved = (index: number) => {
    if (index === lastIndex) return;
    const previousIndex = lastIndex;
    lastIndex = index;
    changedAt = Date.now();
    // the "paused" that came just before was the ⏭ reloading the silence, not a pause tap
    if (pendingToggle) clearTimeout(pendingToggle);
    pendingToggle = null;
    const forward = (index - previousIndex + TRACKS) % TRACKS === 1;
    if (armed) {
      if (!forward) remote?.previous();
      else if (lastTime < TRACK_SECONDS - 3) remote?.next(); // (near the end it's the silence running out by itself)
    }
    lastTime = 0;
  };
  keeper.addListener('playlistStatusUpdate', (s) => {
    beat();
    trackMoved(s.currentIndex);
    if (!armed) {
      armed = s.playing;
      lastPlaying = true;
    } else if (s.playing !== lastPlaying) {
      // switching tracks reloads the silence: it reads as "paused, then playing" for a moment. That
      // used to pause the song we had just skipped to (and play it again), so ⏭ needed several taps
      const reloading = s.isBuffering || !s.isLoaded || Date.now() - changedAt < SETTLE_MS;
      if (!reloading) {
        lastPlaying = s.playing;
        if (expectedChange) expectedChange = false;
        else {
          // a ⏭ tap often reports "paused" BEFORE the track change: acting on it at once paused the
          // show, and the skip that followed got lost (so the first tap seemed to do nothing). Wait a
          // moment: if the track changes meanwhile, it was a skip, and trackMoved cancels this.
          const wantPlay = s.playing;
          if (pendingToggle) clearTimeout(pendingToggle);
          pendingToggle = setTimeout(() => {
            pendingToggle = null;
            (wantPlay ? remote?.play : remote?.pause)?.();
          }, TOGGLE_WAIT_MS);
        }
      }
    }
    // ⏮ a few seconds into a track restarts it (like any music player) instead of changing track
    if (armed && s.currentIndex === lastIndex && lastTime > 4 && s.currentTime < 1.5 && Date.now() - changedAt > SETTLE_MS) remote?.previous();
    lastTime = s.currentTime;
  });
  keeper.addListener('trackChanged', (e) => trackMoved(e.currentIndex));
  breadcrumb('on air: playing the silence');
  keeper.play();
  breadcrumb('on air: lock screen controls');
  try {
    keeper.setActiveForLockScreen(true, { title, artist: station }, { showNextTrack: true, showSeekForward: false, showSeekBackward: false });
  } catch {}
  breadcrumb('on air: done');
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
  if (pendingToggle) clearTimeout(pendingToggle);
  pendingToggle = null;
  if (!keeper) return;
  try {
    keeper.clearLockScreenControls();
    keeper.pause();
    keeper.destroy();
  } catch {}
  keeper = null;
}

export { onBeat, waitMs } from './heartbeat';
