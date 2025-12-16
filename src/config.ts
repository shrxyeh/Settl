import dotenv from 'dotenv';

dotenv.config();

interface Config {
  telegram: {
    botToken: string;
    publicBaseUrl: string;
  };
  rpc: {
    eth: string;
    base: string;
    avax: string;
    sol: string;
  };
  server: {
    port: number;
  };
  worker: {
    evmPollInterval: number;
    solanaPollInterval: number;
  };
  limits: {
    maxTrackedPerUser: number;
    maxTrackedTotal: number;
  };
  database: {
    url: string;
  };
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  telegram: {
    botToken: getEnvOrThrow('TELEGRAM_BOT_TOKEN'),
    publicBaseUrl: getEnvOrThrow('PUBLIC_BASE_URL'),
  },
  rpc: {
    eth: getEnvOrThrow('ETH_RPC_URL'),
    base: getEnvOrThrow('BASE_RPC_URL'),
    avax: getEnvOrThrow('AVAX_RPC_URL'),
    sol: getEnvOrThrow('SOL_RPC_URL'),
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
  },
  worker: {
    evmPollInterval: parseInt(process.env.EVM_POLL_INTERVAL || '45000', 10),
    solanaPollInterval: parseInt(process.env.SOLANA_POLL_INTERVAL || '180000', 10),
  },
  limits: {
    maxTrackedPerUser: parseInt(process.env.MAX_TRACKED_PER_USER || '20', 10),
    maxTrackedTotal: parseInt(process.env.MAX_TRACKED_TOTAL || '200', 10),
  },
};
