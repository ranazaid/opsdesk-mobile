import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { userSchema, type User } from '@/api/schemas';

/**
 * Persists the session in the iOS Keychain / Android Keystore via
 * expo-secure-store. The cached user lets the app open straight into the
 * ticket list when offline; it is refreshed from GET /me when online.
 *
 * expo-secure-store has no web implementation, so the web build (used only
 * for previews and screenshots) falls back to sessionStorage.
 */
const TOKEN_KEY = 'opsdesk.session.token';
const USER_KEY = 'opsdesk.session.user';

export interface StoredSession {
  token: string;
  user: User;
}

const webStore = {
  get: (key: string) => (typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key)),
  set: (key: string, value: string) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
  },
  remove: (key: string) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
  },
};

const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  return isWeb ? webStore.get(key) : SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) webStore.set(key, value);
  else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

async function removeItem(key: string): Promise<void> {
  if (isWeb) webStore.remove(key);
  else await SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  async load(): Promise<StoredSession | null> {
    const [token, rawUser] = await Promise.all([getItem(TOKEN_KEY), getItem(USER_KEY)]);
    if (!token || !rawUser) return null;
    try {
      const user = userSchema.safeParse(JSON.parse(rawUser));
      return user.success ? { token, user: user.data } : null;
    } catch {
      return null;
    }
  },

  async save(session: StoredSession): Promise<void> {
    await Promise.all([setItem(TOKEN_KEY, session.token), setItem(USER_KEY, JSON.stringify(session.user))]);
  },

  async saveUser(user: User): Promise<void> {
    await setItem(USER_KEY, JSON.stringify(user));
  },

  async clear(): Promise<void> {
    await Promise.all([removeItem(TOKEN_KEY), removeItem(USER_KEY)]);
  },
};
