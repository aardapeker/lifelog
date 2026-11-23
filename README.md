# Lifelog

An everything app for one person: a journal that remembers everything you write, an AI friend that has
read all of it, a radio station that hosts a show just for you, a news feed of the topics you follow,
and a studio that writes YouTube documentaries.

**Android only. No server, no account.** Everything lives on your phone, and the AI is called with your
own API keys.

---

## 📲 Try it

### Option 1: the APK (anyone)

1. On your phone, open **[github.com/aardapeker/lifelog/releases/latest](https://github.com/aardapeker/lifelog/releases/latest)**.
2. Download the `.apk` and open it. Android asks once to allow "install unknown apps": allow it.
3. New versions install over the old one, and your data stays.

Every push to `main` that asks for a build makes a new release, usually several a week.

### Option 2: Google Play internal testing (invited testers)

Lifelog is on Google Play's **internal testing** track only, not public. Want in? Open an
[issue](https://github.com/aardapeker/lifelog/issues) saying so (don't post your email there), and
Arda will get in touch. Once added, you install and update it from the Play Store like any app.

---

## 🔑 First-time setup

Open **Settings** in the app. Only the first key is needed; the rest unlock more.

| What | Needed for | Where to get it | Cost |
|---|---|---|---|
| **Gemini API key** | Almost everything: search by meaning, the friend, the hosts' voices, Google Search for research and fact checks | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free tier is enough to start (it has daily limits) |
| **Claude API key** *(optional)* | The friend and the writing in Claude instead of Gemini | [console.anthropic.com](https://console.anthropic.com) | Pay per use |
| **Spotify Premium + your own Spotify app** *(optional)* | Lifelog Radio, songs in chat, the song you were listening to on each entry | See below | Premium |
| **TMDB key** *(optional)* | Movies and TV in the Radar feed | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Free |

Paste a key, tap **Save**, then **Test**. Keys stay in your phone's encrypted keystore and only go to
the service they belong to.

### Spotify (for the radio)

Lifelog controls *your* Spotify app, so you make your own (free) Spotify developer app:

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app** (any name).
2. Under **Redirect URIs**, add `dev.arda.lifelog://spotify-auth`. Tick **Web API**, then save.
3. Copy the app's **Client ID** into Lifelog → **Settings → Spotify** and log in.

The Settings screen shows these same steps, with the redirect URI ready to copy.

### HyperOS (and other battery-strict phones)

Lifelog does things on its own (check-ins, the radio with the screen off). Phones that freeze apps
aggressively need two switches: **Settings → On Its Own** has shortcuts to **Autostart** and
**Battery saver → No restrictions**. Without them, messages can arrive late and the radio can stall.

---

## ✨ What's inside

**📓 Journal** (Journal and Write tabs)
- Write, or talk (voice notes become text), add photos (the AI captions them, so they're searchable)
- Search by keyword and by meaning, merged into one list
- A grammar fixer (one tap, with Undo), share into Lifelog from any app, and a home screen widget

**🧑‍🤝‍🧑 The friend** (Friend tab)
- An AI friend that has read your journal: the last 14 days up front, older entries searched when needed
- Learns facts about you (people, goals, plans) that you can see and edit
- Check-ins at break time, a weekly letter, "on this day", and one message a day with something it looked up
- **Reads**: after a chat, it researches the topic with Google Search and writes you a short article with sources

**📻 Lifelog Radio** (Radio tab, needs Spotify Premium)
- A show built from your week and your taste: it picks the songs, writes the talks, and the hosts talk
  between songs (and over a song's fading end) in natural AI voices
- Stations in the spirit of old open-world game radio: Your Friend 88.0, Neon FM, Night Shift FM,
  Gebze Rock, Şemistan Chill (the cat co-hosts) and Tuzla Arabesk FM, each with its own look and hosts
- A music bed under the hosts (Deezer previews you pick, slowed if you like) and a weather ambience
  (rain, wind, crickets… or the real weather where you are)
- Lyrics, about the song and the artist, and it keeps going with the screen off

**🛰️ Radar** (Life tab)
- A feed of the topics you follow, not people: news, Hacker News, Mastodon, YouTube, GitHub releases,
  arXiv, movies and TV, games, F1, earthquakes near Istanbul with a map, and more
- AI summaries, a reader view without ads, and a morning digest

**🎬 Studio** (Life tab)
- Documentaries for YouTube: deep research with sources → a script in scenes → your edits
- A **fact check** of every scene with Google Search, **Ask the checker** for anything that looks off,
  and an **Editor's review** that lists fixes, doubts and ideas you apply with one tap
- Every version kept, with a word-by-word diff, and a publish kit (titles, description, tags, thumbnail text)

**🎮 And more** (Life tab): Bug Arena (a coding quiz game for breaks), a monthly Wrapped, a mood map,
goals, people pages, a day planner for days off, groceries.

---

## 🔒 Privacy

- Your journal never leaves the phone, except as a backup **you** save: encrypted (AES-256-GCM, with a
  passphrase) and shared wherever you like (e.g. Google Drive)
- Fingerprint lock, and keys in the Android keystore
- No analytics, no account, no Lifelog server. What does leave the phone is what you'd expect: the text
  you send to the AI you chose, and requests to the services above (Spotify, Deezer, news sources…)
- Lifelog never logs into your personal social accounts

---

## 🛠️ For developers

Expo SDK 58 (React Native, TypeScript, Expo Router), SQLite on the phone, built on GitHub Actions.

```bash
npm install
npx expo start      # dev build; some parts (widgets, lock screen controls) need a real build
npx tsc --noEmit    # type check
```

```
src/app/            screens (Expo Router): (tabs)/, settings/, radar/, studio/, station/, arena/ …
src/lib/            the logic: db.ts (migrations: append, never edit), chat, search, radioEngine,
                    stations, tts, spotify, studio, keys …
src/radar/          the Radar sub-app (also its own repo; here it runs with the phone as its server)
src/components/     shared UI
patches/, plugins/  native tweaks (expo-audio's lock screen controls)
```

Builds: an empty commit `Build: apk`, `Build: aab` or `Build: both` on `main` tells CI what to make. APKs
go to GitHub Releases, AABs to Play internal testing.
