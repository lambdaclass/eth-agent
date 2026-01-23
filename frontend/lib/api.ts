// API client for communicating with the backend
// This handles all wallet operations through REST API calls

import type {
  WalletState,
  Balance,
  LimitsStatus,
  Transaction,
  PendingApproval,
  WalletConfig,
  AddressEntry,
} from './wallet';
import type {
  Strategy,
  StrategyLog,
  StrategyTransaction,
  CreateStrategyRequest,
  StrategyDetailResponse,
  StrategyConfig,
} from './strategy-types';

const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Wallet endpoints
export const walletApi = {
  getState: () => fetchApi<WalletState>('/wallet'),
  getBalances: () =>
    fetchApi<Balance[]>('/wallet', {
      method: 'POST',
      body: JSON.stringify({ action: 'balances' }),
    }),
  getLimits: () => fetchApi<LimitsStatus>('/limits'),
  getConfig: () => fetchApi<WalletConfig>('/wallet/config'),
  updateConfig: (config: Partial<WalletConfig>) =>
    fetchApi<WalletConfig>('/wallet/config', {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),
};

// Transaction endpoints
export const transactionsApi = {
  getHistory: (params?: { limit?: number; offset?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return fetchApi<{ transactions: Transaction[]; total: number }>(
      `/transactions${query ? `?${query}` : ''}`
    );
  },
  getTransaction: (id: string) => fetchApi<Transaction>(`/transactions/${id}`),
};

// Approval endpoints
export const approvalsApi = {
  getPending: () => fetchApi<PendingApproval[]>('/approvals'),
  approve: (id: string) =>
    fetchApi<{ success: boolean }>('/approvals', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', id }),
    }),
  reject: (id: string, reason?: string) =>
    fetchApi<{ success: boolean }>('/approvals', {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', id, reason }),
    }),
};

// Limits endpoints
export const limitsApi = {
  get: () => fetchApi<LimitsStatus>('/limits'),
  update: (limits: { perTransaction?: string; perHour?: string; perDay?: string }) =>
    fetchApi<LimitsStatus>('/limits', {
      method: 'PATCH',
      body: JSON.stringify(limits),
    }),
};

// Address management endpoints
export const addressesApi = {
  getTrusted: () => fetchApi<AddressEntry[]>('/addresses/trusted'),
  addTrusted: (entry: Omit<AddressEntry, 'addedAt'>) =>
    fetchApi<AddressEntry>('/addresses/trusted', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
  removeTrusted: (address: string) =>
    fetchApi<{ success: boolean }>(`/addresses/trusted/${address}`, {
      method: 'DELETE',
    }),
  getBlocked: () => fetchApi<AddressEntry[]>('/addresses/blocked'),
  addBlocked: (entry: Omit<AddressEntry, 'addedAt'>) =>
    fetchApi<AddressEntry>('/addresses/blocked', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
  removeBlocked: (address: string) =>
    fetchApi<{ success: boolean }>(`/addresses/blocked/${address}`, {
      method: 'DELETE',
    }),
};

// Strategy endpoints
export type StrategyListItem = Omit<Strategy, 'privateKey'>;
export type StrategyDetail = Omit<StrategyDetailResponse, 'privateKey'>;

export const strategiesApi = {
  // List all strategies
  list: () =>
    fetchApi<{ strategies: StrategyListItem[] }>('/strategies'),

  // Get strategy details
  get: (id: string) =>
    fetchApi<StrategyDetail>(`/strategies/${id}`),

  // Create a new strategy
  create: (data: CreateStrategyRequest) =>
    fetchApi<StrategyListItem>('/strategies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Delete a strategy
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/strategies/${id}`, {
      method: 'DELETE',
    }),

  // Start a strategy
  start: (id: string) =>
    fetchApi<{ success: boolean; status: string }>(`/strategies/${id}/start`, {
      method: 'POST',
    }),

  // Pause a running strategy
  pause: (id: string) =>
    fetchApi<{ success: boolean; status: string }>(`/strategies/${id}/pause`, {
      method: 'POST',
    }),

  // Resume a paused strategy
  resume: (id: string) =>
    fetchApi<{ success: boolean; status: string }>(`/strategies/${id}/resume`, {
      method: 'POST',
    }),

  // Stop a strategy
  stop: (id: string) =>
    fetchApi<{ success: boolean; status: string }>(`/strategies/${id}/stop`, {
      method: 'POST',
    }),

  // Get logs (non-streaming)
  getLogs: (id: string) =>
    fetchApi<{ logs: StrategyLog[] }>(`/strategies/${id}/logs`),

  // Create SSE event source for streaming logs
  createLogsStream: (id: string): EventSource => {
    return new EventSource(`/api/strategies/${id}/logs`);
  },
};
