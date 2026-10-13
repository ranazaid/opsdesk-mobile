import { createContext, useContext, type ReactNode } from 'react';

import type { OpsDeskApi } from './types';

const ApiContext = createContext<OpsDeskApi | null>(null);

/** Dependency injection for the API: the app passes the real/demo API, tests pass their own. */
export function ApiProvider({ api, children }: { api: OpsDeskApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): OpsDeskApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
