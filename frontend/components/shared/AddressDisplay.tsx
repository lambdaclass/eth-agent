'use client';

import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { formatAddress, cn } from '@/lib/utils';
import { getExplorerUrl } from '@/lib/wallet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AddressDisplayProps {
  address: string;
  label?: string;
  chainId?: number;
  className?: string;
  showCopy?: boolean;
  showExplorer?: boolean;
  truncate?: boolean;
}

export function AddressDisplay({
  address,
  label,
  chainId = 1,
  className,
  showCopy = true,
  showExplorer = true,
  truncate = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayText = label || (truncate ? formatAddress(address) : address);
  const explorerUrl = getExplorerUrl(chainId, address, 'address');

  return (
    <TooltipProvider>
      <div className={cn('inline-flex items-center gap-1.5 font-mono text-sm', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">{displayText}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">{address}</p>
          </TooltipContent>
        </Tooltip>

        {showCopy && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopy}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{copied ? 'Copied!' : 'Copy address'}</TooltipContent>
          </Tooltip>
        )}

        {showExplorer && explorerUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>View on explorer</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
