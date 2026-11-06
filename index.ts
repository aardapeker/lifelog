// Entry point: Expo Router, plus the two things Android runs without the app being open.
import { installCrashLog } from './src/lib/crashLog';
installCrashLog(); // before anything else runs
import 'expo-router/entry';
import { BackgroundTaskResult } from 'expo-background-task';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { BACKGROUND_TASK } from './src/lib/autonomy';
import { runBackgroundJobs } from './src/lib/background';
import { DB_NAME, migrate, setSetting } from './src/lib/db';
import { widgetTaskHandler } from './src/widget/task-handler';

registerWidgetTaskHandler(widgetTaskHandler);

// Android wakes the app every few hours: research, plan check-ins, maybe send the daily message.
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    const db = await openDatabaseAsync(DB_NAME);
    await migrate(db);
    await setSetting(db, 'autonomy.lastRun', String(Date.now()));
    await runBackgroundJobs(db);
    await db.closeAsync();
    return BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('background task failed', e);
    return BackgroundTaskResult.Failed;
  }
});
