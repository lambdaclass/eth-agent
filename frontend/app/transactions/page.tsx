'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { formatRelativeTime } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Search, ArrowUpRight, ArrowDownLeft, ExternalLink, Download, Loader2 } from 'lucide-react';

export default function TransactionsPage() {
  const { data: wallet } = useWallet();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { data: transactionsData, isLoading } = useTransactions({ status: filter !== 'all' ? filter : undefined });

  const transactions = transactionsData?.transactions ?? [];
  const walletAddress = wallet?.address ?? '';
  const chainId = wallet?.chainId ?? 1;

  const filteredTransactions = transactions.filter((tx) => {
    if (search && !tx.to.toLowerCase().includes(search.toLowerCase()) && !tx.hash.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <Header wallet={wallet ?? null} />
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <p className="text-muted-foreground">View your transaction history</p>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by address or hash..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left text-sm font-medium">Type</th>
                      <th className="p-3 text-left text-sm font-medium">Amount</th>
                      <th className="p-3 text-left text-sm font-medium">Address</th>
                      <th className="p-3 text-left text-sm font-medium">Status</th>
                      <th className="p-3 text-left text-sm font-medium">Time</th>
                      <th className="p-3 text-left text-sm font-medium">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => {
                      const isSent = tx.from.toLowerCase() === walletAddress.toLowerCase();
                      return (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-6 w-6 rounded-full flex items-center justify-center ${
                                  isSent ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                                }`}
                              >
                                {isSent ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownLeft className="h-3 w-3" />
                                )}
                              </div>
                              <span className="text-sm font-medium">{isSent ? 'Sent' : 'Received'}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <AmountDisplay
                              amount={isSent ? `-${tx.amount}` : tx.amount}
                              token={tx.token}
                              colorize
                            />
                          </td>
                          <td className="p-3">
                            <AddressDisplay
                              address={isSent ? tx.to : tx.from}
                              chainId={chainId}
                              showCopy={false}
                            />
                          </td>
                          <td className="p-3">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{formatRelativeTime(tx.timestamp)}</td>
                          <td className="p-3">
                            <a
                              href={`https://etherscan.io/tx/${tx.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-primary hover:underline font-mono"
                            >
                              {tx.hash.slice(0, 10)}...
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredTransactions.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    {transactions.length === 0
                      ? 'No transactions yet. Transactions will appear here after your agent makes transfers.'
                      : 'No transactions found matching your search.'}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
