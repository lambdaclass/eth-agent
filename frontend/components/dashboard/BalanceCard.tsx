'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenIcon } from '@/components/shared/AmountDisplay';
import { formatAmount, cn } from '@/lib/utils';
import type { Balance } from '@/lib/wallet';

interface BalanceCardProps {
  balance: Balance;
  className?: string;
}

// Format balance with appropriate decimal places
function formatBalance(formatted: string, symbol: string): string {
  // Remove any existing symbol suffix (e.g., "0.189 ETH" -> "0.189")
  const numericStr = formatted.replace(/\s*[A-Z]+$/i, '').trim();
  const num = parseFloat(numericStr);

  if (isNaN(num)) return formatted;

  // Stablecoins: 2 decimal places
  if (['USDC', 'USDT', 'DAI', 'USDS', 'PYUSD', 'FRAX'].includes(symbol)) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ETH and other tokens: up to 6 decimal places, remove trailing zeros
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

export function BalanceCard({ balance, className }: BalanceCardProps) {
  const displayAmount = formatBalance(balance.formatted, balance.symbol);

  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{balance.name}</CardTitle>
        <TokenIcon token={balance.symbol} size="sm" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {displayAmount} <span className="text-lg text-muted-foreground">{balance.symbol}</span>
        </div>
        {balance.usdValue && (
          <p className="text-xs text-muted-foreground mt-1">${formatAmount(balance.usdValue)} USD</p>
        )}
      </CardContent>
    </Card>
  );
}

interface BalancesGridProps {
  balances: Balance[];
  className?: string;
}

export function BalancesGrid({ balances, className }: BalancesGridProps) {
  return (
    <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
      {balances.map((balance) => (
        <BalanceCard key={balance.symbol} balance={balance} />
      ))}
    </div>
  );
}
