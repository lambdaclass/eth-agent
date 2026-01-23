import { NextResponse } from 'next/server';
import { getStrategy, getLogs, subscribeToLogs } from '@/lib/strategy-store';
import type { StrategyLog } from '@/lib/strategy-types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/strategies/[id]/logs - Stream logs via SSE
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const strategy = getStrategy(id);

  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }

  // Check if client wants SSE streaming
  const acceptHeader = request.headers.get('accept');
  const wantsStream = acceptHeader?.includes('text/event-stream');

  if (!wantsStream) {
    // Return recent logs as JSON
    const logs = getLogs(id, 100);
    return NextResponse.json({ logs });
  }

  // Set up SSE streaming
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send existing logs first
      const existingLogs = getLogs(id, 50);
      // Send in chronological order
      existingLogs.reverse().forEach((log) => {
        const data = `data: ${JSON.stringify(log)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      // Subscribe to new logs
      const unsubscribe = subscribeToLogs(id, (log: StrategyLog) => {
        try {
          const data = `data: ${JSON.stringify(log)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream might be closed
        }
      });

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
