import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/offline/SyncProvider';
import { can } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { entries } = useSync();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, size }) => <Ionicons name="file-tray-full-outline" color={color} size={size} />,
          tabBarBadge: entries.length > 0 ? entries.length : undefined,
          headerRight: can(user?.role, 'ticket.create')
            ? () => (
                <Pressable
                  testID="new-ticket-button"
                  accessibilityRole="button"
                  accessibilityLabel="New ticket"
                  hitSlop={10}
                  onPress={() => router.push('/tickets/new')}
                  style={{ marginRight: 16 }}
                >
                  <Ionicons name="add-circle" size={28} color={colors.primary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
