'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '@/lib/api';
import type { WalletState, Balance, WalletConfig } from '@/lib/wallet';

export function useWallet() {
  return useQuery<WalletState>({
    queryKey: ['wallet'],
    queryFn: walletApi.getState,
  });
}

export function useBalances() {
  return useQuery<Balance[]>({
    queryKey: ['balances'],
    queryFn: walletApi.getBalances,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useWalletConfig() {
  const queryClient = useQueryClient();

  const query = useQuery<WalletConfig>({
    queryKey: ['walletConfig'],
    queryFn: walletApi.getConfig,
  });

  const mutation = useMutation({
    mutationFn: walletApi.updateConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['walletConfig'], data);
    },
  });

  return {
    ...query,
    updateConfig: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
