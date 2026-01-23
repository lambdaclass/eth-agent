'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { AlertCircle, Info, AlertTriangle, Bot, Wrench, ArrowRightLeft, Terminal } from 'lucide-react';
import type { StrategyLog, LogLevel, LogCategory } from '@/lib/strategy-types';

interface StrategyLogsProps {
  strategyId: string;
  initialLogs?: StrategyLog[];
  isLive?: boolean;
}

const LEVEL_STYLES: Record<LogLevel, { icon: React.ReactNode; className: string }> = {
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    className: 'text-blue-600 dark:text-blue-400',
  },
  warn: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    className: 'text-yellow-600 dark:text-yellow-400',
  },
  error: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    className: 'text-red-600 dark:text-red-400',
  },
};

const CATEGORY_ICONS: Record<LogCategory, React.ReactNode> = {
  system: <Terminal className="h-3.5 w-3.5" />,
  claude: <Bot className="h-3.5 w-3.5" />,
  tool: <Wrench className="h-3.5 w-3.5" />,
  transaction: <ArrowRightLeft className="h-3.5 w-3.5" />,
};

export function StrategyLogs({ strategyId, initialLogs = [], isLive = true }: StrategyLogsProps) {
  const [logs, setLogs] = useState<StrategyLog[]>(initialLogs);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Update logs when initialLogs changes
  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  // Set up SSE connection for live logs
  useEffect(() => {
    if (!isLive) return;

    const eventSource = new EventSource(`/api/strategies/${strategyId}/logs`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const log: StrategyLog = JSON.parse(event.data);
        setLogs((prev) => {
          // Avoid duplicates
          if (prev.some((l) => l.id === log.id)) return prev;
          return [...prev, log];
        });
      } catch {
        console.error('Failed to parse log event');
      }
    };

    eventSource.onerror = () => {
      // Connection lost, try to reconnect
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [strategyId, isLive]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scrolling
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No logs yet</p>
          <p className="text-sm">Logs will appear here when the strategy runs</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-96 overflow-auto bg-muted/30 rounded-lg border font-mono text-sm"
    >
      <div className="p-3 space-y-1">
        {logs.map((log) => {
          const levelStyle = LEVEL_STYLES[log.level];
          const categoryIcon = CATEGORY_ICONS[log.category];

          return (
            <div key={log.id} className="flex items-start gap-2 py-1 hover:bg-muted/50 rounded px-2 -mx-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[70px]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={cn('flex items-center gap-1 min-w-[60px]', levelStyle.className)}>
                {levelStyle.icon}
                <span className="text-xs uppercase">{log.level}</span>
              </span>
              <span className="flex items-center gap-1 text-muted-foreground min-w-[90px]">
                {categoryIcon}
                <span className="text-xs">{log.category}</span>
              </span>
              <span className="flex-1 break-all">{log.message}</span>
            </div>
          );
        })}
      </div>
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className="fixed bottom-20 right-8 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs shadow-lg hover:bg-primary/90"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
