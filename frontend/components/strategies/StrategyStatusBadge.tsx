import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Circle,
  Play,
  Pause,
  Square,
  AlertCircle,
} from 'lucide-react';
import type { StrategyStatus } from '@/lib/strategy-types';

interface StrategyStatusBadgeProps {
  status: StrategyStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  StrategyStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning';
    icon: React.ReactNode;
  }
> = {
  idle: {
    label: 'Idle',
    variant: 'secondary',
    icon: <Circle className="h-3 w-3" />,
  },
  running: {
    label: 'Running',
    variant: 'success',
    icon: <Play className="h-3 w-3" />,
  },
  paused: {
    label: 'Paused',
    variant: 'warning',
    icon: <Pause className="h-3 w-3" />,
  },
  stopped: {
    label: 'Stopped',
    variant: 'secondary',
    icon: <Square className="h-3 w-3" />,
  },
  error: {
    label: 'Error',
    variant: 'destructive',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function StrategyStatusBadge({ status, className }: StrategyStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className={cn('gap-1', className)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
