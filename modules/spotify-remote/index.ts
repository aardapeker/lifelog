import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from 'expo';

/** What the Spotify app reports about its player (via the App Remote SDK, on the phone itself). */
export type RemoteState = {
  uri: string | null;
  name: string | null;
  artist: string | null;
  durationMs: number;
  positionMs: number;
  paused: boolean;
};

type Events = { onPlayerState: (state: RemoteState) => void };

declare class SpotifyRemoteModule extends NativeModule<Events> {
  isSpotifyInstalled(): boolean;
  isConnected(): boolean;
  connect(clientId: string, redirectUri: string, showAuth: boolean): Promise<boolean>;
  play(uri: string): Promise<boolean>;
  queue(uri: string): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  skipNext(): Promise<boolean>;
  seekTo(ms: number): Promise<boolean>;
  switchToPhone(): Promise<boolean>;
  getState(): Promise<RemoteState>;
  disconnect(): void;
}

/** null where the native part isn't built in (web preview, Expo Go). */
export const SpotifyRemote = requireOptionalNativeModule<SpotifyRemoteModule>('SpotifyRemote');

export function onPlayerState(f: (s: RemoteState) => void): EventSubscription | null {
  return SpotifyRemote?.addListener('onPlayerState', f) ?? null;
}
