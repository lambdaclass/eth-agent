'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { limitsApi } from '@/lib/api';
import type { LimitsStatus } from '@/lib/wallet';

export function useLimits() {
  const queryClient = useQueryClient();

  const query = useQuery<LimitsStatus>({
    queryKey: ['limits'],
    queryFn: limitsApi.get,
    refetchInterval: 60000, // Refresh every minute
  });

  const mutation = useMutation({
    mutationFn: limitsApi.update,
    onSuccess: (data) => {
      queryClient.setQueryData(['limits'], data);
    },
  });

  return {
    limits: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateLimits: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
