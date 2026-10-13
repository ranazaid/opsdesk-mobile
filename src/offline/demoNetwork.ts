/**
 * "Simulate offline" switch for demo mode.
 *
 * Toggling airplane mode is awkward in a simulator or during a screen share, so
 * the Settings screen exposes this switch in demo mode. When enabled, the mock
 * API rejects every call with a network error and `useNetworkStatus` reports
 * offline, which exercises the exact same outbox path as a real outage.
 */
type Listener = (offline: boolean) => void;

let simulatedOffline = false;
const listeners = new Set<Listener>();

export const demoNetwork = {
  isOffline(): boolean {
    return simulatedOffline;
  },
  setOffline(offline: boolean): void {
    if (offline === simulatedOffline) return;
    simulatedOffline = offline;
    listeners.forEach((listener) => listener(offline));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
