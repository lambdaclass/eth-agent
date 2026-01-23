'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import { useLimits } from '@/hooks/useLimits';
import { Zap, Clock, Calendar, Save, RotateCcw, Shield, ShieldAlert, ShieldOff, Loader2, Info } from 'lucide-react';

const PRESETS = {
  conservative: {
    name: 'Conservative',
    description: 'Low limits for maximum safety',
    icon: Shield,
    perTransaction: 100,
    perHour: 500,
    perDay: 2000,
    color: 'text-green-600',
  },
  balanced: {
    name: 'Balanced',
    description: 'Moderate limits for everyday use',
    icon: ShieldAlert,
    perTransaction: 1000,
    perHour: 5000,
    perDay: 20000,
    color: 'text-yellow-600',
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Higher limits for power users',
    icon: ShieldOff,
    perTransaction: 10000,
    perHour: 50000,
    perDay: 200000,
    color: 'text-red-600',
  },
};

export default function LimitsPage() {
  const { data: wallet } = useWallet();
  const { limits, isLoading, updateLimits, isUpdating } = useLimits();

  // Parse current limits from the API response
  const parseValue = (str: string): number => {
    if (!str) return 0;
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const [perTransaction, setPerTransaction] = useState(1000);
  const [perHour, setPerHour] = useState(5000);
  const [perDay, setPerDay] = useState(20000);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when limits load
  useEffect(() => {
    if (limits) {
      setPerTransaction(parseValue(limits.perTransaction.limit));
      setPerHour(parseValue(limits.hourly.limit));
      setPerDay(parseValue(limits.daily.limit));
    }
  }, [limits]);

  const currentUsage = {
    hourly: { used: parseValue(limits?.hourly.used ?? '0'), percentage: limits?.hourly.percentage ?? 0 },
    daily: { used: parseValue(limits?.daily.used ?? '0'), percentage: limits?.daily.percentage ?? 0 },
  };

  const handlePreset = (preset: keyof typeof PRESETS) => {
    const p = PRESETS[preset];
    setPerTransaction(p.perTransaction);
    setPerHour(p.perHour);
    setPerDay(p.perDay);
    setHasChanges(true);
  };

  const handleSave = () => {
    updateLimits({
      perTransaction: `${perTransaction} USDC`,
      perHour: `${perHour} USDC`,
      perDay: `${perDay} USDC`,
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    if (limits) {
      setPerTransaction(parseValue(limits.perTransaction.limit));
      setPerHour(parseValue(limits.hourly.limit));
      setPerDay(parseValue(limits.daily.limit));
    }
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header wallet={wallet ?? null} />
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
            <h1 className="text-2xl font-bold tracking-tight">Spending Limits</h1>
            <p className="text-muted-foreground">
              Configure spending limits for your AI agent wallet
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                Limits are configured at wallet startup via environment variables.
                Changes here show the desired configuration but require restarting the wallet service to take effect.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Presets */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Presets</CardTitle>
            <CardDescription>Apply pre-configured safety profiles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handlePreset(key as keyof typeof PRESETS)}
                  className="flex flex-col items-start p-4 border rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <preset.icon className={cn('h-5 w-5', preset.color)} />
                    <span className="font-semibold">{preset.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{preset.description}</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Per TX: ${preset.perTransaction.toLocaleString()}</p>
                    <p>Hourly: ${preset.perHour.toLocaleString()}</p>
                    <p>Daily: ${preset.perDay.toLocaleString()}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Custom Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Limits</CardTitle>
            <CardDescription>Fine-tune your spending limits (in USDC equivalent)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Per Transaction */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Per Transaction Limit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={perTransaction}
                    onChange={(e) => {
                      setPerTransaction(Number(e.target.value));
                      setHasChanges(true);
                    }}
                    className="w-32 text-right"
                  />
                  <span className="text-sm text-muted-foreground">USDC</span>
                </div>
              </div>
              <Slider
                value={[perTransaction]}
                onValueChange={([v]) => {
                  setPerTransaction(v);
                  setHasChanges(true);
                }}
                max={50000}
                step={100}
              />
              <p className="text-sm text-muted-foreground">
                Maximum amount allowed per single transaction
              </p>
            </div>

            {/* Hourly */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Hourly Limit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={perHour}
                    onChange={(e) => {
                      setPerHour(Number(e.target.value));
                      setHasChanges(true);
                    }}
                    className="w-32 text-right"
                  />
                  <span className="text-sm text-muted-foreground">USDC</span>
                </div>
              </div>
              <Slider
                value={[perHour]}
                onValueChange={([v]) => {
                  setPerHour(v);
                  setHasChanges(true);
                }}
                max={100000}
                step={500}
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Rolling limit resets every hour. Currently used: ${currentUsage.hourly.used.toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  {currentUsage.hourly.percentage.toFixed(1)}%
                </span>
              </div>
              <Progress value={currentUsage.hourly.percentage} className="h-2" />
            </div>

            {/* Daily */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Daily Limit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={perDay}
                    onChange={(e) => {
                      setPerDay(Number(e.target.value));
                      setHasChanges(true);
                    }}
                    className="w-32 text-right"
                  />
                  <span className="text-sm text-muted-foreground">USDC</span>
                </div>
              </div>
              <Slider
                value={[perDay]}
                onValueChange={([v]) => {
                  setPerDay(v);
                  setHasChanges(true);
                }}
                max={500000}
                step={1000}
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Rolling limit resets every 24 hours. Currently used: ${currentUsage.daily.used.toLocaleString()}
                </span>
                <span className="text-muted-foreground">
                  {currentUsage.daily.percentage.toFixed(1)}%
                </span>
              </div>
              <Progress value={currentUsage.daily.percentage} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
