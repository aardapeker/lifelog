import { voiceVolume } from './songText';
import * as Notifications from 'expo-notifications';
import { breadcrumb } from './crashLog';
import { notify } from './notify';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Status } from '../components/ui';
import { albumColors, type Palette } from './albumColors';
import { getSetting, setSetting } from './db';
import { bedIn, bedOut, prepareStationSounds, stopStationSounds } from './stationSounds';
import { goOffAir, goOnAir, onBeat, onRemote, setOnAirLiked, setOnAirPlaying, updateOnAir, waitMs } from './onAir';
import { buildShow, castOf, requestTalks, speakIn, type Show } from './radio';
import { countShow } from './achievements';
import {
  nudgeSpotify,
  pausePlayback,
  playbackState,
  playTracks,
  remoteReady,
  resumePlayback,
  sameTrack,
  savePlaylist,
  isPlayable,
  seekTo,
  spotifyReport,
  wakeSpotify,
  type Track,
} from './spotify';
import { stationByKey, withVoices, type Lang, type Persona, type VoiceChoices } from './stations';
import { banSong, bannedSongs, getRadioPrefs, likedSongs, rememberPlayed, toggleLiked } from './songMemory';
import { onRadioCommand, publishToWidget } from '../widget/radioBridge';
import { clearClips, keepSample, playable, playClip, preferVoiceModel, pruneShowVoices, sampleFile, showVoiceFile, skipTalk, synthesize, type Talking } from './tts';

const HISTORY_KEY = 'radio.history';
const DAY_MS = 24 * 60 * 60 * 1000;
const VOICED_SHOWS = 3; // the newest shows keep their voices (~20 MB each), so playing them again is free
/** How many shows Recent shows keeps at most, for how many days it keeps them (Settings → Music). */
const keepMax = (days: number) => (days <= 1 ? 12 : days <= 3 ? 24 : days <= 7 ? 40 : 60);

/** A show you heard lately: its whole script is kept, so it can be resumed or replayed without writing it again. */
export type PastShow = { id: string; show: Show; index: number; savedAt: number; done: boolean; kept?: boolean };

/**
 * What Recent shows keeps: shows you saved (🔖) always, with their voices; the others for the days
 * picked in Settings, at most `keepMax` of them. Returns the list and whose voices to keep.
 */
export function trimHistory(all: PastShow[], days: number): { list: PastShow[]; voiced: string[] } {
  let others = 0;
  const list = all.filter((h) => h.kept || (Date.now() - h.savedAt < days * DAY_MS && ++others <= keepMax(days)));
  const recent = list.filter((h) => !h.kept).slice(0, VOICED_SHOWS);
  return { list, voiced: list.filter((h) => h.kept || recent.includes(h)).map((h) => h.id) };
}

/*
 * The radio's engine lives here, mounted once at the root of the app, so a show keeps running
 * (and keeps its songs and talks) when you close the Radio screen. The screen only shows it.
 */

/** Resolves with the promise's value, or undefined after `ms` (even in the background). Never throws. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), waitMs(ms).then(() => undefined)]);
}

const END_MARGIN_MS = 2500; // the latest a talk-over may start, and the heartbeat's fallback stop
// the song is stopped this close to its real end, on a timer (not the ~1 s heartbeat), so the last note
// isn't cut but Spotify doesn't roll on into its own autoplay; covers Spotify's progress lag
const STOP_BEFORE_END_MS = 700;
const BED_DELAY_MS = 2000; // the music bed starts this long after the host does

type Phase = 'pick' | 'building' | 'review' | 'onair' | 'done';

function useRadioEngine() {
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<Phase>('pick');
  // what making the show is busy with: the steps so far, the last one still running
  const [steps, setSteps] = useState<{ key: string; detail?: string }[]>([]);
  const step = useCallback((key: string, detail?: string) => {
    breadcrumb(`radio: ${key}${detail ? ` (${detail})` : ''}`); // where it was, if Android crashes the app
    setSteps((all) => (all.at(-1)?.key === key ? [...all.slice(0, -1), { key, detail }] : [...all, { key, detail }]));
  }, []);
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
  // each tap gets a number: a sample that finishes making after a newer tap is thrown away, so two never overlap
  const previewTurn = useRef(0);
  const chooseVoice = async (role: 'host' | 'sidekick', p: Persona, voice: string) => {
    remember({ [role]: voice });
    const turn = ++previewTurn.current;
    preview.current?.stop();
    preview.current = null;
    setTrying(voice);
    try {
      // each sample is made once and kept: hearing it again costs nothing from the daily voice quota
      const saved = sampleFile(stationKey, p.name, voice, station.lang);
      let uri = playable(saved) ? saved.uri : null;
      if (!uri) {
        const made = await synthesize(
          [
            {
              speaker: p.name,
              text:
                station.lang === 'tr'
                  ? `Merhaba! Ben ${p.name}, ${station.name} ${station.freq} dinliyorsunuz.`
                  : `Hey! I'm ${p.name}, and you're listening to ${station.name} ${station.freq}.`,
            },
          ],
          [{ name: p.name, voice, style: p.style + speakIn(station.lang === 'tr' ? 'tr' : 'en') }],
        );
        uri = keepSample(made, saved);
      }
      if (turn !== previewTurn.current) return; // you already tapped another voice
      preview.current = playClip(uri);
      await preview.current.done;
    } catch (e) {
      if (turn === previewTurn.current) fail(e);
    } finally {
      setTrying((t) => (t === voice ? null : t));
    }
  };
  // each station keeps its own wish ("guitar solos" on Gebze Rock didn't belong on Arabesk FM)
  const [wishes, setWishes] = useState<Record<string, string>>({});
  const wish = wishes[stationKey] ?? '';
  const setWish = (w: string) => setWishes((all) => ({ ...all, [stationKey]: w }));
  const [length, setLength] = useState(8); // songs per show
  const [miniCollapsed, setMiniCollapsed] = useState(false); // the docked player, folded into a bubble
  const [voice, setVoice] = useState(true);
  const [show, setShow] = useState<Show | null>(null);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [progress, setProgress] = useState(0); // of the current song, 0..1
  const [palette, setPalette] = useState<Palette | null>(null); // the album cover's colours
  // every show is kept on the phone for a day (Recent shows): closed by accident, stopped or finished,
  // you can pick it up where it was or hear it again
  const [history, setHistory] = useState<PastShow[]>([]);
  const historyRef = useRef<PastShow[]>([]);
  const liveId = useRef<string | null>(null); // which Recent shows entry is on air
  const keepDays = useRef(1);
  const writeHistory = useCallback(
    (next: PastShow[]) => {
      const { list, voiced } = trimHistory(next, keepDays.current);
      historyRef.current = list;
      setHistory(list);
      setSetting(db, HISTORY_KEY, JSON.stringify(list)).catch(() => {});
      pruneShowVoices(voiced);
    },
    [db],
  );
  /** Reads Recent shows (and how long to keep them); the Radio screen calls it when it opens. */
  const loadHistory = useCallback(async () => {
    try {
      keepDays.current = (await getRadioPrefs(db)).keepDays;
      const all = JSON.parse(await getSetting(db, HISTORY_KEY, '[]')) as PastShow[];
      if (liveId.current && historyRef.current.length) return; // a show is on air: the list in memory is newer
      // saved shows keep a copy of their station: give them its current name (Gebze Rock lost its "104")
      for (const h of all) {
        const now = stationByKey(h.show.station.key);
        if (now.key === h.show.station.key) h.show.station = { ...h.show.station, name: now.name };
      }
      const { list } = trimHistory(all, keepDays.current);
      historyRef.current = list;
      setHistory(list);
    } catch {}
  }, [db]);
  useEffect(() => {
    // a moment after the start (it's a big JSON list): the Radio tab is rarely the first thing opened
    const t = setTimeout(() => {
      loadHistory();
      setSetting(db, 'radio.live', '').catch(() => {}); // the old single "resume" slot
    }, 2000);
    return () => clearTimeout(t);
  }, [db, loadHistory]);
  /** Updates the entry on air (and lifts it to the top). */
  const record = useCallback(
    (patch: Partial<PastShow>) => {
      const id = liveId.current;
      const h = historyRef.current.find((x) => x.id === id);
      if (!h) return;
      writeHistory([{ ...h, ...patch, savedAt: Date.now() }, ...historyRef.current.filter((x) => x.id !== id)]);
    },
    [writeHistory],
  );
  useEffect(() => {
    if (phase === 'onair' && show) record({ index });
  }, [phase, show, index, record]);
  const forgetShow = (id: string) => writeHistory(historyRef.current.filter((h) => h.id !== id));
  /** 🔖 Saves a show for good, with its voices (or lets it go back to the normal Recent shows rules). */
  const keepShow = (id: string, kept: boolean) =>
    writeHistory(historyRef.current.map((h) => (h.id === id ? { ...h, kept } : h)));
  const [liveKey, setLiveKey] = useState<string | null>(null); // liveId, for the screen
  const liveKept = !!history.find((h) => h.id === liveKey)?.kept;
  const keepLive = () => liveKey && keepShow(liveKey, !liveKept);

  // the engine runs on refs: timers and speech callbacks must see the latest values
  // talked: the last slot whose talk already played (so resuming starts just the song)
  // overlapping: the hosts are talking over the end of the previous song (Spotify is ducked, not paused)
  const live = useRef({ show: null as Show | null, index: 0, speaking: false, paused: false, startedAt: 0, voice: true, talked: -1, overlapping: false });
  const bannedRef = useRef<Set<string>>(new Set()); // songs never to play (read inside the timers)
  const poll = useRef<(() => void) | null>(null); // stops the heartbeat that drives the show
  const talking = useRef<Talking | null>(null);
  // intros are voiced ahead of time (while the previous song plays), so the host never makes you wait
  const clips = useRef(new Map<number, Promise<string | null>>());
  const retried = useRef(new Set<number>()); // talks that failed at least once (no second "not ready" message)
  const failedAt = useRef(new Map<number, number>()); // when a talk's voice last failed: asked again after a pause

  const prepare = useCallback((i: number) => {
    const s = live.current.show;
    if (!s || i > s.slots.length || clips.current.has(i)) return;
    // index slots.length is the goodbye after the last song
    const lines = i === s.slots.length ? s.outro : s.slots[i].talk;
    if (!lines.length) return;
    // the newest shows keep their voices: a talk already made is played from the phone, for free
    const id = liveId.current;
    const saved = id ? showVoiceFile(id, i) : null;
    if (saved && playable(saved)) {
      clips.current.set(i, Promise.resolve(saved.uri));
      return;
    }
    clips.current.set(
      i,
      synthesize(lines, castOf(s.station, s.lang, s.guest, s.regular))
        .then((uri) => (saved && liveId.current === id ? keepSample(uri, saved) : uri))
        .catch((e) => {
        // say why the hosts went quiet, instead of failing silently (no robot voice: the talk is skipped)
        const why = e instanceof Error ? e.message : String(e);
        // once per talk: the quiet retries every 20 s shouldn't flash a new warning each time
        if (!retried.current.has(i)) setStatus({ kind: 'err', msg: /music goes on/.test(why) ? why : `⚠️ Couldn't voice this talk yet (${why}). Trying again in a moment.` });
        // forget the failure, every time: the heartbeat asks again a little later (a slow patch of
        // internet or a speed limit is usually over by then). It used to give up after one retry,
        // so after a bad minute on the servis the rest of the show went without voices
        retried.current.add(i);
        clips.current.delete(i);
        failedAt.current.set(i, Date.now());
        return null;
      }),
    );
  }, []);

  /**
   * The music bed (and the weather) comes in 2 s after the host starts talking, like a DJ bringing the
   * music up under the voice; not at all if the talk is already over, skipped or paused by then.
   */
  const talkOver = useRef(new WeakSet<Talking>()).current;
  const bedUnder = (t: Talking, station: string) => {
    waitMs(BED_DELAY_MS).then(() => {
      if (talking.current === t && !talkOver.has(t) && live.current.speaking) bedIn(station);
    });
  };

  const shush = () => {
    talking.current?.stop();
    talking.current = null;
    stopStationSounds();
  };

  const stopEngine = useCallback(() => {
    preview.current?.stop();
    poll.current?.();
    poll.current = null;
    goOffAir();
    talking.current?.stop();
    talking.current = null;
    stopStationSounds();
    clearClips();
  }, []);
  useEffect(() => stopEngine, [stopEngine]);

  const fail = (e: unknown) => setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });

  /** Host talks (if voice is on), then the song starts. */
  const playSlot = useCallback((i: number, overlap = false) => {
    const s = live.current.show;
    if (!s) return;
    // banned during the show: hop over it (and over the talk that leads into it)
    while (i < s.slots.length && bannedRef.current.has(s.slots[i].track.id)) i++;
    if (i >= s.slots.length) {
      // the end: the hosts say goodbye (if they have something to say and the voice is on), then off air
      const finish = () => {
        stopEngine();
        setPhase('done');
      };
      if (!live.current.voice || !s.outro.length || live.current.talked === s.slots.length) return finish();
      live.current.index = s.slots.length;
      setIndex(s.slots.length); // the screen shows the goodbye's talk, not the last song's
      record({ done: true }); // the music is over: closed during the goodbye, it's still a finished show
      live.current.speaking = true;
      setSpeaking(true);
      prepare(s.slots.length);
      (async () => {
        await withTimeout(pausePlayback(), 3000);
        const uri = await withTimeout(clips.current.get(s.slots.length) ?? Promise.resolve(null), 15000);
        if (!live.current.speaking) return;
        const t = uri ? playClip(uri, false, voiceVolume(s.slots.at(-1)?.facts?.gain)) : skipTalk();
        talking.current = t;
        if (uri) bedUnder(t, s.station.key); // the goodbye over the station's music bed
        await t.done;
        talkOver.add(t);
        await bedOut();
        live.current.speaking = false;
        setSpeaking(false);
        finish();
      })();
      return;
    }
    live.current.index = i;
    setIndex(i);
    setProgress(0);
    updateOnAir(s.slots[i].track.name, `${s.slots[i].track.artist} · ${s.station.name}`, s.slots[i].track.image);
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
    if (s.slots[i].intro) {
      // a DJ moment at the START: the song begins right away and the hosts talk over its intro, Spotify ducked
      prepare(i);
      (async () => {
        const uri = await withTimeout(clips.current.get(i) ?? Promise.resolve(null), 300);
        start();
        if (!uri) return; // not voiced in time: the song just plays, nobody waits at the start of a song
        // the voice waits until Spotify really plays: if it went first, Spotify starting would take the
        // audio back and the music wouldn't be turned down under the voice
        for (let k = 0; ; k++) {
          await waitMs(500);
          if (live.current.index !== i || live.current.paused || k >= 12) return;
          const p = await playbackState().catch(() => null);
          if (p?.isPlaying && sameTrack(p.track, s.slots[i].track)) break;
        }
        setSpeaking(true);
        const t = playClip(uri, true, voiceVolume(s.slots[i].facts?.gain));
        talking.current = t;
        await t.done;
        if (talking.current === t) talking.current = null;
        setSpeaking(false);
      })();
      return;
    }
    live.current.speaking = true;
    live.current.overlapping = overlap;
    setSpeaking(true);
    prepare(i);
    (async () => {
      // the hosts only talk over a song when the show planned it (a fading outro); otherwise
      // whatever Spotify is playing (e.g. after ⏭ mid-song) stops first
      if (!overlap) await withTimeout(pausePlayback(), 3000);
      // a talk that isn't recorded yet gets 15 s (with a spinner); after that it's skipped and the song starts,
      // so the show never stalls
      const clip = clips.current.get(i) ?? Promise.resolve(null);
      let uri = await withTimeout(clip, 300);
      if (uri === undefined) {
        setStatus({ kind: 'busy' });
        uri = await withTimeout(clip, 15000);
        setStatus({ kind: 'idle' });
      }
      if (live.current.index !== i || !live.current.speaking) return; // skipped or paused while it was loading
      if (!uri && !retried.current.has(i)) setStatus({ kind: 'err', msg: "⏳ This talk wasn't ready in time, so the hosts skip it. The music goes on." });
      // as loud as the song it leads into: after a loud record the voice isn't small, before a quiet one it isn't huge
      // in the silence between songs (never over one): the station's music bed under the hosts. A talk
      // over a song's ending has the song as its bed
      const t = uri ? playClip(uri, overlap, voiceVolume(s.slots[i].facts?.gain)) : skipTalk();
      talking.current = t;
      if (uri && !overlap) bedUnder(t, s.station.key);
      const finished = await t.done;
      talkOver.add(t);
      await bedOut(); // gone before the next song starts: the two never play together
      if (finished) start();
    })();
  }, [stopEngine, prepare, record]);

  /**
   * Starts slot i's song on Spotify and checks it really plays. Spotify on the phone sometimes
   * ignores the first command (asleep, or another device was active): one retry, then a clear message.
   */
  const endTimer = useRef<{ at: number; timer: ReturnType<typeof setTimeout> } | null>(null); // the precise stop at a song's end
  const ended = useRef(-1); // the last song whose end was handled
  const skipTo = useRef<((i: number) => void) | null>(null);
  const timing = useRef({ checkedAt: 0, endsAt: 0 }); // go easy on Spotify's API: look often only near the end
  const startSong = useCallback(async (i: number) => {
    const s = live.current.show;
    if (!s) return;
    ended.current = -1; // this song (even replayed with ⏮) gets its own end
    if (endTimer.current) clearTimeout(endTimer.current.timer);
    endTimer.current = null;
    const uri = s.slots[i].track.uri;
    // the rest of the show goes to Spotify as one queue: if Lifelog is in the background and
    // can't step in between songs, Spotify still plays OUR next song, not the album or autoplay
    const rest = s.slots.slice(i).map((x) => x.track.uri);
    // on mobile data Spotify can take a while to buffer: while it holds OUR song, keep looking (~10 s).
    // But when it isn't even on our song after ~3 s, it ignored the command (asleep, the phone's screen
    // off): don't sit out the full 10 s in silence, wake it and ask again right away.
    const playing = async () => {
      for (let k = 0; k < 6; k++) {
        await waitMs(k ? 2000 : 1500); // works in the background too
        if (live.current.index !== i) return true;
        const p = await playbackState().catch(() => null);
        const ours = !!p?.track && sameTrack(p.track, s.slots[i].track);
        if (ours && p?.isPlaying) return true;
        if (!ours && k >= 1) return false;
      }
      return false;
    };
    timing.current = { checkedAt: 0, endsAt: 0 }; // the last song's end is no clock for this one: look at once
    try {
      await playTracks(rest);
      if (await playing()) return setStatus({ kind: 'idle' });
      await nudgeSpotify(); // second try: move playback to the phone first
      await playTracks(rest);
      if (await playing()) return setStatus({ kind: 'idle' });
      throw new Error(`Spotify didn't start the song. ${await spotifyReport()}`);
    } catch (e) {
      if (live.current.index !== i) return;
      // Spotify works, it just won't play THIS song here (not available in your country): skip it, the show goes on
      if (i + 1 < s.slots.length && (await isPlayable(s.slots[i].track.id)) === false) {
        setStatus({ kind: 'err', msg: `"${s.slots[i].track.name}" can't be played on Spotify in your country, so it's skipped.` });
        return skipTo.current?.(i + 1);
      }
      live.current.paused = true;
      live.current.startedAt = 0; // ▶ will start this song again
      setPaused(true);
      setOnAirPlaying(false);
      fail(e);
      // you're probably in Spotify or the phone is in your pocket: say it where you'll see it
      if (AppState.currentState !== 'active') {
        notify({ title: 'Lifelog Radio paused', body: e instanceof Error ? e.message : String(e), data: { kind: 'radio' } }).catch(() => {});
      }
    }
  }, []);

  /** Watches Spotify: when the song is about to end, the next one gets its intro. */
  const ticking = useRef(false);
  const shownAt = useRef(0); // when the progress bar last moved on its own
  /** The progress bar: jump to a spot in the song (not while the hosts talk, the song isn't on yet). */
  const seek = useCallback(async (frac: number) => {
    const l = live.current;
    const dur = l.show?.slots[l.index]?.track.durationMs;
    if (!dur || l.speaking) return;
    const ms = Math.round(Math.max(0, Math.min(0.97, frac)) * dur); // not past the end: that's what ⏭ is for
    setProgress(ms / dur);
    timing.current = { checkedAt: Date.now(), endsAt: Date.now() + dur - ms }; // the next talk follows the new end
    if (endTimer.current) clearTimeout(endTimer.current.timer);
    endTimer.current = null;
    await seekTo(ms).catch((e) => setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) }));
  }, []);
  const tick = useCallback(async () => {
    const l = live.current;
    keepVoicesComing(l);
    if (ticking.current || !l.show || l.paused || Date.now() - l.startedAt < 4000) return;
    if (l.speaking && !l.overlapping) return;
    const now = Date.now();
    // between looks, the progress bar counts on by itself (every 2 s), from the song's end Spotify reported
    const dur = l.show.slots[l.index]?.track.durationMs;
    if (!l.overlapping && dur && timing.current.endsAt && now - shownAt.current >= 2000) {
      shownAt.current = now;
      setProgress(Math.max(0, Math.min(1, 1 - (timing.current.endsAt - now) / dur)));
    }
    // look every 10 s mid-song (each look is a network call: every 4 s kept the phone's radio awake and
    // warm for the whole show), and every beat in the last ~25 s (talk-overs start up to 12 s before the end)
    if (now - timing.current.checkedAt < 10_000 && now < timing.current.endsAt - 25_000) return;
    ticking.current = true;
    try {
      await follow(l);
    } finally {
      ticking.current = false;
    }
  }, []);

  /**
   * The next two talks (and the goodbye near the end) keep getting voiced: one that failed (slow
   * internet, a speed limit) is asked for again 20 s later, so the hosts come back with the signal.
   */
  const keepVoicesComing = (l: typeof live.current) => {
    if (!l.show || !l.voice || l.paused) return;
    for (const j of [l.index + 1, l.index + 2]) {
      if (j > l.show.slots.length || clips.current.has(j)) continue;
      if (Date.now() - (failedAt.current.get(j) ?? 0) < 20_000) continue;
      prepare(j);
    }
  };

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
    // near the end: one timer stops the song just before its last moment (the heartbeat would be up to
    // a second late, so it used to stop 2.5–3.5 s early and cut the final notes)
    if (remaining < 6000 && remaining > STOP_BEFORE_END_MS && endTimer.current?.at !== l.index) {
      const at = l.index;
      if (endTimer.current) clearTimeout(endTimer.current.timer);
      endTimer.current = {
        at,
        timer: setTimeout(() => {
          const now = live.current;
          if (endTimer.current?.at !== at) return;
          endTimer.current = null; // paused or moved on meanwhile: the heartbeat sets a new one if needed
          if (now.index !== at || now.paused || now.speaking) return;
          endSong(at);
        }, remaining - STOP_BEFORE_END_MS),
      };
      return;
    }
    if (remaining <= STOP_BEFORE_END_MS) endSong(l.index); // the timer missed (app was asleep): stop now
  };

  /** A song is over: stop Spotify before it rolls on, then the next talk (or the goodbye). Once per song. */
  const endSong = (at: number) => {
    const l = live.current;
    if (ended.current === at || l.index !== at) return;
    ended.current = at;
    if (endTimer.current?.at === at) endTimer.current = null;
    pausePlayback()
      .catch(() => {})
      .finally(() => {
        if (live.current.index === at && !live.current.paused) playSlot(at + 1);
      });
  };

  // ── the playlist check between picking the songs and writing the talks ──
  const [draft, setDraft] = useState<Track[] | null>(null);
  const [reviewFirst, setReviewFirstState] = useState(true);
  useEffect(() => {
    getSetting(db, 'radio.review', '1').then((v) => setReviewFirstState(v === '1')).catch(() => {});
  }, [db]);
  const setReviewFirst = (on: boolean) => {
    setReviewFirstState(on);
    setSetting(db, 'radio.review', on ? '1' : '0').catch(() => {});
  };
  const decide = useRef<{ ok: (t: Track[]) => void; no: (e: Error) => void } | null>(null);
  const bench = useRef<Track[]>([]); // found spares, waiting to fill in for a song you remove
  const review = (tracks: Track[], spares: Track[]) =>
    new Promise<Track[]>((ok, no) => {
      decide.current = { ok, no };
      bench.current = spares;
      setDraft(tracks);
      setPhase('review');
    });
  const moveDraft = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      if (!d || i + by < 0 || i + by >= d.length) return d;
      const next = [...d];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  /** Removes song i; the next spare takes its place (until the spares run out, then the list just gets shorter). */
  const dropDraft = (i: number) => {
    const d = draft;
    if (!d || d.length <= 1) return;
    // taken from the bench here, not inside a state updater (React may run one twice)
    const spare = bench.current.find((b) => !d.some((x) => x.id === b.id));
    if (spare) bench.current = bench.current.filter((b) => b !== spare);
    setDraft(spare ? d.map((x, k) => (k === i ? spare : x)) : d.filter((_, k) => k !== i));
  };
  /** ＋ Add a song: your own pick on the list. The hosts treat it like any other song (only live requests get a dedication). */
  /** Drag and drop in Tonight's playlist: the song at `from` goes to `to`. */
  const reorderDraft = (from: number, to: number) =>
    setDraft((d) => {
      if (!d || from === to || from < 0 || to < 0 || from >= d.length || to >= d.length) return d;
      const next = [...d];
      const [song] = next.splice(from, 1);
      next.splice(to, 0, song);
      return next;
    });
  const addDraft = (t: Track) => setDraft((d) => (d && !d.some((x) => x.id === t.id) ? [...d, { ...t, requested: true }] : d));
  const writeDraft = () => {
    if (!draft) return;
    breadcrumb(`radio: Write the show tapped (${draft.length} songs)`);
    setPhase('building');
    decide.current?.ok(draft);
    decide.current = null;
  };
  const cancelDraft = () => {
    decide.current?.no(new Error('cancelled'));
    decide.current = null;
    setDraft(null);
  };

  const start = async () => {
    setSteps([]);
    setPhase('building');
    setStatus({ kind: 'idle' });
    bannedSongs(db).then((b) => setBanned(new Set(b.map((x) => x.id)))).catch(() => {}); // Settings may have let some back
    getSetting(db, 'voiceModel', '').then(preferVoiceModel).catch(() => {}); // Settings → AI Models
    likedSongs(db).then((l) => setHearts(new Set(l.map((x) => x.id)))).catch(() => {}); // hearts changed in Settings
    prepareStationSounds(db, station.key).catch(() => {}); // jingles and music beds: on or off, and this show's bed
    try {
      preview.current?.stop();
      const s = await buildShow(db, station, wish, length, step, reviewFirst ? review : undefined);
      setDraft(null);
      countShow(db, station.key).catch(() => {}); // for the radio achievements
      liveId.current = String(Date.now());
      setLiveKey(liveId.current);
      writeHistory([{ id: liveId.current, show: s, index: 0, savedAt: Date.now(), done: false }, ...historyRef.current]);
      live.current = { show: s, index: 0, speaking: false, paused: false, startedAt: 0, voice, talked: -1, overlapping: false };
      clips.current = new Map();
      retried.current = new Set();
      failedAt.current = new Map();
      if (voice) {
        step('voice');
        prepare(0);
        await clips.current.get(0); // the opening line is ready before we go on air
      }
      breadcrumb('radio: showing the player');
      setShow(s);
      setPaused(false);
      setPhase('onair');
      breadcrumb('radio: on-air notification');
      await goOnAir(s.title, `${s.station.name} ${s.station.freq}`);
      // make sure Spotify is awake on the phone now, while Lifelog is on screen and allowed to open it
      // the direct line to the Spotify app wakes it by itself; the old way opens Spotify on screen
      breadcrumb('radio: waking Spotify');
      if (!(await remoteReady())) await wakeSpotify(s.slots[0].track.uri).catch(() => null);
      poll.current = onBeat(tick); // ~every second, even while you're in Spotify
      breadcrumb('radio: first song');
      playSlot(0);
    } catch (e) {
      setPhase('pick');
      setDraft(null);
      if (!(e instanceof Error && e.message === 'cancelled')) fail(e); // "Back" from the playlist isn't an error
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
      } else {
        shush(); // an intro talk may be playing over the song
        setSpeaking(false);
        await pausePlayback().catch(fail);
      }
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
    else if (live.current.talked === i) live.current.talked = i - 1; // the tape's mic marker: hear that talk again
    setPaused(false);
    setOnAirPlaying(true);
    playSlot(i);
  };

  skipTo.current = jumpTo; // for startSong (made once), which skips a song Spotify won't play
  const skip = () => jumpTo(live.current.index + 1);
  /** How far into the talk on the mic now (0…1), or null when nobody's talking: the booth's teleprompter asks. */
  const talkAt = () => talking.current?.at?.() ?? null;

  /**
   * 🎵 A live request: it plays right after the current song, with the hosts announcing it, and the talk
   * after it rewritten so it follows the request. Slots after it move one place, so their voices (made
   * ahead, and the saved ones) are made again when needed.
   */
  const [requesting, setRequesting] = useState(false);
  const requestSong = async (picked: Track) => {
    const s0 = live.current.show;
    if (!s0 || requesting) return;
    const t = { ...picked, requested: true };
    setRequesting(true);
    breadcrumb(`radio: request ${t.name}`);
    try {
      const at0 = live.current.index + 1;
      // no AI (no key, offline): the request still plays, just without a dedication
      const talks = await requestTalks(db, s0, at0, t).catch(() => ({ intro: [], next: null }));
      const s = live.current.show;
      if (!s) return;
      // the show may have moved on while the hosts wrote it: the request goes after whatever plays now
      const at = Math.min(live.current.index + 1, s.slots.length);
      const slots = [...s.slots];
      if (talks.next && slots[at] && slots[at].track.id === s0.slots[at0]?.track.id) {
        slots[at] = { ...slots[at], talk: talks.next, label: null, overlap: 0 };
      }
      slots.splice(at, 0, { track: t, talk: talks.intro, label: null, overlap: 0 });
      const next: Show = { ...s, slots };
      for (const k of [...clips.current.keys()]) if (k >= at) clips.current.delete(k);
      const id = liveId.current;
      if (id) {
        for (let k = at; k <= s.slots.length; k++) {
          try {
            const f = showVoiceFile(id, k);
            if (f.exists) f.delete();
          } catch {}
        }
      }
      retried.current = new Set([...retried.current].filter((k) => k < at));
      live.current.show = next;
      setShow(next);
      record({ show: next });
      prepare(at);
      prepare(at + 1);
      if (!hearts.has(t.id)) toggleHeart(t).catch(() => {}); // a request is a song you love: future shows learn it
      setStatus({ kind: 'ok', msg: `🎵 Your request plays next: ${t.name}` });
    } finally {
      setRequesting(false);
    }
  };

  /** Like a music app: a few seconds in, ⏮ restarts the song; at the start, it goes back one. */
  const previous = () => {
    const i = live.current.index;
    const intoSong = live.current.startedAt > 0 && Date.now() - live.current.startedAt > 5000;
    jumpTo(intoSong || i === 0 ? i : i - 1, false);
  };

  // the lock screen / notification buttons drive the show too
  const controls = useRef({ togglePause, skip, previous, toggleHeart: (_t: Track) => {} });
  controls.current = { togglePause, skip, previous, toggleHeart: (t: Track) => toggleHeart(t) };
  useEffect(
    () =>
      onRemote({
        pause: () => !live.current.paused && controls.current.togglePause(),
        play: () => live.current.paused && controls.current.togglePause(),
        next: () => live.current.show && controls.current.skip(),
        previous: () => live.current.show && controls.current.previous(),
        like: () => {
          const s = live.current.show;
          const t = s?.slots[Math.min(live.current.index, s.slots.length - 1)]?.track;
          if (t) controls.current.toggleHeart(t);
        },
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

  /**
   * Plays a show from Recent shows. The script is kept, so nothing is written again; only the talks
   * still ahead are voiced. `fromStart` false: picks up where it was, and if Spotify is still playing
   * our queue (the app was closed mid-show) it just catches up, without stopping the music.
   * `from`: start at that song, with its talk (a finished show's set list: tap a song to play from there).
   */
  // one start at a time: taps while it's still tuning in used to start the show again (and again)
  const startingPast = useRef(false);
  const playPast = async (id: string, fromStart: boolean, from?: number) => {
    if (startingPast.current) return;
    startingPast.current = true;
    try {
      await startPast(id, fromStart, from);
    } finally {
      startingPast.current = false;
    }
  };
  const startPast = async (id: string, fromStart: boolean, from?: number) => {
    const h = historyRef.current.find((x) => x.id === id);
    if (!h) return;
    const s = h.show;
    const again = fromStart || h.done || from !== undefined; // with the talk before the first song
    const at = from ?? (again ? 0 : h.index);
    setStationKey(s.station.key);
    setStatus({ kind: 'idle' });
    setSteps([{ key: 'tuning' }]); // the player shows "Tuning in" with dots right away
    setPhase('building');
    try {
      preview.current?.stop();
      liveId.current = id;
      setLiveKey(id);
      record({ index: at, done: false });
      live.current = { show: s, index: at, speaking: false, paused: false, startedAt: Date.now(), voice, talked: again ? at - 1 : at, overlapping: false };
      clips.current = new Map();
      retried.current = new Set();
      failedAt.current = new Map();
      if (again && voice) {
        step('voice');
        prepare(at);
        await clips.current.get(at); // its talk is ready before we go on air
      }
      setShow(s);
      setIndex(at);
      setPaused(false);
      setPhase('onair');
      await goOnAir(s.title, `${s.station.name} ${s.station.freq}`);
      if (!again) {
        const p = await playbackState().catch(() => null);
        const k = p?.track && p.isPlaying ? s.slots.findIndex((x, n) => n >= at && sameTrack(p.track!, x.track)) : -1;
        if (k >= 0) {
          // still playing one of ours: just listen in again
          live.current.index = k;
          live.current.talked = k;
          setIndex(k);
          updateOnAir(s.slots[k].track.name, `${s.slots[k].track.artist} · ${s.station.name}`, s.slots[k].track.image);
          prepare(k + 1);
          prepare(k + 2);
          poll.current = onBeat(tick);
          return;
        }
      }
      // Spotify stopped (or a replay): the song starts, with its talk unless we already heard it
      breadcrumb('radio: waking Spotify');
      if (!(await remoteReady())) await wakeSpotify(s.slots[at].track.uri).catch(() => null);
      poll.current = onBeat(tick);
      playSlot(at);
    } catch (e) {
      setPhase('pick');
      fail(e);
    }
  };

  /** The show that just ended (or stopped in a tunnel): again from the top, or from one of its songs. */
  const replay = (from?: number) => {
    if (liveKey) playPast(liveKey, true, from);
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
    liveId.current = null; // stays in Recent shows, at the song where you stopped
    live.current = { ...live.current, show: null, speaking: false, paused: false };
    setShow(null);
    setPaused(false);
    setPhase('pick');
  };

  const current = show?.slots[Math.min(index, show.slots.length - 1)]; // during the goodbye: the last song
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
  const [banned, setBanned] = useState<Set<string>>(new Set());
  useEffect(() => {
    bannedRef.current = banned;
  }, [banned]);
  useEffect(() => {
    bannedSongs(db).then((b) => setBanned(new Set(b.map((s) => s.id)))).catch(() => {});
  }, [db]);
  /** "Don't play this song": never again on the radio; if it's the one playing, move on now. */
  const ban = async (t: Track) => {
    await banSong(db, t);
    const next = new Set(bannedRef.current).add(t.id);
    bannedRef.current = next;
    setBanned(next);
    setHearts((h) => {
      const n = new Set(h);
      n.delete(t.id);
      return n;
    });
    const s = live.current.show;
    if (s && s.slots[live.current.index]?.track.id === t.id) controls.current.skip();
  };
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

  // the home screen widget: show what's on, and take its ⏮ ⏯ ⏭
  useEffect(() => {
    if (phase !== 'onair' || !show) return publishToWidget(null);
    const n = show.slots.length;
    const slot = show.slots[Math.min(index, n - 1)];
    const st = show.station;
    publishToWidget({
      song: slot.track.name,
      artist: slot.track.artist,
      station: `${st.emoji} ${st.name} ${st.freq}`,
      cover: slot.track.image,
      paused,
      talking: speaking ? `${st.sidekick ? `${st.host.name} & ${st.sidekick.name}` : st.host.name} on the mic` : null,
      position: `${Math.min(index + 1, n)}/${n}`,
      liked: hearts.has(slot.track.id),
    });
    setOnAirLiked(hearts.has(slot.track.id)); // the lock screen's ♡ too
  }, [phase, show, index, paused, speaking, hearts]);
  useEffect(
    () =>
      onRadioCommand((c) => {
        if (!live.current.show) return;
        if (c === 'toggle') controls.current.togglePause();
        else if (c === 'next') controls.current.skip();
        else if (c === 'like') {
          const s = live.current.show;
          const t = s?.slots[Math.min(live.current.index, s.slots.length - 1)]?.track;
          if (t) controls.current.toggleHeart(t);
        }
        else controls.current.previous();
      }),
    [],
  );

  return { seek, talkAt, draft, reviewFirst, setReviewFirst, moveDraft, reorderDraft, dropDraft, addDraft, requestSong, requesting, writeDraft, cancelDraft, replay, steps, history, loadHistory, playPast, forgetShow, keepShow, liveKept, keepLive, banned, ban, miniCollapsed, setMiniCollapsed, length, setLength, hearts, toggleHeart, jumpTo, previous, phase, setPhase, stationKey, setStationKey, trying, station, chooseLang, chooseVoice, wish, setWish, voice, show, index, speaking, paused, status, progress, palette, start, togglePause, skip, toggleVoice, save, close, stop, current };
}

export type RadioEngine = ReturnType<typeof useRadioEngine>;
const Ctx = createContext<RadioEngine | null>(null);
// just "is the player docked?", for screens that only need room for it (Journal, Life): they don't
// re-render every time the song's progress or the talking changes, only when the dock appears/folds
// (and the song's colour, for the app's background while music plays)
type Dock = { phase: RadioEngine['phase']; miniCollapsed: boolean; glow: string | null };
const DockCtx = createContext<Dock>({ phase: 'pick', miniCollapsed: false, glow: null });

export function RadioProvider({ children }: { children: ReactNode }) {
  const engine = useRadioEngine();
  const glow = engine.palette?.glow ?? null;
  const dock = useMemo(() => ({ phase: engine.phase, miniCollapsed: engine.miniCollapsed, glow }), [engine.phase, engine.miniCollapsed, glow]);
  return (
    <Ctx.Provider value={engine}>
      <DockCtx.Provider value={dock}>{children}</DockCtx.Provider>
    </Ctx.Provider>
  );
}

export const useRadioDock = () => useContext(DockCtx);

export function useRadio(): RadioEngine {
  const r = useContext(Ctx);
  if (!r) throw new Error('RadioProvider is missing');
  return r;
}
