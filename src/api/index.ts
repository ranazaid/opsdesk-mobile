import { session } from '@/auth/session';
import { env } from '@/config/env';
import { demoNetwork } from '@/offline/demoNetwork';

import { createHttpApi } from './httpApi';
import { createHttpClient } from './httpClient';
import { createMockApi } from './mock/mockApi';
import type { OpsDeskApi } from './types';

function createApi(): OpsDeskApi {
  if (env.apiUrl) {
    return createHttpApi(
      createHttpClient({
        baseUrl: env.apiUrl,
        timeoutMs: env.apiTimeoutMs,
        getToken: session.getToken,
        onUnauthorized: session.notifyUnauthorized,
      }),
    );
  }
  return createMockApi({
    latencyMs: 350,
    aiLatencyMs: 1200,
    getToken: session.getToken,
    onUnauthorized: session.notifyUnauthorized,
    isOffline: demoNetwork.isOffline,
  });
}

/** App-wide API instance: real HTTP when EXPO_PUBLIC_API_URL is set, otherwise the demo backend. */
export const api: OpsDeskApi = createApi();

export * from './errors';
export * from './schemas';
export type { OpsDeskApi, PushTokenRegistration } from './types';
