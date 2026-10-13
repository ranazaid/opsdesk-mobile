import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { env, isDemoMode } from '@/config/env';
import { isMonitoringEnabled } from '@/monitoring/monitoring';
import type { PushRegistrationResult } from '@/notifications/push';
import { usePushStatus } from '@/notifications/PushProvider';
import { demoNetwork } from '@/offline/demoNetwork';
import { useSync } from '@/offline/SyncProvider';
import { MOBILE_PERMISSIONS, ROLE_LABELS, can } from '@/permissions/matrix';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';

const THEME_SEGMENTS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function pushLabel(result: PushRegistrationResult | null): string {
  if (!result) return 'Checking…';
  switch (result.status) {
    case 'registered':
      return 'Enabled';
    case 'denied':
      return 'Permission denied (enable in system settings)';
    case 'unsupported':
    case 'error':
      return result.reason;
  }
}

export function SettingsScreen() {
  const pushStatus = usePushStatus();
  const { colors, typography, preference, setPreference } = useTheme();
  const { user, signOut } = useAuth();
  const { isOnline, isSyncing, entries, syncNow } = useSync();
  const [simulateOffline, setSimulateOffline] = useState(demoNetwork.isOffline());

  if (!user) return null;

  const confirmSignOut = () => {
    const pendingWarning = entries.length > 0 ? `\n\n${entries.length} unsynced change(s) will be discarded.` : '';
    if (Platform.OS === 'web') {
      void signOut();
      return;
    }
    Alert.alert('Sign out?', `You'll need to sign in again to see your tickets.${pendingWarning}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Card style={styles.profile}>
        <Avatar name={user.name} size={56} />
        <View style={styles.profileText}>
          <Text style={[typography.heading, { color: colors.text }]}>{user.name}</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{user.email}</Text>
          <Text style={[typography.caption, { color: colors.textSubtle }]}>
            {user.orgName} · {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} plan
          </Text>
        </View>
        <Badge label={ROLE_LABELS[user.role]} tone={{ fg: colors.primary, bg: colors.primarySoft }} />
      </Card>

      <Section title={`Your access · ${ROLE_LABELS[user.role]}`}>
        {MOBILE_PERMISSIONS.map(({ permission, label }) => {
          const allowed = can(user.role, permission);
          return (
            <View key={permission} style={styles.permission} testID={`perm-${permission}`}>
              <Ionicons name={allowed ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={allowed ? colors.success : colors.textSubtle} />
              <Text style={[typography.body, { color: allowed ? colors.text : colors.textSubtle }]}>{label}</Text>
            </View>
          );
        })}
      </Section>

      <Section title="Appearance">
        <SegmentedControl accessibilityLabel="Theme" segments={THEME_SEGMENTS} value={preference} onChange={setPreference} />
      </Section>

      <Section title="Sync">
        <Row label="Connection" value={isOnline ? 'Online' : 'Offline'} />
        <Row label="Waiting to sync" value={`${entries.length} change${entries.length === 1 ? '' : 's'}`} />
        {isDemoMode ? (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[typography.body, { color: colors.text }]}>Simulate offline</Text>
              <Text style={[typography.caption, { color: colors.textSubtle }]}>Demo only: make the mock API unreachable to try the outbox.</Text>
            </View>
            <Switch
              testID="simulate-offline"
              accessibilityLabel="Simulate offline"
              value={simulateOffline}
              onValueChange={(value) => {
                setSimulateOffline(value);
                demoNetwork.setOffline(value);
              }}
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
            />
          </View>
        ) : null}
        <Button label="Sync now" icon="sync-outline" size="sm" variant="secondary" loading={isSyncing} disabled={!isOnline || entries.length === 0} onPress={() => void syncNow({ ignoreBackoff: true })} />
      </Section>

      <Section title="About">
        <Row label="Push notifications" value={pushLabel(pushStatus)} />
        <Row label="Backend" value={isDemoMode ? 'Demo (in-memory)' : (env.apiUrl ?? '')} />
        <Row label="Monitoring" value={isMonitoringEnabled() ? 'Datadog RUM' : 'Off'} />
        <Row label="Version" value={`${Constants.expoConfig?.version ?? '1.0.0'} (${Platform.OS})`} />
      </Section>

      <Button testID="sign-out" label="Sign out" icon="log-out-outline" variant="danger" onPress={confirmSignOut} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[typography.overline, styles.sectionTitle, { color: colors.textSubtle }]}>{title}</Text>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
      <Text style={[typography.caption, styles.rowValue, { color: colors.textMuted }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileText: { flex: 1, gap: 2 },
  section: { gap: 8 },
  sectionTitle: { paddingHorizontal: 4 },
  sectionCard: { gap: 12 },
  permission: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
});
