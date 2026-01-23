'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Clock,
  Gauge,
  ShieldCheck,
  Settings,
  Wallet,
  Bot,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Trading Strategies', href: '/strategies', icon: Bot },
  { name: 'Transactions', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Pending Approvals', href: '/transactions/pending', icon: Clock },
  { name: 'Spending Limits', href: '/limits', icon: Gauge },
  { name: 'Addresses', href: '/addresses', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Wallet className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">eth-agent</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground text-center">
          eth-agent Dashboard v0.1.0
        </p>
      </div>
    </div>
  );
}
