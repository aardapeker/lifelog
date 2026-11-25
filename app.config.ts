import type { ConfigContext, ExpoConfig } from 'expo/config';

/*
 * The version: app.json's major.minor ("1.0", raised by hand for a big step), then the GitHub run number:
 * build 115 is 1.0.115. The same run number is the versionCode, so every new APK installs over the old one
 * (data is kept) and Play always sees a higher one. The build workflow names the release the same way.
 */
const run = Number(process.env.GITHUB_RUN_NUMBER ?? 0);

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    version: `${config.version}.${run}`,
    android: {
      ...config.android,
      versionCode: Math.max(1, run),
    },
  }) as ExpoConfig;
