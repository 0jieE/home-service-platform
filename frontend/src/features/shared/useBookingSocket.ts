import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getBooking, invalidateBookingQueries } from '@/api/bookings';
import { qk } from '@/api/keys';
import { refreshAccessToken } from '@/lib/api';
import { ReconnectingSocket } from '@/lib/ws';
import { tokenStorage } from '@/auth/tokenStorage';
import { useAuth } from '@/auth/useAuth';
import type { BookingUpdatedMessage } from '@/types/api';
import { bookingEventMessage } from './bookingMessages';

function isBookingUpdated(data: unknown): data is BookingUpdatedMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === 'booking.updated' &&
    typeof (data as { booking_id?: unknown }).booking_id === 'number'
  );
}

/**
 * Mounted once in the authenticated shell. Never trusts the payload as state:
 * invalidates queries, refetches the booking and toasts in plain language.
 */
export function useBookingSocket() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!userId || !role) return;
    const socket = new ReconnectingSocket({
      path: '/bookings/',
      getToken: tokenStorage.getAccess,
      onUnauthorized: refreshAccessToken,
      onMessage: async (data) => {
        if (!isBookingUpdated(data)) return;
        invalidateBookingQueries(qc, data.booking_id);
        // Don't toast about your own action — the UI already confirmed it.
        if (data.actor_role === role && role !== 'admin') return;
        if (role === 'admin' && data.actor_role === 'admin') return;
        try {
          const booking = await qc.fetchQuery({
            queryKey: qk.booking(data.booking_id),
            queryFn: () => getBooking(data.booking_id),
            staleTime: 0,
          });
          toast.info(bookingEventMessage(data.event, booking, role), {
            id: `booking-${data.booking_id}-${data.event}`,
          });
        } catch {
          toast.info(`Booking #${data.booking_id} was updated`);
        }
      },
    });
    socket.start();

    // Reconnect with the fresh token whenever it rotates.
    let last = tokenStorage.getAccess();
    const unsubscribe = tokenStorage.subscribe((access) => {
      if (access && access !== last) socket.restart();
      last = access;
    });
    return () => {
      unsubscribe();
      socket.stop();
    };
  }, [qc, userId, role]);
}
