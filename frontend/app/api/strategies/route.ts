import { NextResponse } from 'next/server';
import {
  createStrategy,
  getAllStrategies,
} from '@/lib/strategy-store';
import type { CreateStrategyRequest } from '@/lib/strategy-types';

// GET /api/strategies - List all strategies
export async function GET() {
  try {
    const strategies = getAllStrategies();

    // Remove private keys from response
    const sanitized = strategies.map(({ privateKey, ...rest }) => rest);

    return NextResponse.json({ strategies: sanitized });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list strategies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/strategies - Create a new strategy
export async function POST(request: Request) {
  try {
    const body: CreateStrategyRequest = await request.json();

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!body.privateKey?.trim()) {
      return NextResponse.json({ error: 'Private key is required' }, { status: 400 });
    }
    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const strategy = createStrategy(
      body.name.trim(),
      body.privateKey.trim(),
      body.prompt.trim(),
      body.config
    );

    // Remove private key from response
    const { privateKey, ...sanitized } = strategy;

    return NextResponse.json(sanitized, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create strategy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
