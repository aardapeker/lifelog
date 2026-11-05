# Lifelog

A personal journal that remembers everything you write, plus an AI friend that has read all of it.
Android only. No server, no account. Everything lives on the phone.

## What it does

- **Journal**: write, talk (voice notes → text), add photos (the AI captions them so they're searchable)
- **Search**: by keyword (FTS5) and by meaning (Gemini embeddings), merged with reciprocal rank fusion
- **Chat**: a friend who has read your journal. Sees the last 14 days, your profile and what it has learned;
  calls a `search_notes` tool for anything older. Claude or Gemini, streaming.
- **What I've learned**: facts pulled out of every entry (people, goals, plans…), editable in Settings
- **Your week, in a letter**: a recap written every Sunday
- **On this day**: entries from 1 month, 6 months and 1 year ago
- **Check-ins**: messages at break time, following the Morning → Night → Evening shift rotation.
  Written ahead of time and scheduled as local notifications, so no server is needed
- **Privacy**: fingerprint lock; API keys in the Android keystore; encrypted backups
  (AES-256-GCM, scrypt passphrase) saved to Drive through the share sheet, with restore

- **Insights tab**: a mood map (and mood per shift week), goals that link entries on their own,
  people & pet pages, and a video idea inbox filled from your entries
- **Home screen widget** with Talk and Write buttons (plus an in-app "Add widget" button for Xiaomi)
- **Share into Lifelog** from any app: text, links and images become a new entry
- **Grammar fixer**: one tap in the editor, or automatically on save
- **Export** everything as JSON, for moving to a home server later
- **Day planner for days off**: weather (Open-Meteo, no key), real events found with Gemini's Google Search,
  your goals, mood and people you haven't seen, turned into a checklist; adjustable "social push";
  reminder the evening before; ticked items become a journal entry draft
- **On its own**: Android wakes the app every few hours (no server). The friend looks up things you
  wrote about (daily cap, "never look up" list), searches for things to do nearby, and sends at most one
  message a day (notification + chat, with links). Results also listed under Insights → Looked Into
- **Chat sessions**: New chat, History (auto titles, hold to delete); quiet chats become memory too
- **Never ghosts you**: one message every day (what it found, or just checking in), plus check-ins at break time,
  all written a week ahead as local notifications, so they arrive even when HyperOS keeps the app asleep.
  Notices when you've gone quiet. Settings → On Its Own has Autostart / Battery saver shortcuts for Xiaomi
- **Spotify (Premium)**: the friend suggests songs with ▶ Play buttons in the chat, every new entry remembers the
  song you were listening to, and **Lifelog Radio** hosts a show for you: a set picked from your week and taste,
  with the hosts talking before each song in natural Gemini voices. Stations in the spirit of old open-world
  game radio: Neon FM (80s pop), Night Shift FM (synthwave), Gebze Rock 104, Şemistan Chill (the cat co-hosts),
  each with a host + comedian duo, fake commercials and news bulletins about your life. Your own Spotify app's Client ID, PKCE login, no server
- **Reads**: after a chat goes quiet, the friend researches its topic from three angles with Google Search
  and writes a short magazine-style article just for you, with sources (at most one a day)

Everything lives on the phone. One Gemini key is enough for all of it.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go on your phone
```

Then in the app: **Settings → paste Claude key → Save → Test**, same for Gemini. Done.

## 📲 Install (APK)

Every push to `main` builds an APK on GitHub Actions.
On your phone open **github.com/aardapeker/lifelog/releases/latest**, download the `.apk`,
and install it (allow "install unknown apps" once). New builds install over the old one, so your data stays.

## Where things are

```
src/app/                 screens (Expo Router)
  (tabs)/index.tsx       journal list + search
  (tabs)/chat.tsx        chat with Claude
  (tabs)/settings.tsx    API keys, About me, model, index status
  note/[id].tsx          write / edit an entry
src/lib/
  db.ts                  schema + migrations (append, never edit old ones)
  notes.ts               notes CRUD + chunking
  embeddings.ts          Gemini embeddings + background indexer
  search.ts              FTS5 + vector + RRF
  context.ts             builds the system prompt (the friend's "brain")
  claude.ts              streaming Messages API
  keys.ts                secure key storage
```

## Next up

1. Encrypted daily Google Drive backup (on app open if last backup > 24h)
2. Photos (vision model writes a caption once, caption gets indexed)
3. Facts table + weekly auto-updated profile
4. `search_notes` as a Claude tool so it searches only when needed
5. Proactive messages at break times
