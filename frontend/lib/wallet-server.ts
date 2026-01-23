// Server-side wallet management
// This module creates and manages the AgentWallet instance

import { AgentWallet, USDC, USDT, DAI, USDS } from '@lambdaclass/eth-agent';
import type { PendingApproval } from './wallet';
import { getSettings } from './settings-store';

// Store for pending approvals and their resolve callbacks
interface PendingApprovalInternal extends PendingApproval {
  resolve: (approved: boolean) => void;
}

const pendingApprovals = new Map<string, PendingApprovalInternal>();

// Singleton wallet instance
let walletInstance: AgentWallet | null = null;

// Parse limit values from env (remove "USDC" suffix if present)
const parseLimit = (val: string | undefined, defaultVal: number): number => {
  if (!val) return defaultVal;
  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? defaultVal : num;
};

function createWallet(rpcUrl: string): AgentWallet {
  const privateKey = process.env.ETH_PRIVATE_KEY;
  console.log('[wallet-server] ETH_PRIVATE_KEY present:', !!privateKey);
  console.log('[wallet-server] ETH_PRIVATE_KEY length:', privateKey?.length);

  if (!privateKey) {
    throw new Error('ETH_PRIVATE_KEY environment variable is required');
  }

  console.log('[wallet-server] Creating AgentWallet with RPC:', rpcUrl);

  return AgentWallet.create({
    privateKey,
    rpcUrl,
    limits: {
      // ETH limits (in ETH)
      perTransaction: '1', // 1 ETH per transaction
      perHour: '5', // 5 ETH per hour
      perDay: '20', // 20 ETH per day
      // Stablecoin limits (in USD)
      stablecoin: {
        perTransactionUSD: parseLimit(process.env.LIMIT_PER_TX, 1000),
        perHourUSD: parseLimit(process.env.LIMIT_PER_HOUR, 5000),
        perDayUSD: parseLimit(process.env.LIMIT_PER_DAY, 20000),
      },
    },
    onApprovalRequired: async (request) => {
      // Create a pending approval entry
      const id = crypto.randomUUID();
      const settings = getSettings();

      return new Promise<boolean>((resolve) => {
        const approval: PendingApprovalInternal = {
          id,
          type: 'transfer',
          to: request.details.to || '',
          toLabel: undefined,
          amount: request.details.value?.eth || '0',
          token: 'ETH',
          reason: request.summary,
          riskLevel: request.details.risk || 'medium',
          requestedAt: Date.now(),
          expiresAt: Date.now() + (settings.approvalTimeoutMinutes * 60 * 1000),
          resolve,
        };

        pendingApprovals.set(id, approval);

        // Set up timeout
        setTimeout(() => {
          if (pendingApprovals.has(id)) {
            pendingApprovals.delete(id);
            resolve(false); // Reject on timeout
          }
        }, settings.approvalTimeoutMinutes * 60 * 1000);
      });
    },
  });
}

export function getWallet(): AgentWallet {
  if (!walletInstance) {
    const settings = getSettings();

    console.log('[wallet-server] Creating AgentWallet...');
    try {
      walletInstance = createWallet(settings.rpcUrl);
      console.log('[wallet-server] AgentWallet created successfully, address:', walletInstance.address);
    } catch (createError) {
      console.error('[wallet-server] Failed to create AgentWallet:', createError);
      throw createError;
    }
  }

  return walletInstance;
}

// Reinitialize the wallet with new settings (e.g., new RPC URL for different chain)
export function reinitializeWallet(): AgentWallet {
  const settings = getSettings();
  console.log('[wallet-server] Reinitializing wallet with new settings...');

  try {
    walletInstance = createWallet(settings.rpcUrl);
    console.log('[wallet-server] Wallet reinitialized successfully, address:', walletInstance.address);
    return walletInstance;
  } catch (error) {
    console.error('[wallet-server] Failed to reinitialize wallet:', error);
    throw error;
  }
}

export function getPendingApprovals(): PendingApproval[] {
  return Array.from(pendingApprovals.values()).map(({ resolve, ...approval }) => approval);
}

export function approveTransaction(id: string): boolean {
  const approval = pendingApprovals.get(id);
  if (approval) {
    approval.resolve(true);
    pendingApprovals.delete(id);
    return true;
  }
  return false;
}

export function rejectTransaction(id: string): boolean {
  const approval = pendingApprovals.get(id);
  if (approval) {
    approval.resolve(false);
    pendingApprovals.delete(id);
    return true;
  }
  return false;
}

// Get supported stablecoins
export const STABLECOINS = { USDC, USDT, DAI, USDS };
