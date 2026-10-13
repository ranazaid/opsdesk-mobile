import { createContext, useContext, type ReactNode } from 'react';

import type { PushRegistrationResult } from './push';
import { usePushNotifications } from './usePushNotifications';

const PushStatusContext = createContext<PushRegistrationResult | null>(null);

/** Registers for push while signed in and exposes the registration outcome to Settings. */
export function PushProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const status = usePushNotifications(enabled);
  return <PushStatusContext.Provider value={status}>{children}</PushStatusContext.Provider>;
}

export function usePushStatus(): PushRegistrationResult | null {
  return useContext(PushStatusContext);
}
