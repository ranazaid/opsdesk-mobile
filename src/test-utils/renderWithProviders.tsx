import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiProvider } from '@/api/ApiProvider';
import { createMockApi, type MockApi } from '@/api/mock/mockApi';
import { DEMO_USERS } from '@/api/mock/seed';
import type { Role, User } from '@/api/schemas';
import { AuthProvider } from '@/auth/AuthProvider';
import { session } from '@/auth/session';
import { tokenStorage } from '@/auth/tokenStorage';
import { Outbox } from '@/offline/outbox';
import { SyncProvider } from '@/offline/SyncProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface RenderOptions {
  /** Sign in as the demo user with this role before rendering. */
  role?: Role;
  api?: MockApi;
  outbox?: Outbox;
}

/**
 * Renders a screen inside the same provider stack as the app, backed by the
 * in-memory mock API and a fresh outbox, with the session already restored.
 */
export async function renderWithProviders(ui: ReactElement, { role = 'agent', api, outbox }: RenderOptions = {}) {
  const demoUser = DEMO_USERS.find((candidate) => candidate.role === role)!;
  const { password: _password, ...user } = demoUser;
  const token = `demo.${demoUser.id}`;
  await tokenStorage.save({ token, user: user as User });
  session.setToken(token);

  const mockApi = api ?? createMockApi({ getToken: session.getToken, onUnauthorized: session.notifyUnauthorized, now: () => new Date() });
  const testOutbox = outbox ?? new Outbox({ storage: AsyncStorage, storageKey: `test.outbox.${Math.random()}` });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });

  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ThemeProvider initialPreference="light">
        <ApiProvider api={mockApi}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <SyncProvider outbox={testOutbox} enabled>
                {ui}
              </SyncProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );

  return { ...result, api: mockApi, outbox: testOutbox, queryClient, user: user as User };
}
