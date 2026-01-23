'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStrategy } from '@/hooks/useStrategies';
import { StrategyStatusBadge } from '@/components/strategies/StrategyStatusBadge';
import { StrategyControls } from '@/components/strategies/StrategyControls';
import { StrategyLogs } from '@/components/strategies/StrategyLogs';
import { StrategyTransactions } from '@/components/strategies/StrategyTransactions';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Terminal,
  ArrowRightLeft,
  Settings,
} from 'lucide-react';

type TabType = 'logs' | 'transactions' | 'settings';

export default function StrategyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  const {
    strategy,
    isLoading,
    error,
    start,
    pause,
    resume,
    stop,
    delete: deleteStrategy,
    isMutating,
    isDeleting,
  } = useStrategy(id);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
      return;
    }
    await deleteStrategy();
    router.push('/strategies');
  };

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col h-full p-6">
        <Link href="/strategies" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Strategies
        </Link>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <h2 className="text-lg font-semibold text-red-800">Error Loading Strategy</h2>
              <p className="text-red-700 mt-1">
                {error instanceof Error ? error.message : 'Failed to load strategy'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state
  if (isLoading || !strategy) {
    return (
      <div className="flex flex-col h-full p-6">
        <Link href="/strategies" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Strategies
        </Link>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading strategy...</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'logs', label: 'Logs', icon: <Terminal className="h-4 w-4" /> },
    { id: 'transactions', label: 'Transactions', icon: <ArrowRightLeft className="h-4 w-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <Link href="/strategies" className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" />
        Back to Strategies
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{strategy.name}</h1>
            <StrategyStatusBadge status={strategy.status} />
          </div>
          <AddressDisplay address={strategy.walletAddress} showExplorer={true} />
          <p className="text-sm text-muted-foreground">
            Created {formatRelativeTime(strategy.createdAt)}
            {strategy.startedAt && ` • Started ${formatRelativeTime(strategy.startedAt)}`}
          </p>
        </div>
        <StrategyControls
          status={strategy.status}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onStop={stop}
          onDelete={handleDelete}
          isLoading={isMutating || isDeleting}
        />
      </div>

      {/* Strategy prompt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Strategy Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{strategy.prompt}</p>
        </CardContent>
      </Card>

      {/* Error display */}
      {strategy.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{strategy.error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'transactions' && strategy.transactions.length > 0 && (
                <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                  {strategy.transactions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 pt-4 min-h-0">
          {activeTab === 'logs' && (
            <StrategyLogs
              strategyId={id}
              initialLogs={strategy.logs}
              isLive={strategy.status === 'running'}
            />
          )}
          {activeTab === 'transactions' && (
            <StrategyTransactions
              transactions={strategy.transactions}
              chainId={strategy.config.chainId}
            />
          )}
          {activeTab === 'settings' && (
            <Card>
              <CardHeader>
                <CardTitle>Strategy Configuration</CardTitle>
                <CardDescription>
                  Configuration settings for this strategy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Loop Interval</p>
                    <p className="text-sm">{strategy.config.loopIntervalMs / 1000} seconds</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Chain ID</p>
                    <p className="text-sm">{strategy.config.chainId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Per Transaction Limit</p>
                    <p className="text-sm">{strategy.config.limits.perTransaction} ETH</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Hourly Limit</p>
                    <p className="text-sm">{strategy.config.limits.perHour} ETH</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Daily Limit</p>
                    <p className="text-sm">{strategy.config.limits.perDay} ETH</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">RPC URL</p>
                    <p className="text-sm font-mono truncate">{strategy.config.rpcUrl}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
