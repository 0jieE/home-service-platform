import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminCoverage,
  AdminDispute,
  AdminStats,
  Application,
  ApplicationStatus,
  CreateAccountResponse,
  DisputeDecision,
  DisputeStatus,
  Paginated,
  RecSettings,
  Role,
  User,
  Verification,
  VerificationMethod,
  VerificationOutcome,
} from '@/types/api';
import { qk } from './keys';

// ---------- Stats ----------
export async function getStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>('/admin/stats/');
  return data;
}

export function useAdminStats(enabled = true) {
  return useQuery({ queryKey: qk.admin.stats, queryFn: getStats, enabled });
}

// ---------- Applications ----------
export interface ApplicationListParams {
  status?: ApplicationStatus;
  search?: string;
  page?: number;
}

export async function listApplications(params: ApplicationListParams): Promise<Paginated<Application>> {
  const { data } = await api.get<Paginated<Application>>('/admin/applications/', { params });
  return data;
}

export function useApplications(params: ApplicationListParams) {
  return useQuery({
    queryKey: qk.admin.applications(params),
    queryFn: () => listApplications(params),
    placeholderData: keepPreviousData,
  });
}

export async function getApplication(id: number): Promise<Application> {
  const { data } = await api.get<Application>(`/admin/applications/${id}/`);
  return data;
}

export function useApplication(id: number) {
  return useQuery({ queryKey: qk.admin.application(id), queryFn: () => getApplication(id), enabled: id > 0 });
}

export interface ApplicationBody {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  requested_category_ids: number[];
  notes: string;
}

export async function createApplication(body: ApplicationBody): Promise<Application> {
  const { data } = await api.post<Application>('/admin/applications/', body);
  return data;
}

export async function updateApplication(
  id: number,
  body: Partial<ApplicationBody> & { status?: 'under_review' },
): Promise<Application> {
  const { data } = await api.patch<Application>(`/admin/applications/${id}/`, body);
  return data;
}

export interface VerificationBody {
  credential_type: string;
  method: VerificationMethod;
  outcome: VerificationOutcome;
  checked_on: string;
  notes: string;
}

export async function addVerification(id: number, body: VerificationBody): Promise<Verification> {
  const { data } = await api.post<Verification>(`/admin/applications/${id}/verifications/`, body);
  return data;
}

export async function approveApplication(id: number): Promise<Application> {
  const { data } = await api.post<Application>(`/admin/applications/${id}/approve/`, {});
  return data;
}

export async function rejectApplication(id: number, reason: string): Promise<Application> {
  const { data } = await api.post<Application>(`/admin/applications/${id}/reject/`, { reason });
  return data;
}

export async function createTechnicianAccount(id: number): Promise<CreateAccountResponse> {
  const { data } = await api.post<CreateAccountResponse>(`/admin/applications/${id}/create-account/`, {});
  return data;
}

function useInvalidateApplications() {
  const qc = useQueryClient();
  return (id?: number) => {
    qc.invalidateQueries({ queryKey: ['admin', 'applications'] });
    if (id) qc.invalidateQueries({ queryKey: qk.admin.application(id) });
    qc.invalidateQueries({ queryKey: qk.admin.stats });
  };
}

export function useCreateApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({ mutationFn: createApplication, onSuccess: () => invalidate() });
}

export function useUpdateApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Partial<ApplicationBody> & { status?: 'under_review' };
    }) => updateApplication(id, body),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

export function useAddVerification() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: VerificationBody }) => addVerification(id, body),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

export function useApproveApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({ mutationFn: approveApplication, onSuccess: (_d, id) => invalidate(id) });
}

export function useRejectApplication() {
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectApplication(id, reason),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

/** New code for an account that has not been activated yet (CONTRACT_CHANGES); old unused codes stop working. */
export async function reissueActivationCode(id: number): Promise<CreateAccountResponse> {
  const { data } = await api.post<CreateAccountResponse>(`/admin/applications/${id}/reissue-code/`, {});
  return data;
}

export function useReissueActivationCode() {
  return useMutation({ mutationFn: reissueActivationCode });
}

export function useCreateTechnicianAccount() {
  const invalidate = useInvalidateApplications();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTechnicianAccount,
    onSuccess: (_d, id) => {
      invalidate(id);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

// ---------- Users ----------
export interface UserListParams {
  role?: Role;
  search?: string;
  is_active?: boolean;
  page?: number;
}

export async function listUsers(params: UserListParams): Promise<Paginated<User>> {
  const { data } = await api.get<Paginated<User>>('/admin/users/', { params });
  return data;
}

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: qk.admin.users(params),
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });
}

export async function setUserActive(id: number, is_active: boolean): Promise<User> {
  const { data } = await api.patch<User>(`/admin/users/${id}/`, { is_active });
  return data;
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => setUserActive(id, is_active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: qk.admin.stats });
    },
  });
}

// ---------- Disputes ----------
export interface DisputeListParams {
  status?: DisputeStatus;
  page?: number;
}

export async function listDisputes(params: DisputeListParams): Promise<Paginated<AdminDispute>> {
  const { data } = await api.get<Paginated<AdminDispute>>('/admin/disputes/', { params });
  return data;
}

export function useDisputes(params: DisputeListParams) {
  return useQuery({
    queryKey: qk.admin.disputes(params),
    queryFn: () => listDisputes(params),
    placeholderData: keepPreviousData,
  });
}

export async function resolveDispute(
  id: number,
  body: { decision: DisputeDecision; admin_notes: string },
): Promise<AdminDispute> {
  const { data } = await api.post<AdminDispute>(`/admin/disputes/${id}/resolve/`, body);
  return data;
}

export function useResolveDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { decision: DisputeDecision; admin_notes: string } }) =>
      resolveDispute(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking'] });
    },
  });
}

// ---------- Recommendation settings ----------
export async function getRecSettings(): Promise<RecSettings> {
  const { data } = await api.get<RecSettings>('/admin/recommendation-settings/');
  return data;
}

export function useRecSettings() {
  return useQuery({ queryKey: qk.admin.recSettings, queryFn: getRecSettings });
}

export async function updateRecSettings(body: Partial<RecSettings>): Promise<RecSettings> {
  const { data } = await api.patch<RecSettings>('/admin/recommendation-settings/', body);
  return data;
}

export function useUpdateRecSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRecSettings,
    onSuccess: (s) => {
      qc.setQueryData(qk.admin.recSettings, s);
      qc.invalidateQueries({ queryKey: qk.config });
    },
  });
}

// ---------- Coverage ----------
export async function getAdminCoverage(): Promise<AdminCoverage> {
  const { data } = await api.get<AdminCoverage>('/admin/coverage/');
  return data;
}

export function useAdminCoverage(enabled = true) {
  return useQuery({ queryKey: qk.admin.coverage, queryFn: getAdminCoverage, enabled });
}
