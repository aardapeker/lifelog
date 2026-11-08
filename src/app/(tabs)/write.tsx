import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { NoteEditor, type EditorResult } from '../../components/NoteEditor';

/**
 * The Write tab (the ＋ in the middle): one place for all writing. Opened plain, it's a new entry;
 * opened with an id (an entry's Edit), it edits that one. Each entry gets a fresh editor (the key),
 * and an unfinished one is kept as a draft and comes back when you return to it.
 */
export default function WriteTab() {
  const params = useLocalSearchParams<{ id?: string; voice?: string; shared?: string; t?: string }>();
  const noteId = params.id && params.id !== 'new' ? Number(params.id) : null;
  const [round, setRound] = useState(0); // a new round after each save/discard: a blank page

  const done = (r: EditorResult) => {
    // back to a blank new entry (or the waiting draft) for next time
    router.setParams({ id: 'new', voice: undefined, shared: undefined, t: undefined });
    setRound((n) => n + 1);
    router.navigate('/'); // the Journal underneath, so Back from the entry lands there (not on a blank page)
    // edited (or stopped editing): see that entry again
    const shown = r.kind === 'saved' && !r.isNew ? r.id : r.kind === 'discarded' ? noteId : null;
    if (shown !== null) setTimeout(() => router.push(`/entry/${shown}`), 50);
  };

  return (
    <NoteEditor
      // t: every Talk/share/Edit tap is a fresh open, even of the same thing
      key={`${noteId ?? 'new'}-${params.voice ?? ''}-${params.shared ?? ''}-${params.t ?? ''}-${round}`}
      noteId={noteId}
      voice={params.voice === '1'}
      shared={params.shared === '1'}
      onDone={done}
    />
  );
}
