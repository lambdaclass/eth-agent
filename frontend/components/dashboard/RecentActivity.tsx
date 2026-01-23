'use client';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Transaction } from '@/lib/wallet';
import { ArrowUpRight, ArrowDownLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface TransactionItemProps {
  transaction: Transaction;
  walletAddress: string;
  chainId: number;
}

function TransactionItem({ transaction, walletAddress, chainId }: TransactionItemProps) {
  const isSent = transaction.from.toLowerCase() === walletAddress.toLowerCase();

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center',
            isSent ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
          )}
        >
          {isSent ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{isSent ? 'Sent' : 'Received'}</span>
            <StatusBadge status={transaction.status} />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{isSent ? 'To' : 'From'}:</span>
            <AddressDisplay
              address={isSent ? transaction.to : transaction.from}
              chainId={chainId}
              showCopy={false}
              className="text-xs"
            />
          </div>
        </div>
      </div>
      <div className="text-right">
        <AmountDisplay
          amount={isSent ? `-${transaction.amount}` : transaction.amount}
          token={transaction.token}
          colorize
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">{formatRelativeTime(transaction.timestamp)}</p>
      </div>
    </div>
  );
}

interface RecentActivityProps {
  transactions: Transaction[];
  walletAddress: string;
  chainId: number;
  className?: string;
}

export function RecentActivityCard({
  transactions,
  walletAddress,
  chainId,
  className,
}: RecentActivityProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length > 0 ? (
          <div className="divide-y">
            {transactions.slice(0, 5).map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                walletAddress={walletAddress}
                chainId={chainId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No recent transactions</p>
          </div>
        )}
      </CardContent>
      {transactions.length > 0 && (
        <CardFooter className="pt-0">
          <Link href="/transactions" className="w-full">
            <Button variant="outline" className="w-full">
              View all transactions
            </Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
