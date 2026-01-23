'use client';

import Link from 'next/link';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StrategyStatusBadge } from './StrategyStatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { formatRelativeTime } from '@/lib/utils';
import { Play, Pause, Square, Trash2, ArrowRight } from 'lucide-react';
import type { StrategyStatus } from '@/lib/strategy-types';

interface StrategyCardProps {
  id: string;
  name: string;
  walletAddress: string;
  status: StrategyStatus;
  prompt: string;
  createdAt: number;
  onStart?: (id: string) => void;
  onPause?: (id: string) => void;
  onStop?: (id: string) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

export function StrategyCard({
  id,
  name,
  walletAddress,
  status,
  prompt,
  createdAt,
  onStart,
  onPause,
  onStop,
  onDelete,
  isLoading,
}: StrategyCardProps) {
  const canStart = status === 'idle' || status === 'stopped' || status === 'error';
  const canPause = status === 'running';
  const canResume = status === 'paused';
  const canStop = status === 'running' || status === 'paused';

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">{name}</h3>
            <AddressDisplay address={walletAddress} showExplorer={false} />
          </div>
          <StrategyStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{prompt}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Created {formatRelativeTime(createdAt)}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 pt-3 border-t">
        <div className="flex items-center gap-1">
          {canStart && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStart?.(id)}
              disabled={isLoading}
              title="Start strategy"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {canResume && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStart?.(id)}
              disabled={isLoading}
              title="Resume strategy"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {canPause && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPause?.(id)}
              disabled={isLoading}
              title="Pause strategy"
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {canStop && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStop?.(id)}
              disabled={isLoading}
              title="Stop strategy"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(id)}
            disabled={isLoading || status === 'running' || status === 'paused'}
            title="Delete strategy"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Link href={`/strategies/${id}`}>
          <Button variant="outline" size="sm">
            View Details
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
