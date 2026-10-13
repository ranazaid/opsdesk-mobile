import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time app config. Values here are read by the Expo CLI / EAS Build,
 * not by the JS bundle. Runtime configuration lives in `src/config/env.ts`
 * and uses `EXPO_PUBLIC_*` variables, which Expo inlines at bundle time.
 *
 * APP_VARIANT is set per EAS build profile (see eas.json) so development,
 * preview and production builds can be installed side by side.
 */
type Variant = 'development' | 'preview' | 'production';

const variant: Variant = (() => {
  const raw = process.env.APP_VARIANT;
  return raw === 'development' || raw === 'preview' ? raw : 'production';
})();

const BUNDLE_ID = 'com.ranazaid.opsdesk';

const suffix: Record<Variant, { id: string; name: string }> = {
  development: { id: '.dev', name: ' (Dev)' },
  preview: { id: '.preview', name: ' (Preview)' },
  production: { id: '', name: '' },
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: `OpsDesk${suffix[variant].name}`,
  slug: 'opsdesk-mobile',
  owner: process.env.EXPO_OWNER || undefined,
  version: '1.0.0',
  scheme: 'opsdesk',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: `${BUNDLE_ID}${suffix[variant].id}`,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: `${BUNDLE_ID}${suffix[variant].id}`,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#4F46E5',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
        dark: { backgroundColor: '#0B0F19' },
      },
    ],
  ],
  extra: {
    appVariant: variant,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
