import { cn } from '@/lib/utils';
import { TOKENS } from '@/lib/wallet';

interface AmountDisplayProps {
  amount: string;
  token: string;
  className?: string;
  showSign?: boolean;
  colorize?: boolean;
}

export function AmountDisplay({
  amount,
  token,
  className,
  showSign = false,
  colorize = false,
}: AmountDisplayProps) {
  const tokenInfo = TOKENS[token] || { name: token, color: '#888' };
  const numAmount = parseFloat(amount);
  const isPositive = numAmount >= 0;
  const displayAmount = showSign && isPositive ? `+${amount}` : amount;

  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        colorize && isPositive && 'text-green-600 dark:text-green-400',
        colorize && !isPositive && 'text-red-600 dark:text-red-400',
        className
      )}
    >
      {displayAmount}{' '}
      <span className="text-muted-foreground font-normal">{token}</span>
    </span>
  );
}

interface TokenIconProps {
  token: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TokenIcon({ token, size = 'md', className }: TokenIconProps) {
  const tokenInfo = TOKENS[token];
  const sizeClasses = {
    sm: 'h-5 w-5 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white',
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: tokenInfo?.color || '#888' }}
    >
      {token.slice(0, 1)}
    </div>
  );
}
