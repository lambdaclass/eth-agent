import { NextResponse } from 'next/server';
import { getStrategy } from '@/lib/strategy-store';
import { pauseStrategy } from '@/lib/strategy-manager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/strategies/[id]/pause - Pause a running strategy
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const strategy = getStrategy(id);

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const result = pauseStrategy(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: 'paused' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
