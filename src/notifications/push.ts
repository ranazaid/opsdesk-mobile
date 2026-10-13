import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { OpsDeskApi } from '@/api/types';

/**
 * Push notifications.
 *
 * Client responsibilities (implemented here):
 *  1. Ask for permission at a sensible moment (after sign-in, not on cold start).
 *  2. Obtain an Expo push token and register it with the backend:
 *       POST /api/v1/devices/push-token  { token, platform }  ->  { ok: true }
 *  3. Show notifications while the app is foregrounded.
 *  4. Deep-link to the ticket when a notification is tapped. The server sends
 *     `data: { ticketId: "tkt_123" }` (or `data: { url: "opsdesk://tickets/tkt_123" }`).
 *
 * Sending pushes (Expo Push API / APNs / FCM) is server-side and out of scope.
 */

export const ANDROID_CHANNEL_ID = 'ticket-updates';

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; reason: string };

let handlerConfigured = false;

/** Foreground presentation: show a banner and add to the notification list, no sound. */
export function configureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function registerForPushNotifications(api: OpsDeskApi): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return { status: 'unsupported', reason: 'Push notifications are not enabled on web.' };
  if (!Device.isDevice) return { status: 'unsupported', reason: 'Push notifications require a physical device.' };

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Ticket updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#4F46E5',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return { status: 'denied' };

    const id = projectId();
    if (!id) return { status: 'unsupported', reason: 'EAS projectId is not configured (set EAS_PROJECT_ID).' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.registerPushToken({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return { status: 'registered', token };
  } catch (error) {
    // Expo Go on Android does not support remote push since SDK 53; never crash on this.
    return { status: 'error', reason: error instanceof Error ? error.message : String(error) };
  }
}
