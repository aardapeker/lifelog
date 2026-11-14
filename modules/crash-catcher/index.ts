import { requireOptionalNativeModule } from 'expo';

/** Native crash notes (Android). Null where the module isn't built in (Expo Go, web). */
type CrashCatcher = {
  install(): void;
  breadcrumb(text: string): void;
  lastCrash(): string | null;
  clear(): void;
  processAgeMs(): number;
};

export default requireOptionalNativeModule<CrashCatcher>('CrashCatcher');
