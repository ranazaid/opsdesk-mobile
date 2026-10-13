import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSync } from '@/offline/SyncProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Offline / pending-sync / rejected-change status strip shown above lists and detail views. */
export function SyncBanner() {
  const { colors, typography } = useTheme();
  const { isOnline, isSyncing, entries, droppedNotice, dismissDroppedNotice } = useSync();
  const pending = entries.length;
  const label = `${pending} change${pending === 1 ? '' : 's'}`;

  if (droppedNotice) {
    return (
      <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
        <Text style={[typography.caption, styles.text, { color: colors.danger }]}>
          {droppedNotice.count === 1 ? 'A change' : `${droppedNotice.count} changes`} couldn&apos;t be saved: {droppedNotice.message}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={dismissDroppedNotice}>
          <Ionicons name="close" size={16} color={colors.danger} />
        </Pressable>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View testID="offline-banner" accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
        <Text style={[typography.caption, styles.text, { color: colors.warning }]}>
          Offline{pending > 0 ? ` · ${pending} change${pending === 1 ? '' : 's'} will sync when you reconnect` : ' · showing saved data'}
        </Text>
      </View>
    );
  }

  if (pending > 0) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.infoSoft }]}>
        <Ionicons name="sync-outline" size={16} color={colors.info} />
        <Text style={[typography.caption, styles.text, { color: colors.info }]}>
          {isSyncing ? `Syncing ${label}…` : `${label} waiting to sync`}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, fontWeight: '600' },
});
