/**
 * In-memory session holder that the API layer can read synchronously.
 *
 * The token is persisted in expo-secure-store by `AuthProvider`; this module
 * only mirrors it in memory so every request does not hit the keychain, and
 * provides the 401 -> logout signal path from the API client back to React.
 */
type Listener = () => void;

let currentToken: string | null = null;
const unauthorizedListeners = new Set<Listener>();

export const session = {
  getToken(): string | null {
    return currentToken;
  },

  setToken(token: string | null): void {
    currentToken = token;
  },

  /** Subscribe to "the server rejected our token". Returns an unsubscribe function. */
  onUnauthorized(listener: Listener): () => void {
    unauthorizedListeners.add(listener);
    return () => {
      unauthorizedListeners.delete(listener);
    };
  },

  notifyUnauthorized(): void {
    // Only meaningful while signed in; avoids logout loops from stale requests.
    if (currentToken === null) return;
    unauthorizedListeners.forEach((listener) => listener());
  },
};
