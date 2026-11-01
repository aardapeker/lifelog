import type { ConfigContext, ExpoConfig } from 'expo/config';

// versionCode = GitHub run number, so every new APK installs over the old one (data is kept)
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    android: {
      ...config.android,
      versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 1),
    },
  }) as ExpoConfig;
