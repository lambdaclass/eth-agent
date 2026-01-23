import { NextResponse } from 'next/server';
import { getWallet } from '@/lib/wallet-server';

export async function GET() {
  try {
    const wallet = getWallet();
    // Get stablecoin limits (USD-based) which are more relevant for the dashboard
    const status = wallet.getStablecoinLimits();
    const global = status.global;

    // Parse limit values to calculate percentages
    const parseValue = (str: string): number => {
      const num = parseFloat(str.replace(/[^0-9.]/g, ''));
      return isNaN(num) ? 0 : num;
    };

    const hourlyLimit = parseValue(global.hourly.limit);
    const hourlyUsed = parseValue(global.hourly.used);
    const dailyLimit = parseValue(global.daily.limit);
    const dailyUsed = parseValue(global.daily.used);

    return NextResponse.json({
      perTransaction: {
        limit: `$${global.perTransaction.limit}`,
        used: '$0',
        remaining: `$${global.perTransaction.available}`,
        percentage: 0,
      },
      hourly: {
        limit: `$${global.hourly.limit}`,
        used: `$${global.hourly.used}`,
        remaining: `$${global.hourly.remaining}`,
        percentage: hourlyLimit > 0 ? (hourlyUsed / hourlyLimit) * 100 : 0,
        resetsAt: global.hourly.resetsAt,
      },
      daily: {
        limit: `$${global.daily.limit}`,
        used: `$${global.daily.used}`,
        remaining: `$${global.daily.remaining}`,
        percentage: dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0,
        resetsAt: global.daily.resetsAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get limits';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    // Note: The eth-agent library doesn't support runtime limit updates yet
    // This would need to be implemented in the library first
    // For now, return current limits
    const wallet = getWallet();
    const status = wallet.getLimits();

    return NextResponse.json({
      message: 'Limit updates require restarting the wallet with new configuration',
      current: status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update limits';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
