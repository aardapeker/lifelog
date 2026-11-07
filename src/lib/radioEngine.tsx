import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Status } from '../components/ui';
import { albumColors, type Palette } from './albumColors';
import { getSetting, setSetting } from './db';
import { goOffAir, goOnAir, onBeat, onRemote, setOnAirPlaying, updateOnAir, waitMs } from './onAir';
import { buildShow, castOf, type Show } from './radio';
import {
  nudgeSpotify,
  pausePlayback,
  playbackState,
  playTracks,
  remoteReady,
  resumePlayback,
  sameTrack,
  savePlaylist,
  spotifyReport,
  wakeSpotify,
  type Track,
} from './spotify';
import { stationByKey, withVoices, type Lang, type Persona, type VoiceChoices } from './stations';
import { likedSongs, rememberPlayed, toggleLiked } from './songMemory';
import { clearClips, playClip, speakRobot, synthesize, type Talking } from './tts';

/*
 * The radio's engine lives here, mounted once at the root of the app, so a show keeps running
 * (and keeps its songs and talks) when you close the Radio screen. The screen only shows it.
 */

/** Resolves with the promise's value, or undefined after `ms` (even in the background). Never throws. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), waitMs(ms).then(() => undefined)]);
}

const END_MARGIN_MS = 2500; // stop this close to the end, so Spotify doesn't drift into its own autoplay

type Phase = 'pick' | 'building' | 'onair' | 'done';

function useRadioEngine() {
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<Phase>('pick');
  const [stationKey, setStationKey] = useState('neon');
  const [choices, setChoices] = useState<VoiceChoices>({});
  const [trying, setTrying] = useState<string | null>(null); // voice being previewed
  const preview = useRef<Talking | null>(null);
  const station = withVoices(stationByKey(stationKey), choices);

  useEffect(() => {
    getSetting(db, 'radio.voices', '{}')
      .then((v) => setChoices(JSON.parse(v) as VoiceChoices))
      .catch(() => {});
  }, [db]);

  /** Remembers a choice for this station. */
  const remember = (patch: VoiceChoices[string]) => {
    const next = { ...choices, [stationKey]: { ...choices[stationKey], ...patch } };
    setChoices(next);
    setSetting(db, 'radio.voices', JSON.stringify(next)).catch(() => {});
  };
  const chooseLang = (lang: Lang) => remember({ lang });

  /** Picks a voice for the host or sidekick, remembers it, and lets you hear it. */
  const chooseVoice = async (role: 'host' | 'sidekick', p: Persona, voice: string) => {
    remember({ [role]: voice });
    preview.current?.stop();
    setTrying(voice);
    try {
      const uri = await synthesize(
        [
          {
            speaker: p.name,
            text:
              station.lang === 'tr'
                ? `Merhaba! Ben ${p.name}, ${station.name} ${station.freq} dinliyorsunuz.`
                : `Hey! I'm ${p.name}, and you're listening to ${station.name} ${station.freq}.`,
          },
        ],
        [{ name: p.name, voice, style: p.style }],
      );
      preview.current = playClip(uri);
      await preview.current.done;
    } catch (e) {
      fail(e);
    } finally {
      setTrying((t) => (t === voice ? null : t));
    }
  };
  const [wish, setWish] = useState('');
  const [voice, setVoice] = useState(true);
  const [show, setShow] = useState<Show | null>(null);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [progress, setProgress] = useState(0); // of the current song, 0..1
  const [palette, setPalette] = useState<Palette | null>(null); // the album cover's colours

  // the engine runs on refs: timers and speech callbacks must see the latest values
  // talked: the last slot whose talk already played (so resuming starts just the song)
  // overlapping: the hosts are talking over the end of the previous song (Spotify is ducked, not paused)
  const live = useRef({ show: null as Show | null, index: 0, speaking: false, paused: false, startedAt: 0, voice: true, talked: -1, overlapping: false });
  const poll = useRef<(() => void) | null>(null); // stops the heartbeat that drives the show
  const talking = useRef<Talking | null>(null);
  // intros are voiced ahead of time (while the previous song plays), so the host never makes you wait
  const clips = useRef(new Map<number, Promise<string | null>>());

  const prepare = useCallback((i: number) => {
    const s = live.current.show;
    if (!s || i >= s.slots.length || clips.current.has(i) || !s.slots[i].talk.length) return;
    clips.current.set(
      i,
      synthesize(s.slots[i].talk, castOf(s.station)).catch((e) => {
        // say why it sounds robotic, instead of failing silently
        setStatus({ kind: 'err', msg: `${e instanceof Error ? e.message : e} Using the phone's voice for now.` });
        return null;
      }),
    );
  }, []);

  const shush = () => {
    talking.current?.stop();
    talking.current = null;
  };

  const stopEngine = useCallback(() => {
    preview.current?.stop();
    poll.current?.();
    poll.current = null;
    goOffAir();
    talking.current?.stop();
    talking.current = null;
    clearClips();
  }, []);
  useEffect(() => stopEngine, [stopEngine]);

  const fail = (e: unknown) => setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });

  /** Host talks (if voice is on), then the song starts. */
  const playSlot = useCallback((i: number, overlap = false) => {
    const s = live.current.show;
    if (!s) return;
    if (i >= s.slots.length) {
      stopEngine();
      setPhase('done');
      return;
    }
    live.current.index = i;
    setIndex(i);
    setProgress(0);
    updateOnAir(s.slots[i].track.name, `${s.station.name} · ${s.slots[i].track.artist}`);
    const start = () => {
      live.current.speaking = false;
      live.current.overlapping = false;
      setSpeaking(false);
      if (live.current.paused || live.current.index !== i) return;
      live.current.startedAt = Date.now();
      live.current.talked = i;
      rememberPlayed(db, s.slots[i].track).catch(() => {});
      // voice the next two talks now, so ⏭ (even twice) never waits on a fresh recording
      prepare(i + 1);
      prepare(i + 2);
      startSong(i);
    };
    const talk = s.slots[i].talk;
    if (!live.current.voice || !talk.length || live.current.talked === i) return start();
    live.current.speaking = true;
    live.current.overlapping = overlap;
    setSpeaking(true);
    prepare(i);
    (async () => {
      // the hosts only talk over a song when the show planned it (a fading outro); otherwise
      // whatever Spotify is playing (e.g. after ⏭ mid-song) stops first
      if (!overlap) await withTimeout(pausePlayback(), 3000);
      // a talk that isn't recorded yet gets 15 s (with a spinner); after that the phone's own voice reads it,
      // so the show never stalls
      const clip = clips.current.get(i) ?? Promise.resolve(null);
      let uri = await withTimeout(clip, 300);
      if (uri === undefined) {
        setStatus({ kind: 'busy' });
        uri = await withTimeout(clip, 15000);
        setStatus({ kind: 'idle' });
      }
      if (live.current.index !== i || !live.current.speaking) return; // skipped or paused while it was loading
      const t = uri ? playClip(uri, overlap) : speakRobot(talk.map((l) => l.text).join(' '), s.lang);
      talking.current = t;
      if (await t.done) start();
    })();
  }, [stopEngine, prepare]);

  /**
   * Starts slot i's song on Spotify and checks it really plays. Spotify on the phone sometimes
   * ignores the first command (asleep, or another device was active): one retry, then a clear message.
   */
  const startSong = useCallback(async (i: number) => {
    const s = live.current.show;
    if (!s) return;
    const uri = s.slots[i].track.uri;
    // the rest of the show goes to Spotify as one queue: if Lifelog is in the background and
    // can't step in between songs, Spotify still plays OUR next song, not the album or autoplay
    const rest = s.slots.slice(i).map((x) => x.track.uri);
    // on mobile data Spotify can take a while to buffer: look a few times over ~10 s
    const playing = async () => {
      for (let k = 0; k < 5; k++) {
        await waitMs(2000); // works in the background too
        if (live.current.index !== i) return true;
        const p = await playbackState().catch(() => null);
        if (p?.isPlaying && sameTrack(p.track, s.slots[i].track)) return true;
      }
      return false;
    };
    try {
      await playTracks(rest);
      if (await playing()) return setStatus({ kind: 'idle' });
      await nudgeSpotify(); // second try: move playback to the phone first
      await playTracks(rest);
      if (await playing()) return setStatus({ kind: 'idle' });
      throw new Error(`Spotify didn't start the song. ${await spotifyReport()}`);
    } catch (e) {
      if (live.current.index !== i) return;
      live.current.paused = true;
      live.current.startedAt = 0; // ▶ will start this song again
      setPaused(true);
      setOnAirPlaying(false);
      fail(e);
      // you're probably in Spotify or the phone is in your pocket: say it where you'll see it
      if (AppState.currentState !== 'active') {
        Notifications.scheduleNotificationAsync({
          content: { title: 'Lifelog Radio paused', body: e instanceof Error ? e.message : String(e), data: { kind: 'radio' } },
          trigger: null,
        }).catch(() => {});
      }
    }
  }, []);

  /** Watches Spotify: when the song is about to end, the next one gets its intro. */
  const ticking = useRef(false);
  const timing = useRef({ checkedAt: 0, endsAt: 0 }); // go easy on Spotify's API: look often only near the end
  const tick = useCallback(async () => {
    const l = live.current;
    if (ticking.current || !l.show || l.paused || Date.now() - l.startedAt < 4000) return;
    if (l.speaking && !l.overlapping) return;
    const now = Date.now();
    // look every few seconds, and every beat in the last ~20 s (talk-overs start up to 12 s before the end)
    if (now - timing.current.checkedAt < 4000 && now < timing.current.endsAt - 20000) return;
    ticking.current = true;
    try {
      await follow(l);
    } finally {
      ticking.current = false;
    }
  }, []);

  /** One look at Spotify: catch up if it moved on, and step in before the song ends. */
  const follow = async (l: typeof live.current) => {
    if (!l.show) return;
    const p = await playbackState().catch(() => null);
    if (l.overlapping) {
      // talking over the outro: when the old song runs out before the talk does, stop Spotify there
      // (it would roll on into its own autoplay); the next song starts when the talk ends
      const prev = l.show.slots[l.index - 1]?.track;
      const ending = p?.track && prev && sameTrack(p.track, prev) && p.track.durationMs - p.progressMs < END_MARGIN_MS;
      const wandered = p?.track && prev && !sameTrack(p.track, prev) && p.isPlaying;
      if (ending || wandered) await pausePlayback().catch(() => {});
      return;
    }
    const slot = l.show.slots[l.index];
    timing.current = { checkedAt: Date.now(), endsAt: p?.track ? Date.now() + p.track.durationMs - p.progressMs : 0 };
    if (!p?.track) return;
    if (!sameTrack(p.track, slot.track)) {
      // Spotify moved on through the queue while we weren't looking (app in the background):
      // catch up quietly to the song it's playing, and keep the talk for the next one
      const j = l.show.slots.findIndex((x, k) => k > l.index && sameTrack(p.track, x.track));
      if (j > 0) {
        l.index = j;
        l.talked = j;
        l.startedAt = Date.now();
        setIndex(j);
        prepare(j + 1);
      }
      return;
    }
    setProgress(p.progressMs / Math.max(1, p.track.durationMs));
    const remaining = p.track.durationMs - p.progressMs;
    const next = l.show.slots[l.index + 1];
    const talkOver = l.voice && next && next.overlap > 0 && next.talk.length ? next.overlap * 1000 : 0;
    if (talkOver && remaining <= talkOver && remaining > END_MARGIN_MS) {
      playSlot(l.index + 1, true); // a DJ moment: talk over the fading end, Spotify ducks under the voice
      return;
    }
    if (remaining < END_MARGIN_MS) {
      const next = l.index + 1;
      if (next < l.show.slots.length) await pausePlayback().catch(() => {});
      playSlot(next);
    }
  };

  const start = async () => {
    setPhase('building');
    setStatus({ kind: 'idle' });
    try {
      preview.current?.stop();
      const s = await buildShow(db, station, wish);
      live.current = { show: s, index: 0, speaking: false, paused: false, startedAt: 0, voice, talked: -1, overlapping: false };
      clips.current = new Map();
      if (voice) {
        prepare(0);
        await clips.current.get(0); // the opening line is ready before we go on air
      }
      setShow(s);
      setPaused(false);
      setPhase('onair');
      await goOnAir(s.title, `${s.station.name} ${s.station.freq}`);
      // make sure Spotify is awake on the phone now, while Lifelog is on screen and allowed to open it
      // the direct line to the Spotify app wakes it by itself; the old way opens Spotify on screen
      if (!(await remoteReady())) await wakeSpotify(s.slots[0].track.uri).catch(() => null);
      poll.current = onBeat(tick); // ~every second, even while you're in Spotify
      playSlot(0);
    } catch (e) {
      setPhase('pick');
      fail(e);
    }
  };

  const togglePause = async () => {
    const l = live.current;
    if (!l.paused) {
      l.paused = true;
      setPaused(true);
      setOnAirPlaying(false);
      if (l.speaking) {
        if (l.overlapping) pausePlayback().catch(() => {}); // the old song's outro was still playing under the talk
        shush();
        l.overlapping = false;
        l.speaking = false;
        setSpeaking(false);
      } else await pausePlayback().catch(fail);
      return;
    }
    l.paused = false;
    setPaused(false);
    setOnAirPlaying(true);
    // paused during the talk: start the song; paused during the song: carry on
    const now = (await playbackState().catch(() => null))?.track;
    if (l.startedAt === 0 || !l.show || !sameTrack(now, l.show.slots[l.index].track)) {
      playSlot(l.index);
    } else await resumePlayback().catch(fail);
  };

  /** Jumps to song i of the show. `withTalk` false: straight to the music, no host intro. */
  const jumpTo = (i: number, withTalk = true) => {
    const s = live.current.show;
    if (!s || i < 0 || i >= s.slots.length) return;
    shush();
    live.current.speaking = false;
    live.current.paused = false;
    if (!withTalk) live.current.talked = i;
    setPaused(false);
    setOnAirPlaying(true);
    playSlot(i);
  };

  const skip = () => jumpTo(live.current.index + 1);

  /** Like a music app: a few seconds in, ⏮ restarts the song; at the start, it goes back one. */
  const previous = () => {
    const i = live.current.index;
    const intoSong = live.current.startedAt > 0 && Date.now() - live.current.startedAt > 5000;
    jumpTo(intoSong || i === 0 ? i : i - 1, false);
  };

  // the lock screen / notification buttons drive the show too
  const controls = useRef({ togglePause, skip });
  controls.current = { togglePause, skip };
  useEffect(
    () =>
      onRemote({
        pause: () => !live.current.paused && controls.current.togglePause(),
        play: () => live.current.paused && controls.current.togglePause(),
        next: () => live.current.show && controls.current.skip(),
      }),
    [],
  );

  const toggleVoice = () => {
    live.current.voice = !voice;
    setVoice(!voice);
    if (voice && live.current.speaking) {
      // turning it off mid-sentence: let the song start
      shush();
      live.current.speaking = false;
      setSpeaking(false);
      playSlot(live.current.index);
    }
  };

  const save = async () => {
    if (!show) return;
    setStatus({ kind: 'busy' });
    try {
      await savePlaylist(show.title, `${show.station.name} ${show.station.freq}, made for you in Lifelog Radio`, show.slots.map((s) => s.track.uri));
      setStatus({ kind: 'ok', msg: `Saved "${show.title}" to your Spotify playlists.` });
    } catch (e) {
      fail(e);
    }
  };

  /** The down arrow: the show keeps playing, the screen just gets out of the way. */
  const close = () => router.back();

  /** Ends the show for good. */
  const stop = () => {
    stopEngine();
    live.current = { ...live.current, show: null, speaking: false, paused: false };
    setShow(null);
    setPaused(false);
    setPhase('pick');
  };

  const current = show?.slots[index];
  const cover = phase === 'onair' || phase === 'done' ? (current?.track.image ?? null) : null;
  useEffect(() => {
    let alive = true;
    albumColors(cover).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [cover]);


  // hearted songs: they may come back in later shows; the rest never repeat
  const [hearts, setHearts] = useState<Set<string>>(new Set());
  useEffect(() => {
    likedSongs(db).then((l) => setHearts(new Set(l.map((s) => s.id)))).catch(() => {});
  }, [db]);
  const toggleHeart = async (t: Track) => {
    const on = await toggleLiked(db, t);
    setHearts((h) => {
      const next = new Set(h);
      if (on) next.add(t.id);
      else next.delete(t.id);
      return next;
    });
  };

  return { hearts, toggleHeart, jumpTo, previous, phase, setPhase, stationKey, setStationKey, trying, station, chooseLang, chooseVoice, wish, setWish, voice, show, index, speaking, paused, status, progress, palette, start, togglePause, skip, toggleVoice, save, close, stop, current };
}

export type RadioEngine = ReturnType<typeof useRadioEngine>;
const Ctx = createContext<RadioEngine | null>(null);

export function RadioProvider({ children }: { children: ReactNode }) {
  const engine = useRadioEngine();
  return <Ctx.Provider value={engine}>{children}</Ctx.Provider>;
}

export function useRadio(): RadioEngine {
  const r = useContext(Ctx);
  if (!r) throw new Error('RadioProvider is missing');
  return r;
}
