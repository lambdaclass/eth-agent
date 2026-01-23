import { NextResponse } from 'next/server';
import { getStrategy } from '@/lib/strategy-store';
import { startStrategy } from '@/lib/strategy-manager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/strategies/[id]/start - Start a strategy
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const strategy = getStrategy(id);

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const result = startStrategy(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: 'running' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
