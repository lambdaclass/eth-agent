# eth-agent Dashboard

A web dashboard for managing AI agent wallets powered by the eth-agent library. This frontend provides a human-in-the-loop interface for monitoring and controlling autonomous Ethereum agents.

## Features

- **Dashboard Overview**: Monitor wallet balances (ETH + stablecoins), spending limits, and pending approvals
- **Transaction History**: View all transactions with filtering and search
- **Pending Approvals**: Review and approve/reject transactions requiring human authorization
- **Spending Limits**: View current limits and usage (configured via environment variables)
- **Address Management**: UI for trusted and blocked addresses (demo)
- **Settings**: Configuration options (requires backend implementation)

## Quick Start

### Prerequisites

- Node.js 18+
- The eth-agent library must be built first

### 1. Build the eth-agent library

```bash
# From the root eth-agent directory
cd /path/to/eth-agent
npm install
npm run build
```

### 2. Set up environment variables

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Required: Your Ethereum private key (with 0x prefix)
ETH_PRIVATE_KEY=0x...

# Optional: RPC URL (defaults to https://eth.llamarpc.com)
RPC_URL=https://eth.llamarpc.com

# Optional: Chain ID for display (defaults to 1)
CHAIN_ID=1

# Optional: Spending limits
LIMIT_PER_TX=1000 USDC
LIMIT_PER_HOUR=5000 USDC
LIMIT_PER_DAY=20000 USDC

# Optional: Approval timeout in minutes (defaults to 60)
APPROVAL_TIMEOUT_MINUTES=60
```

### 3. Install and run

```bash
npm install
npm run dev
```

The dashboard will be available at **http://localhost:3000**

## How It Works

### Real Data Integration

The frontend connects to the actual eth-agent library:

1. **Wallet State**: Reads from `AgentWallet.address` and configured chain
2. **Balances**: Calls `wallet.getBalance()` and `wallet.getStablecoinBalances()`
3. **Limits**: Calls `wallet.getLimits()` to get current spending limit status
4. **Approvals**: The wallet's `onApprovalRequired` callback stores pending approvals that appear in the dashboard

### Approval Flow

When your AI agent tries to make a transaction that requires approval:

1. The `AgentWallet.sendUSDC()` (or similar) call triggers the approval engine
2. The `onApprovalRequired` callback in `lib/wallet-server.ts` creates a pending approval
3. The approval appears in the dashboard at `/transactions/pending`
4. You approve or reject via the UI
5. The promise resolves and the transaction proceeds (or fails)

### Transaction History

Transactions are stored in memory during the session. For production use, you'd want to:
- Persist transactions to a database
- Index historical transactions from the blockchain
- Use the `recordTransaction()` helper in `lib/transactions-store.ts` after successful sends

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes connecting to eth-agent
│   │   ├── wallet/        # Wallet state & balances
│   │   ├── transactions/  # Transaction history
│   │   ├── approvals/     # Pending approval management
│   │   └── limits/        # Spending limits
│   ├── transactions/      # Transaction pages
│   ├── limits/            # Limits configuration
│   ├── addresses/         # Address management
│   ├── settings/          # Settings page
│   └── page.tsx           # Dashboard home
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard-specific components
│   └── shared/           # Reusable components
├── hooks/                 # React Query hooks
├── lib/
│   ├── wallet-server.ts  # AgentWallet instance management
│   ├── transactions-store.ts # In-memory transaction store
│   ├── api.ts            # API client
│   ├── wallet.ts         # Type definitions
│   └── utils.ts          # Utility functions
└── package.json
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ETH_PRIVATE_KEY` | Yes | - | Ethereum private key with 0x prefix |
| `RPC_URL` | No | `https://eth.llamarpc.com` | Ethereum RPC endpoint |
| `CHAIN_ID` | No | `1` | Chain ID for display purposes |
| `LIMIT_PER_TX` | No | `1000 USDC` | Per-transaction spending limit |
| `LIMIT_PER_HOUR` | No | `5000 USDC` | Hourly spending limit |
| `LIMIT_PER_DAY` | No | `20000 USDC` | Daily spending limit |
| `APPROVAL_TIMEOUT_MINUTES` | No | `60` | Approval request timeout |

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix UI primitives)
- **State Management**: React Query (TanStack Query)
- **Icons**: Lucide React

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Limitations

- **Limits**: Spending limits are configured at wallet startup. The UI shows current usage but changes require restarting with new environment variables.
- **Addresses**: Trusted/blocked address management is demo-only in the UI. Configure via `AgentWalletConfig` in `lib/wallet-server.ts`.
- **Transactions**: History is stored in memory and resets on restart. Implement persistence for production.
- **Notifications**: Notification settings are UI-only and need backend implementation.

## Security

**Never commit your `.env.local` file or private keys to version control.**

The private key is only used server-side in API routes. It never reaches the client.

## License

MIT
