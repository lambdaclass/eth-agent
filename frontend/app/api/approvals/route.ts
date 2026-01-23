import { NextResponse } from 'next/server';
import { getPendingApprovals, approveTransaction, rejectTransaction } from '@/lib/wallet-server';

export async function GET() {
  try {
    const approvals = getPendingApprovals();
    return NextResponse.json(approvals);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get approvals';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, id, reason } = await request.json();

    if (action === 'approve' && id) {
      const success = approveTransaction(id);
      if (success) {
        return NextResponse.json({ success: true, action: 'approved' });
      }
      return NextResponse.json({ error: 'Approval not found or already processed' }, { status: 404 });
    }

    if (action === 'reject' && id) {
      const success = rejectTransaction(id);
      if (success) {
        return NextResponse.json({ success: true, action: 'rejected', reason });
      }
      return NextResponse.json({ error: 'Approval not found or already processed' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process approval';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
