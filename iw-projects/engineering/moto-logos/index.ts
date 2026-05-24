import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { getNavigationTarget } from './src/utils/navigationState';
import { GEOFENCE_TASK_NAME } from './src/utils/geofenceService';

// ── ジオフェンス到着タスク（バックグラウンドで実行） ──
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) return;
  const { eventType } = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  if (eventType !== Location.GeofencingEventType.Enter) return;

  const target = await getNavigationTarget();
  if (!target) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${target.name}に着いた？`,
      body: 'バイクの場所、残しとく？',
      data: {
        type: 'geofence_arrival',
        spotId: target.id,
        spotName: target.name,
        spotLat: target.latitude,
        spotLng: target.longitude,
      },
      sound: 'default',
    },
    trigger: null,
  });
});

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
