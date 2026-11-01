# Lifelog

A personal journal that remembers everything you write, plus an AI friend that has read all of it.
Android only. No server, no account. Everything lives on the phone.

## What's in v0.1

- **Journal**: write entries, edit, delete. Stored in SQLite on the phone.
- **Search**: hybrid search over your whole life.
  - FTS5 keyword search (works offline; `semistan` finds `Şemistan`)
  - Gemini embeddings for meaning ("scooter I wanted" finds "PCX price dropped")
  - merged with reciprocal rank fusion
- **Chat**: Claude, streaming. Every message gets your "About me" text, the last 14 days of entries,
  and older entries the hybrid search finds for that message.
- **Settings**: paste API keys (no code needed), test them, edit "About me", pick the chat model,
  see the memory index status.

API keys are stored in Android's encrypted keystore (`expo-secure-store`), never in the database.

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
