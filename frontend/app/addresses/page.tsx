'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { formatDate } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import type { AddressEntry } from '@/lib/wallet';
import { Plus, Trash2, ShieldCheck, ShieldX, Search, Info } from 'lucide-react';

// Note: Address management would need API endpoints to persist
// For now, this is a local state demo that shows the UI

export default function AddressesPage() {
  const { data: wallet } = useWallet();
  const [trusted, setTrusted] = useState<AddressEntry[]>([]);
  const [blocked, setBlocked] = useState<AddressEntry[]>([]);
  const [search, setSearch] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newReason, setNewReason] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<'trusted' | 'blocked'>('trusted');

  const chainId = wallet?.chainId ?? 1;

  const handleAdd = () => {
    const entry: AddressEntry = {
      address: newAddress,
      label: newLabel || undefined,
      reason: newReason || undefined,
      addedAt: Date.now(),
    };

    if (addType === 'trusted') {
      setTrusted([...trusted, entry]);
    } else {
      setBlocked([...blocked, entry]);
    }

    setNewAddress('');
    setNewLabel('');
    setNewReason('');
    setAddDialogOpen(false);
  };

  const removeTrusted = (address: string) => {
    setTrusted(trusted.filter((e) => e.address !== address));
  };

  const removeBlocked = (address: string) => {
    setBlocked(blocked.filter((e) => e.address !== address));
  };

  const openAddDialog = (type: 'trusted' | 'blocked') => {
    setAddType(type);
    setAddDialogOpen(true);
  };

  const filterEntries = (entries: AddressEntry[]) => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.address.toLowerCase().includes(q) ||
        e.label?.toLowerCase().includes(q) ||
        e.reason?.toLowerCase().includes(q)
    );
  };

  return (
    <div className="flex flex-col h-full">
      <Header wallet={wallet ?? null} />
      <div className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Address Management</h1>
          <p className="text-muted-foreground">
            Manage trusted and blocked addresses for your AI agent
          </p>
        </div>

        {/* Info Banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Trusted and blocked addresses are configured at wallet startup.
                Changes made here are for demonstration and won&apos;t persist after page reload.
                Configure permanent addresses via environment variables or the wallet config.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search addresses..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Trusted Addresses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  <CardTitle>Trusted Addresses</CardTitle>
                </div>
                <Button size="sm" onClick={() => openAddDialog('trusted')}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <CardDescription>
                Transactions to these addresses will skip approval requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filterEntries(trusted).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No trusted addresses configured
                </p>
              ) : (
                <div className="space-y-3">
                  {filterEntries(trusted).map((entry) => (
                    <div
                      key={entry.address}
                      className="flex items-start justify-between p-3 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <AddressDisplay
                          address={entry.address}
                          label={entry.label}
                          chainId={chainId}
                        />
                        {entry.reason && (
                          <p className="text-xs text-muted-foreground">{entry.reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Added {formatDate(entry.addedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeTrusted(entry.address)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blocked Addresses */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldX className="h-5 w-5 text-red-600" />
                  <CardTitle>Blocked Addresses</CardTitle>
                </div>
                <Button size="sm" variant="destructive" onClick={() => openAddDialog('blocked')}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <CardDescription>
                All transactions to these addresses will be automatically rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filterEntries(blocked).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No blocked addresses configured
                </p>
              ) : (
                <div className="space-y-3">
                  {filterEntries(blocked).map((entry) => (
                    <div
                      key={entry.address}
                      className="flex items-start justify-between p-3 border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 rounded-lg"
                    >
                      <div className="space-y-1">
                        <AddressDisplay
                          address={entry.address}
                          label={entry.label}
                          chainId={chainId}
                        />
                        {entry.reason && (
                          <p className="text-xs text-red-700 dark:text-red-300">{entry.reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Blocked {formatDate(entry.addedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBlocked(entry.address)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Address Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {addType === 'trusted' ? 'Trusted' : 'Blocked'} Address
            </DialogTitle>
            <DialogDescription>
              {addType === 'trusted'
                ? 'Transactions to trusted addresses will skip approval requirements.'
                : 'All transactions to blocked addresses will be automatically rejected.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                placeholder="0x... or ENS name"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                placeholder="e.g., Company Treasury"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                placeholder="Why is this address trusted/blocked?"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newAddress}
              variant={addType === 'blocked' ? 'destructive' : 'default'}
            >
              Add {addType === 'trusted' ? 'Trusted' : 'Blocked'} Address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
