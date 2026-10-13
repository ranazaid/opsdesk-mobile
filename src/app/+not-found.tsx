import { Stack, useRouter } from 'expo-router';

import { EmptyState } from '@/components/ui/StateViews';

export default function NotFound() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState icon="help-buoy-outline" title="Page not found" message="That link doesn't point to anything in OpsDesk." actionLabel="Go to tickets" onAction={() => router.replace('/')} />
    </>
  );
}
