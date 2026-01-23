import { NextResponse } from 'next/server';
import { getFilteredTransactions } from '@/lib/transactions-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') || undefined;

    const result = getFilteredTransactions({ limit, offset, status });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get transactions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
