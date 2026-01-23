'use client';

import { ChainBadge } from '@/components/shared/ChainBadge';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Button } from '@/components/ui/button';
import { RefreshCw, Bell } from 'lucide-react';
import type { WalletState } from '@/lib/wallet';

interface HeaderProps {
  wallet: WalletState | null;
  pendingCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ wallet, pendingCount = 0, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        {wallet && (
          <>
            <AddressDisplay
              address={wallet.address}
              chainId={wallet.chainId}
              className="text-base font-medium"
            />
            <ChainBadge chainId={wallet.chainId} />
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {pendingCount > 0 && (
          <Button variant="outline" size="sm" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">
              {pendingCount}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>
    </header>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
