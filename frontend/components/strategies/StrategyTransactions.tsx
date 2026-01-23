'use client';

import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatRelativeTime, formatAmount } from '@/lib/utils';
import { ArrowRightLeft, ExternalLink } from 'lucide-react';
import type { StrategyTransaction } from '@/lib/strategy-types';

interface StrategyTransactionsProps {
  transactions: StrategyTransaction[];
  chainId?: number;
}

export function StrategyTransactions({ transactions, chainId = 1 }: StrategyTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No transactions yet</p>
          <p className="text-sm">Transactions made by this strategy will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b text-left">
            <th className="py-3 px-4 font-medium text-muted-foreground">Time</th>
            <th className="py-3 px-4 font-medium text-muted-foreground">Hash</th>
            <th className="py-3 px-4 font-medium text-muted-foreground">To</th>
            <th className="py-3 px-4 font-medium text-muted-foreground">Amount</th>
            <th className="py-3 px-4 font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b hover:bg-muted/50">
              <td className="py-3 px-4 text-sm text-muted-foreground">
                {formatRelativeTime(tx.timestamp)}
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <AddressDisplay
                    address={tx.hash}
                    chainId={chainId}
                    showCopy={true}
                    showExplorer={false}
                  />
                  <a
                    href={getExplorerTxUrl(chainId, tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </td>
              <td className="py-3 px-4">
                <AddressDisplay address={tx.to} chainId={chainId} showCopy={false} />
              </td>
              <td className="py-3 px-4 font-mono">
                {formatAmount(tx.amount)} {tx.token}
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={tx.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getExplorerTxUrl(chainId: number, hash: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    10: 'https://optimistic.etherscan.io',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    8453: 'https://basescan.org',
    43114: 'https://snowtrace.io',
    11155111: 'https://sepolia.etherscan.io',
  };
  const explorer = explorers[chainId] || 'https://etherscan.io';
  return `${explorer}/tx/${hash}`;
}
