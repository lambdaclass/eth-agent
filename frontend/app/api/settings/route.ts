import { NextResponse } from 'next/server';
import { getSettings, updateSettings, networkSettingsChanged } from '@/lib/settings-store';
import { reinitializeWallet } from '@/lib/wallet-server';
import { CHAINS } from '@/lib/wallet';

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const updates = await request.json();
    console.log('[settings/PATCH] Received updates:', updates);

    // Check if network settings are changing
    const networkChanged = networkSettingsChanged(updates);

    // If chain ID is changing, update the RPC URL to match
    if (updates.chainId !== undefined) {
      const chain = CHAINS[updates.chainId];
      if (chain) {
        updates.rpcUrl = chain.rpcUrl;
        console.log('[settings/PATCH] Chain changed to', chain.name, 'using RPC:', chain.rpcUrl);
      }
    }

    // Apply the settings update
    const newSettings = updateSettings(updates);
    console.log('[settings/PATCH] Settings updated:', newSettings);

    // If network settings changed, reinitialize the wallet
    if (networkChanged) {
      console.log('[settings/PATCH] Network settings changed, reinitializing wallet...');
      try {
        reinitializeWallet();
        console.log('[settings/PATCH] Wallet reinitialized successfully');
      } catch (walletError) {
        console.error('[settings/PATCH] Failed to reinitialize wallet:', walletError);
        // Return partial success - settings saved but wallet failed
        return NextResponse.json({
          settings: newSettings,
          warning: 'Settings saved but wallet reinitialization failed. Some features may not work correctly.',
        });
      }
    }

    return NextResponse.json({ settings: newSettings, success: true });
  } catch (error) {
    console.error('[settings/PATCH] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
