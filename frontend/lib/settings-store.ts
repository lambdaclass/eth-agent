// Server-side settings storage
// Settings that can be modified at runtime

export interface Settings {
  // Network settings
  chainId: number;
  rpcUrl: string;

  // Approval settings
  approvalTimeoutMinutes: number;
  requireApprovalAmount: number;
  requireApprovalNewRecipient: boolean;

  // Notification settings (UI only for now)
  notifyOnReceive: boolean;
  notifyOnLimitWarning: boolean;
}

// Default settings from environment variables
function getDefaultSettings(): Settings {
  return {
    chainId: parseInt(process.env.CHAIN_ID || '1'),
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com',
    approvalTimeoutMinutes: parseInt(process.env.APPROVAL_TIMEOUT_MINUTES || '60'),
    requireApprovalAmount: 500,
    requireApprovalNewRecipient: true,
    notifyOnReceive: true,
    notifyOnLimitWarning: true,
  };
}

// In-memory settings store (persists for the lifetime of the server process)
let currentSettings: Settings | null = null;

export function getSettings(): Settings {
  if (!currentSettings) {
    currentSettings = getDefaultSettings();
  }
  return currentSettings;
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const current = getSettings();
  currentSettings = { ...current, ...updates };
  return currentSettings;
}

// Check if network settings changed (requires wallet reinitialization)
export function networkSettingsChanged(newSettings: Partial<Settings>): boolean {
  const current = getSettings();
  return (
    (newSettings.chainId !== undefined && newSettings.chainId !== current.chainId) ||
    (newSettings.rpcUrl !== undefined && newSettings.rpcUrl !== current.rpcUrl)
  );
}
