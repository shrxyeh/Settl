# Settl X AML Telegram Bot

A comprehensive multi-chain wallet tracking and risk analysis bot for Telegram. Monitor wallets across Ethereum, Base, Avalanche, and Solana with real-time alerts and heuristic risk scoring.

## Features

- 🔍 **Check Wallet**: Analyze any wallet for risk indicators and recent activity
- 📊 **Track Wallets**: Monitor specific addresses and receive Telegram alerts on new transactions
- 🌐 **Multi-Chain Support**: Ethereum, Base, Avalanche, Solana
- ⚡ **Real-Time Alerts**: Get notified instantly when tracked wallets have activity
- 🎯 **Custom Thresholds**: Set minimum transaction amounts for alerts
- 🔒 **Cost Controls**: Built-in limits to prevent excessive API usage

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Public URL for webhook (ngrok for local development)
- RPC endpoints for supported chains

### 1. Get Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow prompts to create your bot
4. Copy the bot token provided

### 2. Setup ngrok (for local development)

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/download

# Start tunnel
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

### 3. Configure RPC Endpoints

Free public RPCs (rate-limited):
- **Ethereum**: `https://eth.llamarpc.com`
- **Base**: `https://mainnet.base.org`
- **Avalanche**: `https://api.avax.network/ext/bc/C/rpc`
- **Solana**: `https://api.mainnet-beta.solana.com`

For production, use paid providers:
- Ethereum/Base: [Alchemy](https://www.alchemy.com/), [Infura](https://www.infura.io/)
- Avalanche: [Avalanche RPC](https://www.avax.network/developers)
- Solana: [Helius](https://www.helius.dev/), [QuickNode](https://www.quicknode.com/)

### 4. Install Dependencies

```bash
npm install
```

### 5. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io

# RPC Endpoints
ETH_RPC_URL=https://eth.llamarpc.com
BASE_RPC_URL=https://mainnet.base.org
AVAX_RPC_URL=https://api.avax.network/ext/bc/C/rpc
SOL_RPC_URL=https://api.mainnet-beta.solana.com

# Server Configuration
PORT=3000

# Worker Configuration (polling intervals in milliseconds)
EVM_POLL_INTERVAL=45000
SOLANA_POLL_INTERVAL=180000

# Cost Control Limits
MAX_TRACKED_PER_USER=20
MAX_TRACKED_TOTAL=200

# Database
DATABASE_URL=file:./dev.db
```

### 6. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

### 7. Start the Bot

**Development mode (with auto-reload):**

Terminal 1 - Server:
```bash
npm run dev
```

Terminal 2 - Worker:
```bash
npm run worker
```

**Production mode:**

```bash
# Build TypeScript
npm run build

# Start server and worker
npm start
npm run worker:prod
```

### 8. Test Your Bot

1. Open Telegram and find your bot
2. Send `/start` command
3. Use the interactive menus to track addresses
4. Test the `/check` command to analyze wallets

## Usage

### Telegram Commands

- `/start` - Start the bot and see welcome message
- `/menu` - Show main menu with buttons
- `/help` - Show help and documentation
- `/check` - Information about wallet checking
- `/tracking` - Manage tracked wallets
  - **View Tracked** - See all your tracked addresses
  - **Add New** - Interactive flow to add a wallet:
    1. Select chain
    2. Enter address
    3. Enter label
    4. Set minimum amount threshold

### API Endpoints

#### 1. Check Wallet

Analyze a wallet for risk and recent activity.

**Endpoint:** `POST /check`

**Request:**
```json
{
  "chain": "eth",
  "targetAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "riskScore": 45,
  "riskLevel": "medium",
  "reasons": [
    "15 transactions analyzed",
    "High transaction frequency detected",
    "Unusual transaction size variation"
  ],
  "recentActivity": [
    {
      "hash": "0x123...",
      "timestamp": 1702834567,
      "from": "0xabc...",
      "to": "0x742...",
      "amount": 1.5,
      "asset": "ETH",
      "direction": "in"
    }
  ],
  "explorerLink": "https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**curl Example:**
```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "eth",
    "targetAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }'
```

#### 2. View Tracked Addresses

Get all tracked addresses for a user.

**Endpoint:** `GET /tracking/view-tracked?telegramUserId=123456789`

**Response:**
```json
{
  "tracked": [
    {
      "id": 1,
      "chain": "eth",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "label": "Suspicious Wallet",
      "minAmount": 0.1,
      "createdAt": "2025-12-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

**curl Example:**
```bash
curl "http://localhost:3000/tracking/view-tracked?telegramUserId=123456789"
```

#### 3. Add New Tracking

Add a new wallet to track.

**Endpoint:** `POST /tracking/add-new`

**Request:**
```json
{
  "telegramUserId": "123456789",
  "chain": "sol",
  "address": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
  "label": "Whale Wallet",
  "minAmount": 10
}
```

**Response:**
```json
{
  "success": true,
  "tracked": {
    "id": 2,
    "chain": "sol",
    "address": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "label": "Whale Wallet",
    "minAmount": 10
  },
  "message": "Now tracking Whale Wallet on SOL"
}
```

**curl Example:**
```bash
curl -X POST http://localhost:3000/tracking/add-new \
  -H "Content-Type: application/json" \
  -d '{
    "telegramUserId": "123456789",
    "chain": "sol",
    "address": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "label": "Whale Wallet",
    "minAmount": 10
  }'
```

#### 4. Remove Tracking

Remove a tracked address.

**Endpoint:** `POST /tracking/remove`

**Request:**
```json
{
  "telegramUserId": "123456789",
  "trackedId": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tracking removed"
}
```

**curl Example:**
```bash
curl -X POST http://localhost:3000/tracking/remove \
  -H "Content-Type: application/json" \
  -d '{
    "telegramUserId": "123456789",
    "trackedId": 2
  }'
```

### Polling Approach

This bot uses a **polling worker** architecture instead of blockchain webhooks to maintain simplicity and cost-effectiveness.

#### Why Polling Over Webhooks?

**Advantages:**
- Works with any free RPC endpoint (no webhook subscription required)
- Predictable costs and resource usage
- Simple to debug and maintain
- No webhook endpoint security concerns
- Works consistently across all chains
- Easy to adjust polling intervals based on needs

**Trade-offs:**
- Alerts have 45-180 second delay (configurable)
- Makes periodic RPC calls even when idle
- Not suitable for millisecond-level precision

#### How It Works

**EVM Chains (Ethereum, Base, Avalanche):**

```
┌─────────────────────────────────────────────────────┐
│  Worker Process (runs every 45 seconds)            │
├─────────────────────────────────────────────────────┤
│  1. Fetch last scanned block from DB (cursor)      │
│  2. Get current block number from RPC               │
│  3. For each block between cursor and current:      │
│     - Fetch block with transactions                 │
│     - Check if any tx involves tracked addresses    │
│     - Parse native token transfers (ETH/AVAX)       │
│     - Create alert events in DB                     │
│  4. Send Telegram alerts for new events             │
│  5. Update cursor to current block                  │
└─────────────────────────────────────────────────────┘
```

**Solana:**

```
┌─────────────────────────────────────────────────────┐
│  Worker Process (runs every 3 minutes)             │
├─────────────────────────────────────────────────────┤
│  1. For each tracked Solana address:               │
│     - Fetch last seen signature from DB             │
│     - Call getSignaturesForAddress(address)         │
│     - Get transactions since last signature         │
│     - Parse balance changes from pre/post balances  │
│     - Create alert events in DB                     │
│  2. Send Telegram alerts for new events             │
│  3. Update last_seen_cursor per address             │
└─────────────────────────────────────────────────────┘
```

**Polling Intervals:**
- EVM chains: 45 seconds (configurable via `EVM_POLL_INTERVAL`)
- Solana: 3 minutes (configurable via `SOLANA_POLL_INTERVAL`)

Adjust based on your needs:
- Higher frequency = faster alerts but more RPC calls
- Lower frequency = fewer RPC calls but delayed alerts

### Risk Scoring Heuristic

The bot analyzes wallet activity using a multi-factor heuristic algorithm to calculate risk scores (0-100).

#### Scoring Components

**1. Transaction Velocity (0-25 points)**
- Measures transaction frequency
- Very high frequency (< 5 min average): +25 points → Bot/automated activity
- Moderate frequency (< 1 hour average): +10 points → Suspicious activity
- Rationale: Legitimate users don't transact every few minutes

**2. Transaction Spikes (0-20 points)**
- Detects abnormal transaction amounts
- Large tx (> 3x average): +20 points → Money laundering indicator
- Moderate spike (> 2x average): +10 points → Unusual behavior
- Rationale: Sudden large amounts suggest mixing or cashing out

**3. Wallet Age (0-20 points)**
- Analyzes wallet creation date vs. activity
- New wallet (< 7 days) with high activity: +20 points → Burner wallet
- Wallet < 30 days with high activity: +10 points → Suspicious
- Rationale: Criminals often use fresh wallets to avoid tracking

**4. Pattern Detection (0-15 points)**
- Identifies scripted/automated behavior
- Many round-number txs (> 30%): +15 points → Automated transfers
- Rationale: Humans rarely transact in exact round numbers

**5. Flow Analysis (0-20 points)**
- Examines money flow patterns
- Rapid outflows after inflows (< 1 hour): +20 points → Layering technique
- Only outflows, no inflows: +10 points → Distribution wallet
- Rationale: Legitimate wallets have balanced in/out flows

#### Risk Level Classification

```
Score    Level      Emoji  Interpretation
─────────────────────────────────────────────────
0-24     Low        ✅     Normal activity
25-49    Medium     ⚠️      Some red flags
50-69    High       🚨     Multiple indicators
70-100   Critical   🔴     Extremely suspicious
```

#### Example Calculation

```javascript
// Example wallet analysis:
Wallet: 0x1234...5678
Recent Transactions: 150 in last 24 hours

Velocity: 150 txs / 24 hours = 9.6 min average → +25 points
Spikes: Max tx is 10 ETH, avg is 0.5 ETH (20x) → +20 points  
Age: Wallet created 3 days ago → +20 points
Patterns: 45% round numbers (e.g., 1.0, 2.0 ETH) → +15 points
Flow: Received 50 ETH, sent 49 ETH in 30 min → +20 points

Total Risk Score: 100/100 → CRITICAL 🔴
```

### Deduplication & Cursor Logic

Prevents duplicate alerts and ensures efficient blockchain scanning.

#### Deduplication Strategy

**Database Constraint:**
```sql
UNIQUE(chain, tx_hash_or_sig, tracked_address_id)
```

**How it works:**
1. Worker finds new transaction involving tracked address
2. Creates `AlertEvent` record with (chain, tx_hash, tracked_address_id)
3. Database rejects if duplicate exists (unique constraint)
4. Only new events trigger Telegram alerts

**Benefits:**
- Prevents spam if transaction involves multiple tracked addresses
- Handles blockchain reorganizations gracefully
- Database-level guarantee (no race conditions)

#### Cursor Management

**EVM Chains (Shared Cursor):**

```
Table: chain_cursors
┌─────────┬──────────────────┬────────────────┐
│ chain   │ lastBlockNumber  │ updatedAt      │
├─────────┼──────────────────┼────────────────┤
│ eth     │ 18534521         │ 2025-12-16 ... │
│ base    │ 7821032          │ 2025-12-16 ... │
│ avax    │ 39215478         │ 2025-12-16 ... │
└─────────┴──────────────────┴────────────────┘
```

**Logic:**
1. Read `lastBlockNumber` for chain
2. Scan blocks from `lastBlockNumber + 1` to `currentBlock`
3. Process all tracked addresses in those blocks
4. Update `lastBlockNumber` to `currentBlock`

**Solana (Per-Address Cursor):**

```
Table: tracked_addresses
┌────────┬─────────┬──────────────────────────┐
│ chain  │ address │ lastSeenCursor           │
├────────┼─────────┼──────────────────────────┤
│ sol    │ DYw8... │ 5j7K...signature...xyz   │
└────────┴─────────┴──────────────────────────┘
```

**Logic:**
1. For each Solana address, read `lastSeenCursor`
2. Call `getSignaturesForAddress(address, until: lastSeenCursor)`
3. Process new signatures
4. Update `lastSeenCursor` to most recent signature

**Why Different Approaches?**
- EVM: Block-based (efficient to scan all addresses in a block)
- Solana: Account-based (must query per address)

#### Edge Cases Handled

**1. First Scan (No Cursor)**
- EVM: Initialize to (currentBlock - 100) to avoid scanning entire history
- Solana: Initialize to latest signature

**2. Blockchain Reorganization**
- Deduplication prevents duplicate alerts
- Next scan will pick up reorganized blocks

**3. Worker Downtime**
- EVM: Catches up by scanning missed blocks (limited to 100 blocks/scan for safety)
- Solana: Fetches all signatures since last cursor

**4. Multiple Workers**
- Use database transactions for cursor updates
- Deduplication ensures no duplicate alerts even if workers overlap

## Project Structure
```
settl-bot/
├── node_modules/              # Dependencies
├── prisma/
│   ├── migrations/
│   │   └── 20251215180409_settl/  # Database migration
│   ├── schema.prisma          # Main database schema
│   ├── schema.heroku.prisma   # Heroku-specific schema
│   ├── migration_lock.toml    # Migration lock file
│   ├── dev.db                 # SQLite database (development)
│   └── .gitkeep
├── src/
│   ├── routes/
│   │   ├── telegram.ts        # Telegram webhook & commands
│   │   ├── check.ts           # Wallet check endpoint
│   │   └── tracking.ts        # Tracking management endpoints
│   ├── services/
│   │   ├── telegram.ts        # Telegram API client
│   │   ├── evm.ts             # EVM blockchain service
│   │   ├── solana.ts          # Solana blockchain service
│   │   └── risk.ts            # Risk scoring logic
│   ├── config.ts              # Configuration management
│   ├── db.ts                  # Prisma client
│   ├── types.ts               # TypeScript types
│   ├── server.ts              # Express server
│   └── worker.ts              # Polling worker
├── .env                       # Environment variables (local)
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies
├── package-lock.json          # Dependency lock file
├── tsconfig.json              # TypeScript config
└── README.md                  # This file
```

## Database Schema

### Users Table
- `id`: Primary key
- `telegram_user_id`: Unique Telegram user ID
- `created_at`: Timestamp

### Tracked Addresses Table
- `id`: Primary key
- `user_id`: Foreign key to users
- `chain`: eth | base | avax | sol
- `address`: Wallet address
- `label`: User-defined label
- `min_amount`: Minimum transaction amount threshold
- `is_active`: Boolean flag
- `last_seen_cursor`: Last scanned block/signature
- `created_at`: Timestamp

### Alert Events Table
- `id`: Primary key
- `tracked_address_id`: Foreign key to tracked_addresses
- `chain`: Chain identifier
- `tx_hash_or_sig`: Transaction hash or signature
- `timestamp`: Transaction timestamp
- `direction`: in | out
- `amount`: Transaction amount
- `asset`: Asset symbol (ETH, AVAX, SOL, etc.)
- `sent_to_telegram`: Boolean flag

**Unique constraint:** `(chain, tx_hash_or_sig, tracked_address_id)` - Ensures no duplicate alerts

### Chain Cursors Table
- `id`: Primary key
- `chain`: Chain identifier (eth, base, avax)
- `last_block_number`: Last scanned block number
- `updated_at`: Timestamp

## Configuration

All configuration is managed via environment variables:

- **TELEGRAM_BOT_TOKEN**: Bot authentication token
- **PUBLIC_BASE_URL**: Public URL for webhook (must be HTTPS)
- **ETH_RPC_URL, BASE_RPC_URL, AVAX_RPC_URL, SOL_RPC_URL**: Blockchain RPC endpoints
- **PORT**: Server port (default: 3000)
- **EVM_POLL_INTERVAL**: EVM polling interval in ms (default: 45000)
- **SOLANA_POLL_INTERVAL**: Solana polling interval in ms (default: 180000)
- **MAX_TRACKED_PER_USER**: Max addresses per user (default: 20)
- **MAX_TRACKED_TOTAL**: Max total tracked addresses (default: 200)
- **DATABASE_URL**: Database connection string

## Limitations

1. **Native Tokens Only**: Currently tracks only native token transfers (ETH, AVAX, SOL). Token transfers (ERC-20, SPL tokens) are not yet supported but can be added by parsing transaction logs/instructions.

2. **Block Scanning Limits**: EVM scanning is limited to prevent rate limiting. Max 100 blocks per scan per chain. Adjust `EVM_POLL_INTERVAL` for busy chains.

3. **Public RPC Rate Limits**: Free RPCs have rate limits and may miss transactions during high load. Use paid RPCs for production.

4. **Solana Parsing**: Simplified SOL balance change detection. Complex multi-instruction transactions may not parse accurately. Consider using parsed transaction data from premium RPCs.

## Troubleshooting

### Webhook Not Working
- Ensure `PUBLIC_BASE_URL` is HTTPS
- Check ngrok is running and URL matches
- Verify bot token is correct
- Check server logs for webhook setup errors

### Missing Transactions
- Check worker is running (`npm run worker`)
- Verify RPC endpoints are responding
- Check polling intervals in `.env`
- Look for rate limit errors in logs

### Database Errors
- Run `npm run prisma:generate` after schema changes
- Run `npm run prisma:migrate` to apply migrations
- Check `DATABASE_URL` path is correct

### RPC Rate Limits
- Reduce polling frequency
- Use paid RPC providers
- Implement exponential backoff (future enhancement)

## Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start dev server (with auto-reload)
npm run dev

# Start worker (separate terminal)
npm run worker

# Open Prisma Studio
npm run prisma:studio

# Build for production
npm run build

# Run production
npm start
npm run worker:prod
```

## Security Notes

- Never commit `.env` file
- Keep bot token secret
- Use HTTPS for webhooks
- Validate all user inputs
- Sanitize addresses before database storage
- Implement rate limiting for API endpoints in production

## License

MIT

---

**Built with ❤️ for Settl X**