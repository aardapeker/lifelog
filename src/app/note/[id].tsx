import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old links (widgets placed before the Write tab, lifelog://note/new) land in the Write tab. */
export default function NoteRedirect() {
  const { id, voice, shared } = useLocalSearchParams<{ id: string; voice?: string; shared?: string }>();
  return (
    <Redirect
      href={{
        pathname: '/write',
        params: { id: id ?? 'new', ...(voice ? { voice } : {}), ...(shared ? { shared } : {}), t: String(Date.now()) },
      }}
    />
  );
}
