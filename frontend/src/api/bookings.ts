import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSocketConnected } from '@/lib/ws';
import type { Booking, BookingAction, BookingStatus, Paginated, Point, Review } from '@/types/api';
import { qk } from './keys';

/** Polling fallback when the realtime socket is down (contract §4). */
const FALLBACK_POLL_MS = 30_000;

export interface BookingListParams {
  status?: BookingStatus[];
  upcoming?: boolean;
  page?: number;
  page_size?: number;
  /** CONTRACT_CHANGES: start | -start | created_at | -created_at (default newest first). */
  ordering?: 'start' | '-start' | 'created_at' | '-created_at';
}

export async function listBookings(params: BookingListParams = {}): Promise<Paginated<Booking>> {
  const { data } = await api.get<Paginated<Booking>>('/bookings/', { params });
  return data;
}

export function useBookings(params: BookingListParams = {}, enabled = true) {
  const live = useSocketConnected();
  return useQuery({
    queryKey: qk.bookings(params),
    queryFn: () => listBookings(params),
    placeholderData: keepPreviousData,
    refetchInterval: live ? false : FALLBACK_POLL_MS,
    enabled,
  });
}

export async function getBooking(id: number): Promise<Booking> {
  const { data } = await api.get<Booking>(`/bookings/${id}/`);
  return data;
}

export function useBooking(id: number) {
  const live = useSocketConnected();
  return useQuery({
    queryKey: qk.booking(id),
    queryFn: () => getBooking(id),
    enabled: id > 0,
    refetchInterval: live ? false : FALLBACK_POLL_MS,
  });
}

export interface CreateBookingBody {
  technician_id: number;
  category_id: number;
  location: Point;
  address: string;
  start: string;
  end?: string;
  notes: string;
}

export async function createBooking(body: CreateBookingBody): Promise<Booking> {
  const { data } = await api.post<Booking>('/bookings/', body);
  return data;
}

/** Invalidates every booking-related view (lists, detail, dashboards). */
export function invalidateBookingQueries(qc: QueryClient, id?: number) {
  qc.invalidateQueries({ queryKey: ['bookings'] });
  if (id !== undefined) qc.invalidateQueries({ queryKey: qk.booking(id) });
  qc.invalidateQueries({ queryKey: qk.techMe });
  qc.invalidateQueries({ queryKey: ['technician'] });
  qc.invalidateQueries({ queryKey: qk.admin.stats });
  qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
  qc.invalidateQueries({ queryKey: ['recommendations'] });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: (booking) => {
      qc.setQueryData(qk.booking(booking.id), booking);
      invalidateBookingQueries(qc);
    },
  });
}

type ActionPath = Exclude<BookingAction, 'review'>;
const ACTION_PATHS: Record<ActionPath, string> = {
  accept: 'accept',
  decline: 'decline',
  cancel: 'cancel',
  start: 'start',
  request_completion: 'request-completion',
  confirm_completion: 'confirm-completion',
  dispute: 'dispute',
};

export async function bookingAction(
  id: number,
  action: ActionPath,
  body: { reason?: string; notes?: string } = {},
): Promise<Booking> {
  const { data } = await api.post<Booking>(`/bookings/${id}/${ACTION_PATHS[action]}/`, body);
  return data;
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: number;
      action: ActionPath;
      body?: { reason?: string; notes?: string };
    }) => bookingAction(id, action, body),
    onSuccess: (booking) => {
      if (booking && typeof booking === 'object' && 'id' in booking)
        qc.setQueryData(qk.booking(booking.id), booking);
      invalidateBookingQueries(qc, booking?.id);
    },
    onError: (_err, vars) => {
      // status may have changed under us (invalid_transition / conflicts) — refresh the truth
      invalidateBookingQueries(qc, vars.id);
    },
  });
}

export async function createReview(id: number, body: { rating: number; comment: string }): Promise<Review> {
  const { data } = await api.post<Review>(`/bookings/${id}/review/`, body);
  return data;
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { rating: number; comment: string } }) =>
      createReview(id, body),
    onSuccess: (_review, vars) => invalidateBookingQueries(qc, vars.id),
  });
}
