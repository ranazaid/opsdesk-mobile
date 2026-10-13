import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { TICKET_STATUSES, type Ticket, type TicketStatus } from '@/api/schemas';
import { useAuth } from '@/auth/AuthProvider';
import { SyncBanner } from '@/components/tickets/SyncBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSync } from '@/offline/SyncProvider';
import { can } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';
import { STATUS_LABELS } from '@/theme/tokens';

import { useTicketList } from './hooks';

type StatusFilter = TicketStatus | null;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: null, label: 'All' },
  ...TICKET_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

export function TicketListScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const { user } = useAuth();
  const { entries, syncNow } = useSync();
  const [status, setStatus] = useState<StatusFilter>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);

  const filters = useMemo(() => ({ status, q }), [status, q]);
  const { tickets, isPending, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useTicketList(filters);
  const [manualRefresh, setManualRefresh] = useState(false);

  const pendingTicketIds = useMemo(() => new Set(entries.map((entry) => entry.op.ticketId)), [entries]);

  const openTicket = useCallback((ticket: Ticket) => router.push(`/tickets/${ticket.id}`), [router]);

  const onRefresh = useCallback(async () => {
    setManualRefresh(true);
    try {
      await Promise.all([syncNow({ ignoreBackoff: true }), refetch()]);
    } finally {
      setManualRefresh(false);
    }
  }, [refetch, syncNow]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: Ticket }) => <TicketRow ticket={item} pendingSync={pendingTicketIds.has(item.id)} onPress={openTicket} />,
    [openTicket, pendingTicketIds],
  );

  const canCreate = can(user?.role, 'ticket.create');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SyncBanner />
      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.search, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
          <Ionicons name="search" size={16} color={colors.textSubtle} />
          <TextInput
            testID="ticket-search"
            accessibilityLabel="Search tickets"
            value={search}
            onChangeText={setSearch}
            placeholder="Search subject, customer or #number"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((filter) => (
            <Chip
              key={filter.label}
              testID={`filter-${filter.value ?? 'all'}`}
              label={filter.label}
              selected={status === filter.value}
              onPress={() => setStatus(filter.value)}
            />
          ))}
        </ScrollView>
      </View>

      {isPending ? (
        <LoadingState label="Loading tickets…" />
      ) : isError && tickets.length === 0 ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          testID="ticket-list"
          data={tickets}
          keyExtractor={(ticket) => ticket.id}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          initialNumToRender={15}
          refreshControl={<RefreshControl refreshing={manualRefresh} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={q ? 'search-outline' : 'checkmark-done-outline'}
              title={q ? 'No matching tickets' : status ? `No ${STATUS_LABELS[status].toLowerCase()} tickets` : 'No tickets yet'}
              message={q ? `Nothing matches "${q}". Try a different search or filter.` : 'New tickets from your customers will show up here.'}
              actionLabel={canCreate && !q ? 'Create ticket' : undefined}
              onAction={canCreate && !q ? () => router.push('/tickets/new') : undefined}
            />
          }
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null}
          contentContainerStyle={tickets.length === 0 ? styles.emptyContainer : undefined}
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { paddingTop: 10, paddingBottom: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  chips: { paddingHorizontal: 16, gap: 8 },
  footer: { paddingVertical: 20 },
  emptyContainer: { flexGrow: 1 },
});
