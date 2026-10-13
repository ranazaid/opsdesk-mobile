import AsyncStorage from '@react-native-async-storage/async-storage';

import { Outbox } from './outbox';

/** App-wide outbox, persisted in AsyncStorage. */
export const outbox = new Outbox({ storage: AsyncStorage });
