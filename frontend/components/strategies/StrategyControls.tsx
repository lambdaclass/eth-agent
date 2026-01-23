'use client';

import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Trash2 } from 'lucide-react';
import type { StrategyStatus } from '@/lib/strategy-types';

interface StrategyControlsProps {
  status: StrategyStatus;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDelete: () => void;
  isLoading?: boolean;
}

export function StrategyControls({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
  onDelete,
  isLoading,
}: StrategyControlsProps) {
  const canStart = status === 'idle' || status === 'stopped' || status === 'error';
  const canPause = status === 'running';
  const canResume = status === 'paused';
  const canStop = status === 'running' || status === 'paused';
  const canDelete = status !== 'running' && status !== 'paused';

  return (
    <div className="flex items-center gap-2">
      {canStart && (
        <Button onClick={onStart} disabled={isLoading}>
          <Play className="h-4 w-4 mr-2" />
          Start
        </Button>
      )}
      {canResume && (
        <Button onClick={onResume} disabled={isLoading}>
          <Play className="h-4 w-4 mr-2" />
          Resume
        </Button>
      )}
      {canPause && (
        <Button variant="secondary" onClick={onPause} disabled={isLoading}>
          <Pause className="h-4 w-4 mr-2" />
          Pause
        </Button>
      )}
      {canStop && (
        <Button variant="outline" onClick={onStop} disabled={isLoading}>
          <Square className="h-4 w-4 mr-2" />
          Stop
        </Button>
      )}
      <Button
        variant="destructive"
        onClick={onDelete}
        disabled={isLoading || !canDelete}
        title={!canDelete ? 'Stop the strategy before deleting' : undefined}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>
    </div>
  );
}
