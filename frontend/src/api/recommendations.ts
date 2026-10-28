import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RecommendationResponse } from '@/types/api';
import { qk } from './keys';

export interface RecommendationParams {
  category: number;
  lat: number;
  lng: number;
  start: string;
  end?: string;
}

export async function getRecommendations(params: RecommendationParams): Promise<RecommendationResponse> {
  const { data } = await api.get<RecommendationResponse>('/recommendations/', { params });
  return data;
}

export function useRecommendations(params: RecommendationParams | null) {
  return useQuery({
    queryKey: qk.recommendations(params ?? {}),
    queryFn: () => getRecommendations(params!),
    enabled: params !== null,
    staleTime: 15_000,
  });
}
