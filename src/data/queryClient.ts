import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isApiError } from '@/api/errors';
import { demoNetwork } from '@/offline/demoNetwork';
import { isOnlineState } from '@/offline/useNetworkStatus';

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return isApiError(error) && error.retryable && failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000, // keep long enough to be useful when restored offline
        retry: shouldRetry,
        // Serve cached data while offline instead of pausing with an empty screen.
        networkMode: 'offlineFirst',
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

/** Cached queries survive restarts, so the ticket list opens instantly (and offline). */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'opsdesk.queryCache.v1', throttleTime: 1_000 });

/** Wire TanStack Query's online/focus managers to React Native (call once at startup). */
export function setupReactQueryNative(): () => void {
  let deviceOnline = true;
  const update = (setOnline: (online: boolean) => void) => setOnline(deviceOnline && !demoNetwork.isOffline());

  onlineManager.setEventListener((setOnline) => {
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      deviceOnline = isOnlineState(state);
      update(setOnline);
    });
    const unsubscribeDemo = demoNetwork.subscribe(() => update(setOnline));
    return () => {
      unsubscribeNetInfo();
      unsubscribeDemo();
    };
  });

  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
