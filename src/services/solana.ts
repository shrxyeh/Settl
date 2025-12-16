import { config } from '../config';
import { SolanaSignature, SolanaTransaction, TransactionActivity } from '../types';

export class SolanaService {
  private rpcUrl: string;

  constructor() {
    this.rpcUrl = config.rpc.sol;
  }

  /**
   * Basic Solana address validation (base58 format, ~32-44 chars)
   */
  isValidAddress(address: string): boolean {
    // Basic check: base58 characters and reasonable length
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }

  /**
   * Get explorer URL
   */
  getExplorerUrl(): string {
    return 'https://solscan.io';
  }

  /**
   * Get address explorer link
   */
  getAddressLink(address: string): string {
    return `${this.getExplorerUrl()}/account/${address}`;
  }

  /**
   * Get transaction explorer link
   */
  getTxLink(signature: string): string {
    return `${this.getExplorerUrl()}/tx/${signature}`;
  }

  /**
   * Make JSON-RPC call to Solana
   */
  private async rpcCall(method: string, params: any[]): Promise<any> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });

      const data = await response.json() as { error?: { message: string }; result: any };
      if (data.error) {
        throw new Error(`Solana RPC error: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      console.error('Solana RPC call failed:', error);
      throw error;
    }
  }

  /**
   * Get signatures for an address (with optional before cursor)
   */
  async getSignaturesForAddress(
    address: string,
    limit: number = 20,
    before?: string
  ): Promise<SolanaSignature[]> {
    try {
      const params: any = [
        address,
        {
          limit,
        },
      ];

      if (before) {
        params[1].before = before;
      }

      const result = await this.rpcCall('getSignaturesForAddress', params);
      return result || [];
    } catch (error) {
      console.error(`Error getting signatures for ${address}:`, error);
      return [];
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(signature: string): Promise<SolanaTransaction | null> {
    try {
      const result = await this.rpcCall('getTransaction', [
        signature,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        },
      ]);
      return result;
    } catch (error) {
      console.error(`Error getting transaction ${signature}:`, error);
      return null;
    }
  }

  /**
   * Get recent transactions for an address
   */
  async getRecentTransactions(address: string): Promise<TransactionActivity[]> {
    try {
      const signatures = await this.getSignaturesForAddress(address, 20);
      const activities: TransactionActivity[] = [];

      for (const sig of signatures) {
        if (sig.err) continue; // Skip failed transactions

        const tx = await this.getTransaction(sig.signature);
        if (!tx) continue;

        const activity = this.parseTransaction(address, sig, tx);
        if (activity) {
          activities.push(activity);
        }
      }

      return activities;
    } catch (error) {
      console.error(`Error getting recent transactions for ${address}:`, error);
      return [];
    }
  }

  /**
   * Parse Solana transaction into TransactionActivity
   */
  parseTransaction(
    targetAddress: string,
    signature: SolanaSignature,
    tx: SolanaTransaction
  ): TransactionActivity | null {
    try {
      const accountKeys = tx.transaction.message.accountKeys;
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;

      // Find the index of the target address
      let targetIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i] === targetAddress) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) return null;

      // Calculate balance change (in lamports)
      const preLamports = preBalances[targetIndex] || 0;
      const postLamports = postBalances[targetIndex] || 0;
      const balanceChange = postLamports - preLamports;

      // Determine direction
      const direction = balanceChange >= 0 ? 'in' : 'out';
      const amount = Math.abs(this.lamportsToSol(balanceChange));

      // Extract from/to (simplified)
      const from = accountKeys[0] || ''; // First signer is usually sender
      const to = accountKeys[1] || targetAddress;

      return {
        hash: signature.signature,
        timestamp: signature.blockTime || Date.now() / 1000,
        from,
        to,
        amount,
        asset: 'SOL',
        direction,
      };
    } catch (error) {
      console.error('Error parsing Solana transaction:', error);
      return null;
    }
  }

  /**
   * Convert lamports to SOL (9 decimals)
   */
  lamportsToSol(lamports: number): number {
    const sol = lamports / 1e9;
    return Math.round(sol * 1e8) / 1e8; // Round to 8 decimals
  }

  /**
   * Get new signatures since cursor for tracking
   */
  async getNewSignatures(
    address: string,
    lastCursor?: string
  ): Promise<{ signatures: SolanaSignature[]; newCursor: string | null }> {
    try {
      // If no cursor, get latest signatures
      const signatures = await this.getSignaturesForAddress(address, 50);

      if (signatures.length === 0) {
        return { signatures: [], newCursor: lastCursor || null };
      }

      // Filter signatures newer than cursor
      let newSignatures = signatures;
      if (lastCursor) {
        const cursorIndex = signatures.findIndex(sig => sig.signature === lastCursor);
        if (cursorIndex > 0) {
          newSignatures = signatures.slice(0, cursorIndex);
        } else if (cursorIndex === 0) {
          newSignatures = [];
        }
        // If not found, treat all as new (cursor is old)
      }

      // New cursor is the most recent signature
      const newCursor = signatures[0]?.signature || lastCursor || null;

      return { signatures: newSignatures, newCursor };
    } catch (error) {
      console.error(`Error getting new signatures for ${address}:`, error);
      return { signatures: [], newCursor: lastCursor || null };
    }
  }

  /**
   * Parse amount from Solana transaction for tracking
   */
  async parseTransactionAmount(
    targetAddress: string,
    signature: string
  ): Promise<{ amount: number; direction: 'in' | 'out' } | null> {
    try {
      const tx = await this.getTransaction(signature);
      if (!tx) return null;

      const accountKeys = tx.transaction.message.accountKeys;
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;

      let targetIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i] === targetAddress) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) return null;

      const preLamports = preBalances[targetIndex] || 0;
      const postLamports = postBalances[targetIndex] || 0;
      const balanceChange = postLamports - preLamports;

      const direction = balanceChange >= 0 ? 'in' : 'out';
      const amount = Math.abs(this.lamportsToSol(balanceChange));

      return { amount, direction };
    } catch (error) {
      console.error('Error parsing transaction amount:', error);
      return null;
    }
  }
}

export const solanaService = new SolanaService();
