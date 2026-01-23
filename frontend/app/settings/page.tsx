'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS } from '@/lib/wallet';
import { Save, Globe, Bell, Shield, Clock, Info, Loader2, CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface Settings {
  chainId: number;
  rpcUrl: string;
  approvalTimeoutMinutes: number;
  requireApprovalAmount: number;
  requireApprovalNewRecipient: boolean;
  notifyOnReceive: boolean;
  notifyOnLimitWarning: boolean;
}

export default function SettingsPage() {
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      if (data.warning) {
        setError(data.warning);
      }

      // Update local state with saved settings
      setSettings(data.settings);
      setHasChanges(false);
      setSaveSuccess(true);

      // Invalidate wallet query to refresh with new chain
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });

      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
    setSaveSuccess(false);
  };

  if (isLoading || walletLoading || !settings) {
    return (
      <div className="flex flex-col h-full">
        <Header wallet={null} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header wallet={wallet ?? null} />
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">Configure your agent wallet preferences</p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="flex items-center text-sm text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                Saved!
              </span>
            )}
            {error && (
              <span className="text-sm text-red-600">{error}</span>
            )}
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Core settings like private key, RPC URL, and chain are configured via environment variables.
                Changes here are for UI preferences and require corresponding backend implementation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Network Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Network</CardTitle>
            </div>
            <CardDescription>Configure blockchain network settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chain">Chain</Label>
                <Select
                  value={settings.chainId.toString()}
                  onValueChange={(v) => updateSetting('chainId', parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select chain" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHAINS).map(([id, chain]) => (
                      <SelectItem key={id} value={id}>
                        {chain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Current: {CHAINS[settings.chainId]?.name || 'Unknown'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rpc">RPC URL</Label>
                <Input
                  id="rpc"
                  value={settings.rpcUrl}
                  onChange={(e) => updateSetting('rpcUrl', e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">
                  Auto-updates when chain changes, or set custom URL
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Approval Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Approval Requirements</CardTitle>
            </div>
            <CardDescription>Configure when human approval is required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require approval for new recipients</Label>
                <p className="text-sm text-muted-foreground">
                  Request approval when sending to an address for the first time
                </p>
              </div>
              <Switch
                checked={settings.requireApprovalNewRecipient}
                onCheckedChange={(v) => updateSetting('requireApprovalNewRecipient', v)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="approvalAmount">Require approval for amounts exceeding</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="approvalAmount"
                  type="number"
                  value={settings.requireApprovalAmount}
                  onChange={(e) => updateSetting('requireApprovalAmount', parseInt(e.target.value) || 0)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">USDC</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Transactions above this amount will require manual approval
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Timeout Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Timeouts</CardTitle>
            </div>
            <CardDescription>Configure approval timeout settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Approval request timeout</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="timeout"
                  type="number"
                  value={settings.approvalTimeoutMinutes}
                  onChange={(e) => updateSetting('approvalTimeoutMinutes', parseInt(e.target.value) || 60)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Pending approvals will automatically be rejected after this time.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>Configure notification preferences (requires implementation)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Payment received notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when your wallet receives payments
                </p>
              </div>
              <Switch
                checked={settings.notifyOnReceive}
                onCheckedChange={(v) => updateSetting('notifyOnReceive', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Limit warning notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when approaching spending limits (75%+)
                </p>
              </div>
              <Switch
                checked={settings.notifyOnLimitWarning}
                onCheckedChange={(v) => updateSetting('notifyOnLimitWarning', v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
