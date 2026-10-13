/**
 * Runtime configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined by babel-preset-expo at bundle time, so
 * they must be referenced with static `process.env.EXPO_PUBLIC_X` member
 * expressions (no destructuring, no dynamic keys). Everything is read through
 * `readEnv()` so tests can change `process.env` between cases.
 */
export interface AppEnv {
  /** Fully-qualified API origin, without the `/api/v1` prefix. `null` means demo mode. */
  apiUrl: string | null;
  apiTimeoutMs: number;
  datadog: {
    clientToken: string | null;
    applicationId: string | null;
    site: string;
    env: string;
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readEnv(): AppEnv {
  const apiUrl = clean(process.env.EXPO_PUBLIC_API_URL);
  return {
    apiUrl: apiUrl ? apiUrl.replace(/\/+$/, '') : null,
    apiTimeoutMs: toPositiveInt(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    datadog: {
      clientToken: clean(process.env.EXPO_PUBLIC_DD_CLIENT_TOKEN),
      applicationId: clean(process.env.EXPO_PUBLIC_DD_APPLICATION_ID),
      site: clean(process.env.EXPO_PUBLIC_DD_SITE) ?? 'US1',
      env: clean(process.env.EXPO_PUBLIC_DD_ENV) ?? 'development',
    },
  };
}

export const env = readEnv();

/** Demo mode: no API URL configured, so the app runs against the in-memory mock API. */
export const isDemoMode = env.apiUrl === null;
