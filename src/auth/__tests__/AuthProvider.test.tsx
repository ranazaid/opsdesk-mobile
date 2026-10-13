import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ApiProvider } from '@/api/ApiProvider';
import { createMockApi } from '@/api/mock/mockApi';
import { DEMO_PASSWORD } from '@/api/mock/seed';

import { AuthProvider, useAuth } from '../AuthProvider';
import { session } from '../session';
import { tokenStorage } from '../tokenStorage';

function Probe() {
  const { state, user, signIn, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{state.status === 'signedOut' && state.reason ? `${state.status}:${state.reason}` : state.status}</Text>
      <Text testID="user">{user ? `${user.name} (${user.role})` : 'none'}</Text>
      <Pressable testID="sign-in" onPress={() => void signIn('admin@opsdesk.demo', DEMO_PASSWORD)} />
      <Pressable testID="sign-out" onPress={() => void signOut()} />
    </>
  );
}

async function renderAuth(onSignedOut = jest.fn()) {
  const api = createMockApi({ getToken: session.getToken, onUnauthorized: session.notifyUnauthorized });
  await render(
    <ApiProvider api={api}>
      <AuthProvider onSignedOut={onSignedOut}>
        <Probe />
      </AuthProvider>
    </ApiProvider>,
  );
  return { api, onSignedOut };
}

beforeEach(async () => {
  session.setToken(null);
  await tokenStorage.clear();
});

describe('AuthProvider', () => {
  it('starts signed out without a stored session', async () => {
    await renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut'));
  });

  it('signs in, stores the token in secure storage and exposes the user role', async () => {
    await renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut'));

    await fireEvent.press(screen.getByTestId('sign-in'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Daniyal Ahmed (admin)'));
    expect(session.getToken()).toBe('demo.usr_admin');
    expect(await tokenStorage.load()).toMatchObject({ token: 'demo.usr_admin', user: { role: 'admin' } });
  });

  it('restores a persisted session on launch', async () => {
    await tokenStorage.save({
      token: 'demo.usr_viewer',
      user: { id: 'usr_viewer', name: 'Hamza Iqbal', email: 'viewer@opsdesk.demo', role: 'viewer', orgId: 'org_acme', orgName: 'Acme Logistics' },
    });
    await renderAuth();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Hamza Iqbal (viewer)'));
  });

  it('logs out automatically when the API returns 401, clearing storage and per-user data', async () => {
    const { api, onSignedOut } = await renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut'));
    await fireEvent.press(screen.getByTestId('sign-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedIn'));

    // Simulate the server revoking the token: the next request gets a 401.
    session.setToken('demo.revoked');
    await act(async () => {
      await expect(api.listTickets({})).rejects.toMatchObject({ kind: 'unauthorized' });
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut:expired'));
    expect(session.getToken()).toBeNull();
    expect(await tokenStorage.load()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('manual sign out clears the session', async () => {
    const { onSignedOut } = await renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut'));
    await fireEvent.press(screen.getByTestId('sign-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedIn'));

    await fireEvent.press(screen.getByTestId('sign-out'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signedOut:user'));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
