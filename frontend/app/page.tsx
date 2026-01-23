'use client';

import { Header } from '@/components/Header';
import { BalancesGrid } from '@/components/dashboard/BalanceCard';
import { LimitsStatusCard } from '@/components/dashboard/LimitsStatus';
import { PendingApprovalsCard } from '@/components/dashboard/PendingApprovals';
import { RecentActivityCard } from '@/components/dashboard/RecentActivity';
import { useWallet, useBalances } from '@/hooks/useWallet';
import { useApprovals } from '@/hooks/useApprovals';
import { useLimits } from '@/hooks/useLimits';
import { useTransactions } from '@/hooks/useTransactions';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { data: wallet, isLoading: walletLoading, error: walletError } = useWallet();
  const { data: balances, isLoading: balancesLoading, refetch: refetchBalances } = useBalances();
  const { approvals, isLoading: approvalsLoading, approve, reject, isApproving, isRejecting } = useApprovals();
  const { limits, isLoading: limitsLoading } = useLimits();
  const { data: transactionsData, isLoading: transactionsLoading } = useTransactions({ limit: 10 });

  const isLoading = walletLoading || balancesLoading || approvalsLoading || limitsLoading || transactionsLoading;
  const isRefreshing = false;

  const handleRefresh = () => {
    refetchBalances();
  };

  // Show error state if wallet failed to load (likely missing ETH_PRIVATE_KEY)
  if (walletError) {
    return (
      <div className="flex flex-col h-full">
        <Header wallet={null} />
        <div className="flex-1 p-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-4 p-6">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <h2 className="text-lg font-semibold text-red-800">Wallet Configuration Required</h2>
                <p className="text-red-700 mt-1">
                  {walletError instanceof Error ? walletError.message : 'Failed to initialize wallet'}
                </p>
                <p className="text-sm text-red-600 mt-2">
                  Make sure you have set the <code className="bg-red-100 px-1 rounded">ETH_PRIVATE_KEY</code> environment variable in your <code className="bg-red-100 px-1 rounded">.env.local</code> file.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading && !wallet) {
    return (
      <div className="flex flex-col h-full">
        <Header wallet={null} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading wallet...</p>
          </div>
        </div>
      </div>
    );
  }

  // Default empty states
  const safeBalances = balances ?? [];
  const safeLimits = limits ?? {
    perTransaction: { limit: '0', used: '0', remaining: '0', percentage: 0 },
    hourly: { limit: '0', used: '0', remaining: '0', percentage: 0 },
    daily: { limit: '0', used: '0', remaining: '0', percentage: 0 },
  };
  const safeTransactions = transactionsData?.transactions ?? [];

  return (
    <div className="flex flex-col h-full">
      <Header
        wallet={wallet ?? null}
        pendingCount={approvals.length}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your agent wallet balances, spending limits, and pending approvals.
          </p>
        </div>

        {balancesLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-1/2 mb-4" />
                  <div className="h-8 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <BalancesGrid balances={safeBalances} />
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <LimitsStatusCard limits={safeLimits} />
          <PendingApprovalsCard
            approvals={approvals}
            onApprove={approve}
            onReject={reject}
            isLoading={isApproving || isRejecting}
          />
        </div>

        <RecentActivityCard
          transactions={safeTransactions}
          walletAddress={wallet?.address ?? ''}
          chainId={wallet?.chainId ?? 1}
        />
      </div>
    </div>
  );
}
