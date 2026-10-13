import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useApi } from '@/api/ApiProvider';
import { trackAction } from '@/monitoring/monitoring';

import { routeFromNotificationData } from './deepLink';
import { registerForPushNotifications, type PushRegistrationResult } from './push';

/**
 * Registers the device for push once per signed-in session and routes taps on
 * notifications (including the one that cold-started the app) to the ticket.
 */
export function usePushNotifications(enabled: boolean): PushRegistrationResult | null {
  const api = useApi();
  const router = useRouter();
  const [result, setResult] = useState<PushRegistrationResult | null>(null);
  const handledIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    registerForPushNotifications(api).then((outcome) => {
      if (cancelled) return;
      setResult(outcome);
      trackAction('push.registration', { status: outcome.status });
    });
    return () => {
      cancelled = true;
    };
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledIds.current.has(id)) return;
      handledIds.current.add(id);
      const route = routeFromNotificationData(response.notification.request.content.data);
      if (route) router.push(route);
    };

    // Notification that launched the app from a killed state.
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [enabled, router]);

  return result;
}
