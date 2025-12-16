// Supported blockchain chains
export type Chain = 'eth' | 'base' | 'avax' | 'sol';

export const CHAIN_NAMES: Record<Chain, string> = {
  eth: 'Ethereum',
  base: 'Base',
  avax: 'Avalanche',
  sol: 'Solana',
};

// Transaction direction
export type Direction = 'in' | 'out';

// Risk level classification
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// Transaction activity for display
export interface TransactionActivity {
  hash: string;
  timestamp: number;
  from: string;
  to: string;
  amount: number;
  asset: string;
  direction: Direction;
}

// Check result from /check endpoint
export interface CheckResult {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  recentActivity: TransactionActivity[];
  explorerLink: string;
}

// Telegram update types
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

// User state for interactive flows (add-new tracking, check-wallet)
export interface UserState {
  action: 'add-new' | 'check-wallet';
  step: 'chain' | 'address' | 'label' | 'min-amount';
  data: {
    chain?: Chain;
    address?: string;
    label?: string;
  };
  timestamp: number;
}

// EVM RPC types
export interface EVMBlock {
  number: string;
  timestamp: string;
  transactions: (string | EVMTransaction)[];
}

export interface EVMTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  timestamp?: string;
}

// Solana RPC types
export interface SolanaSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: any;
}

export interface SolanaTransaction {
  slot: number;
  transaction: {
    message: {
      accountKeys: string[];
      instructions: any[];
    };
    signatures: string[];
  };
  meta: {
    err: any;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: any[];
    postTokenBalances?: any[];
  };
  blockTime: number | null;
}
