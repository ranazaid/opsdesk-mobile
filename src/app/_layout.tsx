import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, SplashScreen, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import { ApiProvider } from '@/api/ApiProvider';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ErrorState } from '@/components/ui/StateViews';
import { createQueryClient, queryPersister, setupReactQueryNative } from '@/data/queryClient';
import { initMonitoring, trackError, trackView } from '@/monitoring/monitoring';
import { configureNotificationHandler } from '@/notifications/push';
import { PushProvider } from '@/notifications/PushProvider';
import { outbox } from '@/offline/outboxInstance';
import { SyncProvider } from '@/offline/SyncProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void initMonitoring();
configureNotificationHandler();
setupReactQueryNative();

const queryClient = createQueryClient();

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

async function clearUserData(): Promise<void> {
  queryClient.clear();
  await Promise.allSettled([queryPersister.removeClient(), outbox.clear()]);
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    trackError(error, { area: 'route-error-boundary' });
  }, [error]);
  return <ErrorState message={error.message} onRetry={() => void retry()} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ApiProvider api={api}>
          <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: CACHE_MAX_AGE, buster: 'v1' }}>
            <AuthProvider onSignedOut={clearUserData}>
              <AppShell />
            </AuthProvider>
          </PersistQueryClientProvider>
        </ApiProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { state } = useAuth();
  const { colors, scheme } = useTheme();
  const pathname = usePathname();
  const signedIn = state.status === 'signedIn';

  useEffect(() => {
    if (state.status !== 'restoring') void SplashScreen.hideAsync().catch(() => undefined);
  }, [state.status]);

  useEffect(() => {
    trackView(pathname);
  }, [pathname]);

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border },
    };
  }, [scheme, colors]);

  // Keep the native splash screen up while the session is restored from SecureStore.
  if (state.status === 'restoring') return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <SyncProvider outbox={outbox} enabled={signedIn}>
        <PushProvider enabled={signedIn}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.text },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="tickets/[id]" options={{ title: 'Ticket', headerBackTitle: 'Tickets' }} />
              <Stack.Screen name="tickets/new" options={{ title: 'New ticket', presentation: 'modal' }} />
            </Stack.Protected>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
        </PushProvider>
      </SyncProvider>
    </NavigationThemeProvider>
  );
}
