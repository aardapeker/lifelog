import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import { PROVIDERS } from './chat';
import { transcribeGemini } from './gemini';
import { getKey } from './keys';

// Raw AAC (.aac) is a format Gemini accepts directly as audio/aac.
export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.aac',
  android: { ...RecordingPresets.HIGH_QUALITY.android, extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac' },
};

export async function prepareMicrophone(): Promise<void> {
  const perm = await requestRecordingPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission is off. Turn it on in Android settings.');
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
}

/** Turns a recording into text with Gemini, then deletes the audio. */
export async function transcribe(uri: string): Promise<string> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('Voice notes need a Gemini key. Add one in Settings.');
  const file = new File(uri);
  try {
    const text = await transcribeGemini(apiKey, PROVIDERS.gemini.backgroundModel, await file.base64(), 'audio/aac');
    return text.trim();
  } finally {
    try {
      file.delete();
    } catch {
      // cache gets cleaned up anyway
    }
  }
}
