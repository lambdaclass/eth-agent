'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { strategiesApi, type StrategyListItem, type StrategyDetail } from '@/lib/api';
import type { CreateStrategyRequest } from '@/lib/strategy-types';

export function useStrategies() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['strategies'],
    queryFn: async () => {
      const response = await strategiesApi.list();
      return response.strategies;
    },
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateStrategyRequest) => strategiesApi.create(data),
    onSuccess: (newStrategy) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        [newStrategy, ...(old ?? [])]
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        old?.filter((s) => s.id !== id) ?? []
      );
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.start(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, status: 'running' as const } : s)) ?? []
      );
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.pause(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, status: 'paused' as const } : s)) ?? []
      );
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.resume(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, status: 'running' as const } : s)) ?? []
      );
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.stop(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<StrategyListItem[]>(['strategies'], (old) =>
        old?.map((s) => (s.id === id ? { ...s, status: 'stopped' as const } : s)) ?? []
      );
    },
  });

  return {
    strategies: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,

    // Mutations
    create: (data: CreateStrategyRequest) => createMutation.mutateAsync(data),
    delete: (id: string) => deleteMutation.mutate(id),
    start: (id: string) => startMutation.mutate(id),
    pause: (id: string) => pauseMutation.mutate(id),
    resume: (id: string) => resumeMutation.mutate(id),
    stop: (id: string) => stopMutation.mutate(id),

    // Loading states
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isStopping: stopMutation.isPending,
    isMutating:
      createMutation.isPending ||
      deleteMutation.isPending ||
      startMutation.isPending ||
      pauseMutation.isPending ||
      resumeMutation.isPending ||
      stopMutation.isPending,
  };
}

export function useStrategy(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['strategy', id],
    queryFn: () => strategiesApi.get(id),
    refetchInterval: 5000, // Poll every 5 seconds for live data
  });

  const startMutation = useMutation({
    mutationFn: () => strategiesApi.start(id),
    onSuccess: () => {
      queryClient.setQueryData<StrategyDetail>(['strategy', id], (old) =>
        old ? { ...old, status: 'running' as const } : old
      );
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => strategiesApi.pause(id),
    onSuccess: () => {
      queryClient.setQueryData<StrategyDetail>(['strategy', id], (old) =>
        old ? { ...old, status: 'paused' as const } : old
      );
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => strategiesApi.resume(id),
    onSuccess: () => {
      queryClient.setQueryData<StrategyDetail>(['strategy', id], (old) =>
        old ? { ...old, status: 'running' as const } : old
      );
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => strategiesApi.stop(id),
    onSuccess: () => {
      queryClient.setQueryData<StrategyDetail>(['strategy', id], (old) =>
        old ? { ...old, status: 'stopped' as const } : old
      );
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => strategiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
    },
  });

  return {
    strategy: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,

    // Mutations
    start: () => startMutation.mutate(),
    pause: () => pauseMutation.mutate(),
    resume: () => resumeMutation.mutate(),
    stop: () => stopMutation.mutate(),
    delete: () => deleteMutation.mutateAsync(),

    // Loading states
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    isStopping: stopMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isMutating:
      startMutation.isPending ||
      pauseMutation.isPending ||
      resumeMutation.isPending ||
      stopMutation.isPending ||
      deleteMutation.isPending,
  };
}
