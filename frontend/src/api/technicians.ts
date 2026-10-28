import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AvailabilitySlot,
  AvailabilityState,
  Paginated,
  Point,
  Review,
  TechnicianAvailability,
  TechnicianDetail,
  TechnicianMe,
  TechnicianSummary,
} from '@/types/api';
import { qk } from './keys';

export interface TechnicianListParams {
  category?: number;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export async function listTechnicians(params: TechnicianListParams): Promise<Paginated<TechnicianSummary>> {
  const { data } = await api.get<Paginated<TechnicianSummary>>('/technicians/', { params });
  return data;
}

export function useTechnicians(params: TechnicianListParams) {
  return useQuery({
    queryKey: qk.technicians(params),
    queryFn: () => listTechnicians(params),
    placeholderData: keepPreviousData,
  });
}

export async function getTechnician(id: number): Promise<TechnicianDetail> {
  const { data } = await api.get<TechnicianDetail>(`/technicians/${id}/`);
  return data;
}

export function useTechnician(id: number) {
  return useQuery({ queryKey: qk.technician(id), queryFn: () => getTechnician(id), enabled: id > 0 });
}

/** Normalizes a bare slot array (older shape) into `{slots, reserved}`. */
function normalizeAvailability(data: TechnicianAvailability | AvailabilitySlot[]): TechnicianAvailability {
  if (Array.isArray(data)) return { slots: data, reserved: [] };
  return { slots: data.slots ?? [], reserved: data.reserved ?? [] };
}

export async function getTechnicianAvailability(id: number, from?: string, to?: string) {
  const { data } = await api.get<TechnicianAvailability | AvailabilitySlot[]>(
    `/technicians/${id}/availability/`,
    {
      params: { from, to },
    },
  );
  return normalizeAvailability(data);
}

export function useTechnicianAvailability(id: number, from?: string, to?: string) {
  return useQuery({
    queryKey: qk.technicianAvailability(id, from, to),
    queryFn: () => getTechnicianAvailability(id, from, to),
    enabled: id > 0,
  });
}

export async function getTechnicianReviews(id: number, page = 1): Promise<Paginated<Review>> {
  const { data } = await api.get<Paginated<Review>>(`/technicians/${id}/reviews/`, { params: { page } });
  return data;
}

export function useTechnicianReviews(id: number, page = 1) {
  return useQuery({
    queryKey: qk.technicianReviews(id, page),
    queryFn: () => getTechnicianReviews(id, page),
    enabled: id > 0,
    placeholderData: keepPreviousData,
  });
}

// ---------- Self-service (technician) ----------
export async function getTechMe(): Promise<TechnicianMe> {
  const { data } = await api.get<TechnicianMe>('/technicians/me/');
  return data;
}

export function useTechMe(enabled = true) {
  return useQuery({ queryKey: qk.techMe, queryFn: getTechMe, enabled });
}

export interface TechMeBody {
  bio?: string;
  phone?: string;
  years_experience?: number;
  address?: string;
  location?: Point;
  service_category_ids?: number[];
}

export async function updateTechMe(body: TechMeBody): Promise<TechnicianMe> {
  const { data } = await api.patch<TechnicianMe>('/technicians/me/', body);
  return data;
}

export function useUpdateTechMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTechMe,
    onSuccess: (me) => {
      qc.setQueryData(qk.techMe, me);
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export async function getMyAvailability(from?: string, to?: string): Promise<AvailabilitySlot[]> {
  const { data } = await api.get<AvailabilitySlot[] | Paginated<AvailabilitySlot> | TechnicianAvailability>(
    '/technicians/me/availability/',
    { params: { from, to, page_size: 100 } },
  );
  if (Array.isArray(data)) return data;
  if ('slots' in data) return data.slots;
  return data.results ?? [];
}

export function useMyAvailability(from?: string, to?: string) {
  return useQuery({
    queryKey: qk.techMyAvailability(from, to),
    queryFn: () => getMyAvailability(from, to),
    placeholderData: keepPreviousData,
  });
}

export interface SlotBody {
  start: string;
  end: string;
  state: AvailabilityState;
}

export async function createSlot(body: SlotBody): Promise<AvailabilitySlot> {
  const { data } = await api.post<AvailabilitySlot>('/technicians/me/availability/', body);
  return data;
}

export async function updateSlot(id: number, body: Partial<SlotBody>): Promise<AvailabilitySlot> {
  const { data } = await api.patch<AvailabilitySlot>(`/technicians/me/availability/${id}/`, body);
  return data;
}

export async function deleteSlot(id: number): Promise<void> {
  await api.delete(`/technicians/me/availability/${id}/`);
}

export interface GenerateBody {
  weekdays: number[];
  start_time: string;
  end_time: string;
  from: string;
  to: string;
}

export async function generateSchedule(body: GenerateBody): Promise<{ created: number; skipped?: number }> {
  const { data } = await api.post<{ created: number; skipped?: number }>(
    '/technicians/me/availability/generate/',
    body,
  );
  return data;
}

function useInvalidateMyAvailability() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['technician', 'me', 'availability'] });
    qc.invalidateQueries({ queryKey: qk.techMe });
  };
}

export function useCreateSlot() {
  const invalidate = useInvalidateMyAvailability();
  return useMutation({ mutationFn: createSlot, onSuccess: invalidate });
}

export function useUpdateSlot() {
  const invalidate = useInvalidateMyAvailability();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<SlotBody> }) => updateSlot(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSlot() {
  const invalidate = useInvalidateMyAvailability();
  return useMutation({ mutationFn: deleteSlot, onSuccess: invalidate });
}

export function useGenerateSchedule() {
  const invalidate = useInvalidateMyAvailability();
  return useMutation({ mutationFn: generateSchedule, onSuccess: invalidate });
}
