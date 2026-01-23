'use client';

import { useQuery } from '@tanstack/react-query';
import { transactionsApi } from '@/lib/api';
import type { Transaction } from '@/lib/wallet';

interface UseTransactionsOptions {
  limit?: number;
  offset?: number;
  status?: string;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const { limit = 50, offset = 0, status } = options;

  return useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ['transactions', { limit, offset, status }],
    queryFn: () => transactionsApi.getHistory({ limit, offset, status }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useTransaction(id: string) {
  return useQuery<Transaction>({
    queryKey: ['transaction', id],
    queryFn: () => transactionsApi.getTransaction(id),
    enabled: !!id,
  });
}
