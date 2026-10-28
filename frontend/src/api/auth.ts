import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, authClient } from '@/lib/api';
import type { CustomerProfile, TokenResponse, User } from '@/types/api';
import { qk } from './keys';

export interface RegisterBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export async function register(body: RegisterBody): Promise<User> {
  const { data } = await authClient.post<User>('/auth/register/', body);
  return data;
}

export async function obtainToken(email: string, password: string): Promise<TokenResponse> {
  const { data } = await authClient.post<TokenResponse>('/auth/token/', { email, password });
  return data;
}

export async function logout(refresh: string): Promise<void> {
  await api.post('/auth/logout/', { refresh });
}

export interface ActivateBody {
  email: string;
  activation_code: string;
  password: string;
}

export async function activate(body: ActivateBody): Promise<{ detail: string }> {
  const { data } = await authClient.post<{ detail: string }>('/auth/activate/', body);
  return data;
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me/');
  return data;
}

export async function updateMe(body: Partial<Pick<User, 'first_name' | 'last_name' | 'phone'>>): Promise<User> {
  const { data } = await api.patch<User>('/auth/me/', body);
  return data;
}

export async function changePassword(body: { old_password: string; new_password: string }): Promise<void> {
  await api.post('/auth/change-password/', body);
}

export function useRegister() {
  return useMutation({ mutationFn: register });
}

export function useActivate() {
  return useMutation({ mutationFn: activate });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (user) => qc.setQueryData(qk.me, user),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

// ---------- Customer profile ----------
export async function getCustomerMe(): Promise<CustomerProfile> {
  const { data } = await api.get<CustomerProfile>('/customers/me/');
  return data;
}

export async function updateCustomerMe(body: Partial<CustomerProfile>): Promise<CustomerProfile> {
  const { data } = await api.patch<CustomerProfile>('/customers/me/', body);
  return data;
}

export function useCustomerMe(enabled = true) {
  return useQuery({ queryKey: qk.customerMe, queryFn: getCustomerMe, enabled });
}

export function useUpdateCustomerMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCustomerMe,
    onSuccess: (profile) => qc.setQueryData(qk.customerMe, profile),
  });
}
