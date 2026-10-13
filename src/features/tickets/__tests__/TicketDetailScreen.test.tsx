import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { demoNetwork } from '@/offline/demoNetwork';
import { renderWithProviders } from '@/test-utils/renderWithProviders';

import { TicketDetailScreen } from '../TicketDetailScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));

const TICKET_ID = 'tkt_rs'; // #1001 "Invoices not syncing to QuickBooks", open, assigned to Ayesha (agent)

afterEach(() => {
  demoNetwork.setOffline(false);
});

async function renderAs(role: 'viewer' | 'agent' | 'admin') {
  const utils = await renderWithProviders(<TicketDetailScreen ticketId={TICKET_ID} />, { role });
  await screen.findByText('Invoices not syncing to QuickBooks');
  return utils;
}

describe('TicketDetailScreen role-aware UI', () => {
  it('viewer: read-only, no composer, no AI, no status controls', async () => {
    await renderAs('viewer');
    expect(await screen.findByTestId('read-only-notice')).toBeOnTheScreen();
    expect(screen.queryByTestId('reply-input')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('status-control')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('ai-summary-card')).not.toBeOnTheScreen();
  });

  it('agent: can change status and reply, but cannot reassign', async () => {
    await renderAs('agent');
    expect(await screen.findByTestId('status-control')).toBeOnTheScreen();
    expect(screen.getByTestId('reply-input')).toBeOnTheScreen();
    expect(screen.queryByTestId('reassign-button')).not.toBeOnTheScreen();
    expect(screen.getByText('Admins can reassign')).toBeOnTheScreen();
  });

  it('admin: can reassign the ticket to a teammate', async () => {
    const { api } = await renderAs('admin');
    await fireEvent.press(await screen.findByTestId('reassign-button'));
    await fireEvent.press(await screen.findByLabelText('Assign to Bilal Hussain'));

    await waitFor(() => expect(api.db.tickets.find((t) => t.id === TICKET_ID)?.assignee?.name).toBe('Bilal Hussain'));
    expect(await screen.findByText('Bilal Hussain')).toBeOnTheScreen();
  });
});

describe('TicketDetailScreen offline-first writes', () => {
  it('shows a reply immediately while offline and syncs it on reconnect', async () => {
    const { api, outbox } = await renderAs('agent');
    await screen.findByTestId('status-control');

    await act(async () => demoNetwork.setOffline(true));
    await fireEvent.changeText(screen.getByTestId('reply-input'), 'Re-authorised the connection, please retry.');
    await fireEvent.press(screen.getByTestId('reply-send'));

    expect(await screen.findByTestId('pending-comment')).toBeOnTheScreen();
    expect(screen.getByText('Waiting to sync')).toBeOnTheScreen();
    expect(outbox.size).toBe(1);

    await act(async () => demoNetwork.setOffline(false));

    await waitFor(() => expect(outbox.size).toBe(0));
    await waitFor(() => expect(screen.queryByTestId('pending-comment')).not.toBeOnTheScreen());
    expect(screen.getByText('Re-authorised the connection, please retry.')).toBeOnTheScreen();
    expect(api.db.comments.filter((c) => c.body === 'Re-authorised the connection, please retry.')).toHaveLength(1);
  });

  it('applies a status change optimistically and persists it to the server', async () => {
    const { api } = await renderAs('agent');
    await fireEvent.press(await screen.findByTestId('status-control-resolved'));

    expect(screen.getByTestId('status-control-resolved').props.accessibilityState).toMatchObject({ selected: true });
    await waitFor(() => expect(api.db.tickets.find((t) => t.id === TICKET_ID)?.status).toBe('resolved'));
  });

  it('generates an AI summary with a suggested reply that can be used as the draft', async () => {
    await renderAs('agent');
    await fireEvent.press(await screen.findByTestId('ai-summary-button'));

    expect(await screen.findByText(/^Imran Siddiqui reports:/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Use as reply'));
    expect(screen.getByTestId('reply-input').props.value).toMatch(/^Hi Imran,/);
  });
});
