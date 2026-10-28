import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category, Paginated } from '@/types/api';
import { qk } from './keys';

/** Contract says unpaginated array; accept a paginated envelope defensively. */
function unwrap<T>(data: T[] | Paginated<T>): T[] {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export async function getCategories(includeInactive = false): Promise<Category[]> {
  const { data } = await api.get<Category[] | Paginated<Category>>('/categories/', {
    params: includeInactive ? { include_inactive: true } : undefined,
  });
  return unwrap(data);
}

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: qk.categories(includeInactive),
    queryFn: () => getCategories(includeInactive),
    staleTime: 5 * 60_000,
  });
}

export type CategoryBody = Pick<Category, 'name' | 'description' | 'icon' | 'is_active'>;

export async function createCategory(body: CategoryBody): Promise<Category> {
  const { data } = await api.post<Category>('/categories/', body);
  return data;
}

export async function updateCategory(id: number, body: Partial<CategoryBody>): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}/`, body);
  return data;
}

export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/categories/${id}/`);
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['categories'] });
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: createCategory, onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CategoryBody> }) => updateCategory(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: deleteCategory, onSuccess: invalidate });
}
