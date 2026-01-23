'use client';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { PendingApproval } from '@/lib/wallet';
import { CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ApprovalItemProps {
  approval: PendingApproval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading?: boolean;
}

function ApprovalItem({ approval, onApprove, onReject, isLoading }: ApprovalItemProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <AmountDisplay amount={approval.amount} token={approval.token} className="text-base" />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <AddressDisplay
            address={approval.to}
            label={approval.toLabel}
            showExplorer={false}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(approval.requestedAt)}
          <span>•</span>
          <StatusBadge status={approval.riskLevel} />
        </div>
        <p className="text-xs text-muted-foreground">{approval.reason}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReject(approval.id)}
          disabled={isLoading}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <XCircle className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => onApprove(approval.id)} disabled={isLoading}>
          <CheckCircle className="h-4 w-4 mr-1" />
          Approve
        </Button>
      </div>
    </div>
  );
}

interface PendingApprovalsProps {
  approvals: PendingApproval[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function PendingApprovalsCard({
  approvals,
  onApprove,
  onReject,
  isLoading,
  className,
}: PendingApprovalsProps) {
  const hasApprovals = approvals.length > 0;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Pending Approvals
          {hasApprovals && (
            <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs">
              {approvals.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasApprovals ? (
          <div className="divide-y">
            {approvals.slice(0, 3).map((approval) => (
              <ApprovalItem
                key={approval.id}
                approval={approval}
                onApprove={onApprove}
                onReject={onReject}
                isLoading={isLoading}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">No pending approvals</p>
          </div>
        )}
      </CardContent>
      {approvals.length > 3 && (
        <CardFooter className="pt-0">
          <Link href="/transactions/pending" className="w-full">
            <Button variant="outline" className="w-full">
              View all {approvals.length} pending
            </Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
