import { NextResponse } from 'next/server';
import { getStrategy } from '@/lib/strategy-store';
import { stopStrategy } from '@/lib/strategy-manager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/strategies/[id]/stop - Stop a strategy
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const strategy = getStrategy(id);

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const result = stopStrategy(id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, status: 'stopped' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
