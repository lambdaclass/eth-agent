'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, AlertCircle } from 'lucide-react';
import type { CreateStrategyRequest } from '@/lib/strategy-types';

interface CreateStrategyFormProps {
  onSubmit: (data: CreateStrategyRequest) => Promise<unknown>;
  isLoading?: boolean;
}

export function CreateStrategyForm({ onSubmit, isLoading }: CreateStrategyFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!privateKey.trim()) {
      setError('Private key is required');
      return;
    }
    if (!prompt.trim()) {
      setError('Trading strategy prompt is required');
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        privateKey: privateKey.trim(),
        prompt: prompt.trim(),
      });
      // Reset form and close dialog on success
      setName('');
      setPrivateKey('');
      setPrompt('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create strategy');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Strategy
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Trading Strategy</DialogTitle>
            <DialogDescription>
              Define a new autonomous trading strategy. The strategy will use Claude to
              execute your trading logic.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="name">Strategy Name</Label>
              <Input
                id="name"
                placeholder="e.g., ETH DCA Strategy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="privateKey">Private Key</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="0x..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                The private key for the wallet this strategy will use. Keep this secure.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prompt">Trading Strategy</Label>
              <textarea
                id="prompt"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Describe your trading strategy in natural language. For example:&#10;&#10;Check my ETH balance every hour. If I have more than 0.5 ETH, send 0.1 ETH to 0x1234... as part of my DCA strategy."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Describe what you want the AI agent to do. Be specific about conditions and
                actions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Strategy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
