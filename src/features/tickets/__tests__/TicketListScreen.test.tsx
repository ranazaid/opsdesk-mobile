import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { InfiniteData } from '@tanstack/react-query';

import type { TicketPage } from '@/api/schemas';

import { demoNetwork } from '@/offline/demoNetwork';
import { renderWithProviders } from '@/test-utils/renderWithProviders';

import { ticketKeys } from '../queryKeys';
import { TicketListScreen } from '../TicketListScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const rows = () => screen.queryAllByTestId(/^ticket-row-/);
const rowLabels = () => rows().map((row) => String(row.props.accessibilityLabel));

afterEach(() => {
  demoNetwork.setOffline(false);
});

describe('TicketListScreen', () => {
  it('renders the first page of tickets from the API', async () => {
    await renderWithProviders(<TicketListScreen />);

    expect(await screen.findByText('Invoices not syncing to QuickBooks')).toBeOnTheScreen();
    expect(rows()).toHaveLength(15);
    // Newest first, with status/priority in the accessible label.
    expect(rowLabels()[0]).toBe('Ticket 1001: Invoices not syncing to QuickBooks. Open, high priority');
  });

  it('filters by status chip', async () => {
    await renderWithProviders(<TicketListScreen />);
    await screen.findByText('Invoices not syncing to QuickBooks');

    await fireEvent.press(screen.getByTestId('filter-resolved'));

    await waitFor(() => expect(screen.queryByText('Invoices not syncing to QuickBooks')).not.toBeOnTheScreen());
    expect(await screen.findByText('SSO login loops back to sign-in page')).toBeOnTheScreen();
    expect(rows().length).toBeGreaterThan(0);
    expect(rowLabels().every((label) => label.includes('Resolved'))).toBe(true);
    expect(screen.getByTestId('filter-resolved').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('searches (debounced) and shows an empty state when nothing matches', async () => {
    await renderWithProviders(<TicketListScreen />);
    await screen.findByText('Invoices not syncing to QuickBooks');

    await fireEvent.changeText(screen.getByTestId('ticket-search'), 'webhook');
    await waitFor(() => expect(rows().length).toBeGreaterThan(0), { timeout: 2000 });
    await waitFor(() => expect(rowLabels().every((label) => label.toLowerCase().includes('webhook'))).toBe(true), { timeout: 2000 });

    await fireEvent.changeText(screen.getByTestId('ticket-search'), 'zzz-no-such-ticket');
    expect(await screen.findByText('No matching tickets', {}, { timeout: 2000 })).toBeOnTheScreen();
  });

  it('loads the next page when the list end is reached (infinite scroll)', async () => {
    const { api, queryClient } = await renderWithProviders(<TicketListScreen />);
    await screen.findByText('Invoices not syncing to QuickBooks');
    const listSpy = jest.spyOn(api, 'listTickets');
    const cached = () => queryClient.getQueryData<InfiniteData<TicketPage>>(ticketKeys.list({ status: null, q: '' }));
    expect(cached()?.pages).toHaveLength(1);

    await fireEvent(screen.getByTestId('ticket-list'), 'onEndReached');

    await waitFor(() => expect(cached()?.pages).toHaveLength(2));
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ cursor: '15' }), expect.anything());
    expect(cached()?.pages.flatMap((page) => page.items)).toHaveLength(30);
  });

  it('navigates to the ticket detail on press', async () => {
    await renderWithProviders(<TicketListScreen />);
    await fireEvent.press(await screen.findByText('Invoices not syncing to QuickBooks'));
    expect(mockPush).toHaveBeenCalledWith('/tickets/tkt_rs');
  });

  it('applies a status change queued offline immediately and marks the row as pending sync', async () => {
    const { outbox } = await renderWithProviders(<TicketListScreen />);
    await screen.findByText('Invoices not syncing to QuickBooks');
    await fireEvent.press(screen.getByTestId('filter-open'));
    await waitFor(() => expect(rowLabels().every((label) => label.includes('Open'))).toBe(true));
    const row = await screen.findByTestId('ticket-row-tkt_rs');
    expect(within(row).queryByLabelText('Waiting to sync')).not.toBeOnTheScreen();

    await act(async () => {
      demoNetwork.setOffline(true);
      await outbox.enqueue({ type: 'ticket.update', ticketId: 'tkt_rs', patch: { status: 'resolved' } });
    });

    // Optimistic overlay: the ticket leaves the "Open" list without a server round-trip.
    await waitFor(() => expect(screen.queryByTestId('ticket-row-tkt_rs')).not.toBeOnTheScreen());
    expect(await screen.findByTestId('offline-banner')).toBeOnTheScreen();
    expect(outbox.size).toBe(1);
  });
});
