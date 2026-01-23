import { NextResponse } from 'next/server';
import {
  getStrategy,
  getStrategyDetail,
  deleteStrategy,
} from '@/lib/strategy-store';
import { stopStrategy, isStrategyRunning } from '@/lib/strategy-manager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/strategies/[id] - Get strategy details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const detail = getStrategyDetail(id);

    if (!detail) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Remove private key from response
    const { privateKey, ...sanitizedStrategy } = detail.strategy;

    return NextResponse.json({
      ...sanitizedStrategy,
      logs: detail.logs,
      transactions: detail.transactions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/strategies/[id] - Delete a strategy
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const strategy = getStrategy(id);

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    // Stop the strategy if it's running
    if (isStrategyRunning(id)) {
      stopStrategy(id);
    }

    const deleted = deleteStrategy(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete strategy' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
