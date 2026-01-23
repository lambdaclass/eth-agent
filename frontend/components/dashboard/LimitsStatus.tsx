'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { LimitsStatus as LimitsStatusType, LimitStatus } from '@/lib/wallet';
import { AlertTriangle, Clock, Calendar, Zap } from 'lucide-react';

interface LimitItemProps {
  label: string;
  status: LimitStatus;
  icon: React.ReactNode;
}

function LimitItem({ label, status, icon }: LimitItemProps) {
  const percentage = status.percentage;
  const isWarning = percentage >= 75;
  const isDanger = percentage >= 90;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <span className={cn('text-muted-foreground', isDanger && 'text-red-500', isWarning && !isDanger && 'text-yellow-500')}>
          {status.used} / {status.limit}
        </span>
      </div>
      <Progress
        value={percentage}
        className="h-2"
        indicatorClassName={cn(
          isDanger && 'bg-red-500',
          isWarning && !isDanger && 'bg-yellow-500'
        )}
      />
      <p className="text-xs text-muted-foreground">{status.remaining} remaining</p>
    </div>
  );
}

interface LimitsStatusProps {
  limits: LimitsStatusType;
  className?: string;
}

export function LimitsStatusCard({ limits, className }: LimitsStatusProps) {
  const hasWarning =
    limits.perTransaction.percentage >= 75 ||
    limits.hourly.percentage >= 75 ||
    limits.daily.percentage >= 75;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Spending Limits</CardTitle>
        {hasWarning && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
      </CardHeader>
      <CardContent className="space-y-4">
        <LimitItem
          label="Per Transaction"
          status={limits.perTransaction}
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
        />
        <LimitItem
          label="Hourly"
          status={limits.hourly}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <LimitItem
          label="Daily"
          status={limits.daily}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
        />
      </CardContent>
    </Card>
  );
}
