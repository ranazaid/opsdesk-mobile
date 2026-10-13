import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

import { demoNetwork } from './demoNetwork';

/**
 * `isInternetReachable` is `null` while NetInfo is still probing; treat that as
 * online so a cold start does not flash the offline banner.
 */
export function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useNetworkStatus(): { isOnline: boolean } {
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [simulatedOffline, setSimulatedOffline] = useState(demoNetwork.isOffline());

  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => setDeviceOnline(isOnlineState(state)));
    const unsubscribeDemo = demoNetwork.subscribe(setSimulatedOffline);
    return () => {
      unsubscribeNetInfo();
      unsubscribeDemo();
    };
  }, []);

  return { isOnline: deviceOnline && !simulatedOffline };
}
