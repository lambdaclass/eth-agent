import { Badge } from '@/components/ui/badge';
import { CHAINS } from '@/lib/wallet';
import { cn } from '@/lib/utils';

interface ChainBadgeProps {
  chainId: number;
  className?: string;
}

const CHAIN_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  10: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  137: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  42161: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100',
  8453: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  43114: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  11155111: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
};

export function ChainBadge({ chainId, className }: ChainBadgeProps) {
  const chain = CHAINS[chainId];
  const colorClass = CHAIN_COLORS[chainId] || 'bg-gray-100 text-gray-800';

  return (
    <Badge variant="outline" className={cn('border-0', colorClass, className)}>
      {chain?.name || `Chain ${chainId}`}
    </Badge>
  );
}
