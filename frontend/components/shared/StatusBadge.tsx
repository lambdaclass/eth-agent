import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

type Status = 'pending' | 'confirmed' | 'failed' | 'low' | 'medium' | 'high';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const STATUS_CONFIG: Record<Status, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning'; icon: React.ReactNode }> = {
  pending: {
    label: 'Pending',
    variant: 'warning',
    icon: <Clock className="h-3 w-3" />,
  },
  confirmed: {
    label: 'Confirmed',
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
  low: {
    label: 'Low Risk',
    variant: 'success',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  medium: {
    label: 'Medium Risk',
    variant: 'warning',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  high: {
    label: 'High Risk',
    variant: 'destructive',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className={cn('gap-1', className)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
