'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay, TokenIcon } from '@/components/shared/AmountDisplay';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { useApprovals } from '@/hooks/useApprovals';
import type { PendingApproval } from '@/lib/wallet';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

export default function PendingApprovalsPage() {
  const { data: wallet } = useWallet();
  const { approvals, approve, reject, isApproving, isRejecting, isLoading } = useApprovals();
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = (id: string) => {
    approve(id);
    setSelectedApproval(null);
    setAction(null);
  };

  const handleReject = (id: string) => {
    reject(id);
    setSelectedApproval(null);
    setAction(null);
  };

  const openConfirmDialog = (approval: PendingApproval, actionType: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setAction(actionType);
  };

  const chainId = wallet?.chainId ?? 1;

  return (
    <div className="flex flex-col h-full">
      <Header wallet={wallet ?? null} pendingCount={approvals.length} />
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="text-muted-foreground">
            Review and approve or reject pending transactions from your AI agent
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold">All caught up!</h3>
              <p className="text-muted-foreground">No pending approvals at this time</p>
              <p className="text-sm text-muted-foreground mt-2">
                Approval requests will appear here when your agent tries to make transactions
                that exceed limits or target new addresses.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <Card
                key={approval.id}
                className={cn(
                  'border-l-4',
                  approval.riskLevel === 'high' && 'border-l-red-500',
                  approval.riskLevel === 'medium' && 'border-l-yellow-500',
                  approval.riskLevel === 'low' && 'border-l-green-500'
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <TokenIcon token={approval.token} size="lg" />
                      <div>
                        <CardTitle className="text-lg">
                          Transfer {approval.amount} {approval.token}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3" />
                          Requested {formatRelativeTime(approval.requestedAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <StatusBadge status={approval.riskLevel} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">To:</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <AddressDisplay
                      address={approval.to}
                      label={approval.toLabel}
                      chainId={chainId}
                    />
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Approval Required
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">{approval.reason}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => openConfirmDialog(approval, 'approve')}
                      disabled={isApproving || isRejecting}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => openConfirmDialog(approval, 'reject')}
                      disabled={isApproving || isRejecting}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedApproval && !!action} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve'
                ? 'This will authorize the transaction to proceed.'
                : 'This will cancel the transaction request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <AmountDisplay amount={selectedApproval.amount} token={selectedApproval.token} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">To</span>
                <AddressDisplay address={selectedApproval.to} label={selectedApproval.toLabel} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Risk Level</span>
                <StatusBadge status={selectedApproval.riskLevel} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedApproval(null)}>
              Cancel
            </Button>
            {action === 'approve' ? (
              <Button
                onClick={() => selectedApproval && handleApprove(selectedApproval.id)}
                disabled={isApproving}
              >
                {isApproving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Approval
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => selectedApproval && handleReject(selectedApproval.id)}
                disabled={isRejecting}
              >
                {isRejecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Rejection
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
