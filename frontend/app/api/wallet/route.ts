import { NextResponse } from 'next/server';
import { getWallet, STABLECOINS } from '@/lib/wallet-server';
import { getSettings } from '@/lib/settings-store';

export async function GET() {
  try {
    // Debug: Check if env var is present
    const hasKey = !!process.env.ETH_PRIVATE_KEY;
    console.log('[wallet/GET] ETH_PRIVATE_KEY present:', hasKey);

    const wallet = getWallet();
    const settings = getSettings();
    const chainId = settings.chainId;

    const chainNames: Record<number, string> = {
      1: 'Ethereum',
      10: 'Optimism',
      137: 'Polygon',
      42161: 'Arbitrum',
      8453: 'Base',
      43114: 'Avalanche',
      11155111: 'Sepolia',
    };

    return NextResponse.json({
      address: wallet.address,
      chainId,
      chainName: chainNames[chainId] || `Chain ${chainId}`,
      connected: true,
    });
  } catch (error) {
    console.error('[wallet/GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get wallet';
    return NextResponse.json({ error: message, connected: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();
    console.log('[wallet/POST] Action:', action);

    if (action === 'balances') {
      const wallet = getWallet();
      console.log('[wallet/POST] Got wallet, fetching ETH balance...');

      // Get ETH balance
      let ethBalance;
      try {
        ethBalance = await wallet.getBalance();
        console.log('[wallet/POST] ETH balance:', ethBalance);
      } catch (ethError) {
        console.error('[wallet/POST] ETH balance error:', ethError);
        throw ethError;
      }

      // Get stablecoin balances
      let stablecoinBalances;
      try {
        console.log('[wallet/POST] Fetching stablecoin balances...');
        stablecoinBalances = await wallet.getStablecoinBalances();
        console.log('[wallet/POST] Stablecoin balances:', Object.keys(stablecoinBalances));
      } catch (stableError) {
        console.error('[wallet/POST] Stablecoin balance error:', stableError);
        throw stableError;
      }

      const balances = [
        {
          symbol: 'ETH',
          name: 'Ether',
          balance: ethBalance.wei.toString(),
          formatted: ethBalance.formatted,
          decimals: 18,
        },
        ...Object.entries(stablecoinBalances).map(([symbol, balance]) => ({
          symbol,
          name: balance.symbol,
          balance: balance.raw.toString(),
          formatted: balance.formatted,
          decimals: balance.decimals,
        })),
      ];

      return NextResponse.json(balances);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[wallet/POST] Full error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get balances';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
