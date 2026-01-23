'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '@/lib/api';
import type { PendingApproval } from '@/lib/wallet';

export function useApprovals() {
  const queryClient = useQueryClient();

  const query = useQuery<PendingApproval[]>({
    queryKey: ['approvals'],
    queryFn: approvalsApi.getPending,
    refetchInterval: 5000, // Poll every 5 seconds for new approvals
  });

  const approveMutation = useMutation({
    mutationFn: approvalsApi.approve,
    onSuccess: (_, id) => {
      queryClient.setQueryData<PendingApproval[]>(['approvals'], (old) =>
        old?.filter((a) => a.id !== id) ?? []
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      approvalsApi.reject(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.setQueryData<PendingApproval[]>(['approvals'], (old) =>
        old?.filter((a) => a.id !== id) ?? []
      );
    },
  });

  return {
    approvals: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    approve: (id: string) => approveMutation.mutate(id),
    reject: (id: string, reason?: string) => rejectMutation.mutate({ id, reason }),
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
  };
}
