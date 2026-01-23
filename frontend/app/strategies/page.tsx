'use client';

import { useStrategies } from '@/hooks/useStrategies';
import { StrategyCard } from '@/components/strategies/StrategyCard';
import { CreateStrategyForm } from '@/components/strategies/CreateStrategyForm';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, Loader2, AlertTriangle } from 'lucide-react';

export default function StrategiesPage() {
  const {
    strategies,
    isLoading,
    error,
    create,
    delete: deleteStrategy,
    start,
    pause,
    resume,
    stop,
    isCreating,
    isMutating,
  } = useStrategies();

  const handleStart = (id: string) => {
    const strategy = strategies.find((s) => s.id === id);
    if (strategy?.status === 'paused') {
      resume(id);
    } else {
      start(id);
    }
  };

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Trading Strategies</h1>
          <p className="text-muted-foreground">
            Create and manage autonomous trading strategies powered by AI.
          </p>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <h2 className="text-lg font-semibold text-red-800">Error Loading Strategies</h2>
              <p className="text-red-700 mt-1">
                {error instanceof Error ? error.message : 'Failed to load strategies'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Trading Strategies</h1>
          <p className="text-muted-foreground">
            Create and manage autonomous trading strategies powered by AI.
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading strategies...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Strategies</h1>
          <p className="text-muted-foreground">
            Create and manage autonomous trading strategies powered by AI.
          </p>
        </div>
        <CreateStrategyForm onSubmit={create} isLoading={isCreating} />
      </div>

      {strategies.length === 0 ? (
        <Card className="flex-1 flex items-center justify-center">
          <CardContent className="text-center py-12">
            <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-lg font-semibold mb-2">No Strategies Yet</h2>
            <p className="text-muted-foreground mb-4 max-w-md">
              Create your first trading strategy to start automating your crypto transactions
              with AI-powered decision making.
            </p>
            <CreateStrategyForm onSubmit={create} isLoading={isCreating} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              id={strategy.id}
              name={strategy.name}
              walletAddress={strategy.walletAddress}
              status={strategy.status}
              prompt={strategy.prompt}
              createdAt={strategy.createdAt}
              onStart={handleStart}
              onPause={pause}
              onStop={stop}
              onDelete={deleteStrategy}
              isLoading={isMutating}
            />
          ))}
        </div>
      )}
    </div>
  );
}
