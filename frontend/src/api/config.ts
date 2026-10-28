import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DEFAULT_BLOCK_MINUTES, DEFAULT_CITY_CENTER, DEFAULT_STEP_MINUTES } from '@/lib/env';
import type { AppConfig } from '@/types/api';
import { qk } from './keys';

export async function getConfig(): Promise<AppConfig> {
  const { data } = await api.get<AppConfig>('/config/');
  return data;
}

export function useConfig() {
  return useQuery({ queryKey: qk.config, queryFn: getConfig, staleTime: 5 * 60_000 });
}

/** Config values with contract defaults while loading or if `/config/` fails. */
export function useConfigValues() {
  const { data } = useConfig();
  return {
    blockMinutes: data?.booking_block_minutes ?? DEFAULT_BLOCK_MINUTES,
    stepMinutes: data?.slot_step_minutes ?? DEFAULT_STEP_MINUTES,
    cityCenter: data?.city_center ?? DEFAULT_CITY_CENTER,
    settings: data?.recommendation_settings,
    coverage: data?.coverage,
  };
}

export async function getHealth(): Promise<{ status: string }> {
  const { data } = await api.get<{ status: string }>('/health/');
  return data;
}
