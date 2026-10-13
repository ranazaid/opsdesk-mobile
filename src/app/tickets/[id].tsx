import { useLocalSearchParams } from 'expo-router';

import { TicketDetailScreen } from '@/features/tickets/TicketDetailScreen';

export default function TicketRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TicketDetailScreen key={id} ticketId={id} />;
}
