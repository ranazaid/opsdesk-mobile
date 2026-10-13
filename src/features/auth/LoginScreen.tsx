import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import { DEMO_PASSWORD, DEMO_USERS } from '@/api/mock/seed';
import type { Role } from '@/api/schemas';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { isDemoMode } from '@/config/env';
import { ROLE_LABELS } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';

const DEMO_ROLES: Role[] = ['owner', 'admin', 'agent', 'viewer'];

export function LoginScreen() {
  const { colors, typography, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, state } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const expired = state.status === 'signedOut' && state.reason === 'expired';

  const submit = async (credentials = { email, password }, key = 'form') => {
    if (!credentials.email.trim() || !credentials.password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setSubmitting(key);
    try {
      await signIn(credentials.email, credentials.password);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(null);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={[styles.logo, { backgroundColor: colors.primary, borderRadius: radius.lg }]}>
            <Ionicons name="file-tray-stacked" size={26} color={colors.primaryText} />
          </View>
          <Text style={[typography.title, { color: colors.text }]}>OpsDesk</Text>
          <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>Your support queue, in your pocket. Works offline.</Text>
        </View>

        {expired ? (
          <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.warningSoft, borderRadius: radius.md }]}>
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={[typography.caption, { color: colors.warning, flex: 1 }]}>Your session expired. Please sign in again.</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <TextField
            testID="login-email"
            label="Work email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            testID="login-password"
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}
          <Button testID="login-submit" label="Sign in" onPress={() => void submit()} loading={submitting === 'form'} disabled={submitting !== null} />
        </View>

        {isDemoMode ? (
          <View style={[styles.demo, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <View style={styles.demoHeader}>
              <Ionicons name="flask-outline" size={16} color={colors.primary} />
              <Text style={[typography.bodyStrong, { color: colors.text }]}>Demo mode</Text>
            </View>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              No API configured, so the app is running against an in-memory backend with seeded tickets. Sign in as any role to see the
              role-aware UI.
            </Text>
            <View style={styles.roles}>
              {DEMO_ROLES.map((role) => {
                const demoUser = DEMO_USERS.find((candidate) => candidate.role === role)!;
                return (
                  <Pressable
                    key={role}
                    testID={`demo-login-${role}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Sign in as ${ROLE_LABELS[role]}`}
                    disabled={submitting !== null}
                    onPress={() => void submit({ email: demoUser.email, password: DEMO_PASSWORD }, role)}
                    style={({ pressed }) => [
                      styles.role,
                      { borderColor: colors.border, borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceAlt : colors.background },
                    ]}
                  >
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{ROLE_LABELS[role]}</Text>
                    <Text style={[typography.caption, { color: colors.textSubtle }]} numberOfLines={1}>
                      {submitting === role ? 'Signing in…' : demoUser.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typography.caption, { color: colors.textSubtle }]}>
              Same accounts as the opsdesk-web seed, e.g. aisha@northwind.test / {DEMO_PASSWORD}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 8 },
  logo: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  form: { gap: 14 },
  demo: { borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  demoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  role: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
});
