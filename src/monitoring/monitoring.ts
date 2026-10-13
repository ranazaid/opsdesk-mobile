import { Platform } from 'react-native';

import type { User } from '@/api/schemas';
import { env } from '@/config/env';

/**
 * Thin wrapper around Datadog RUM so the rest of the app never imports the SDK.
 *
 * - Initialised only when EXPO_PUBLIC_DD_CLIENT_TOKEN and
 *   EXPO_PUBLIC_DD_APPLICATION_ID are set (and never on web, where the native
 *   SDK does not exist). Otherwise every function is a cheap no-op, which is
 *   what makes the app run in Expo Go and in tests.
 * - The SDK is loaded lazily with `require` so its native module is never
 *   touched unless monitoring is enabled.
 * - Monitoring must never break the app: every call is guarded.
 */
type DatadogSdk = typeof import('@datadog/mobile-react-native');

let sdk: DatadogSdk | null = null;
let currentViewKey: string | null = null;

export function isMonitoringEnabled(): boolean {
  return sdk !== null;
}

export async function initMonitoring(): Promise<boolean> {
  const { clientToken, applicationId, site, env: ddEnv } = env.datadog;
  if (sdk || !clientToken || !applicationId || Platform.OS === 'web') return sdk !== null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const datadog = require('@datadog/mobile-react-native') as DatadogSdk;
    const config = new datadog.CoreConfiguration(clientToken, ddEnv, datadog.TrackingConsent.GRANTED, {
      site,
      service: 'opsdesk-mobile',
      rumConfiguration: {
        applicationId,
        trackErrors: true, // JS errors, unhandled promise rejections and native crashes
        trackResources: true,
        trackInteractions: true,
        sessionSampleRate: 100,
        nativeCrashReportEnabled: true,
        // Navigation is tracked manually from expo-router's pathname (see trackView).
        nativeViewTracking: false,
        // Propagate trace headers to our own API so RUM resources link to backend APM traces.
        firstPartyHosts: env.apiUrl
          ? [{ match: new URL(env.apiUrl).hostname, propagatorTypes: [datadog.PropagatorType.DATADOG, datadog.PropagatorType.TRACECONTEXT] }]
          : [],
      },
    });
    await datadog.DdSdkReactNative.initialize(config);
    sdk = datadog;
    return true;
  } catch (error) {
    console.warn('[monitoring] Datadog RUM failed to initialise; continuing without it', error);
    sdk = null;
    return false;
  }
}

/** Starts a RUM view for the current route and stops the previous one. */
export function trackView(pathname: string): void {
  if (!sdk || pathname === currentViewKey) return;
  const previous = currentViewKey;
  currentViewKey = pathname;
  const { DdRum } = sdk;
  if (previous) DdRum.stopView(previous).catch(() => undefined);
  DdRum.startView(pathname, viewName(pathname), { 'view.path': pathname }).catch(() => undefined);
}

export function trackError(error: unknown, context: Record<string, unknown> = {}): void {
  if (!sdk) return;
  const err = error instanceof Error ? error : new Error(String(error));
  sdk.DdRum.addError(err.message, sdk.ErrorSource.SOURCE, err.stack ?? '', context).catch(() => undefined);
}

export function trackAction(name: string, context: Record<string, unknown> = {}): void {
  if (!sdk) return;
  sdk.DdRum.addAction(sdk.RumActionType.CUSTOM, name, context).catch(() => undefined);
}

export function setMonitoringUser(user: User | null): void {
  if (!sdk) return;
  const { DdSdkReactNative } = sdk;
  const done = user
    ? DdSdkReactNative.setUserInfo({ id: user.id, name: user.name, email: user.email, extraInfo: { role: user.role, orgId: user.orgId } })
    : DdSdkReactNative.clearUserInfo();
  done.catch(() => undefined);
}

/** Collapses dynamic segments so RUM groups views: /tickets/tkt_42 -> /tickets/[id]. */
export function viewName(pathname: string): string {
  return pathname.replace(/\/tickets\/(?!new$)[^/]+/, '/tickets/[id]') || '/';
}
