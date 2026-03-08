/**
 * Data fetching hook for Spark Pulse.
 * Abstracts the data source — components never know where data comes from.
 * Today: FastAPI backend. Tomorrow: could add caching, SSE, etc.
 */

"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/pulse/api";

interface PulseQueryConfig {
  endpoint: string;
  params?: Record<string, string | number | string[]>;
}

export function usePulseQuery<T = unknown>(
  queryKey: string[],
  config: PulseQueryConfig,
  options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">
) {
  return useQuery<T>({
    queryKey: ["pulse", ...queryKey, config.params],
    queryFn: async () => {
      const url = new URL(`${API_BASE}/${config.endpoint}`, window.location.origin);
      if (config.params) {
        for (const [key, value] of Object.entries(config.params)) {
          if (Array.isArray(value)) {
            value.forEach((v) => url.searchParams.append(key, v));
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    ...options,
  });
}
