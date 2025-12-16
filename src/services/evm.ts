import { config } from '../config';
import { Chain, EVMBlock, EVMTransaction, TransactionActivity } from '../types';

export class EVMService {
  private rpcUrls: Record<string, string>;

  constructor() {
    this.rpcUrls = {
      eth: config.rpc.eth,
      base: config.rpc.base,
      avax: config.rpc.avax,
    };
  }

  /**
   * Validate EVM address format 
   */
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Normalize address to lowercase
   */
  normalizeAddress(address: string): string {
    return address.toLowerCase();
  }

  /**
   * Get explorer URL for a chain
   */
  getExplorerUrl(chain: Chain): string {
    const explorers: Record<string, string> = {
      eth: 'https://etherscan.io',
      base: 'https://basescan.org',
      avax: 'https://snowtrace.io',
    };
    return explorers[chain] || '';
  }

  /**
   * Get address explorer link
   */
  getAddressLink(chain: Chain, address: string): string {
    return `${this.getExplorerUrl(chain)}/address/${address}`;
  }

  /**
   * Get transaction explorer link
   */
  getTxLink(chain: Chain, txHash: string): string {
    return `${this.getExplorerUrl(chain)}/tx/${txHash}`;
  }

  /**
   * Make JSON-RPC call
   */
  private async rpcCall(chain: string, method: string, params: any[]): Promise<any> {
    const rpcUrl = this.rpcUrls[chain];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain: ${chain}`);
    }

    try {
      const response = await fetch(rpcUrl, {
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as { error?: { message: string }; result: any };
      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      console.error(`RPC call failed for ${chain}:`, error);
      throw error;
    }
  }

  /**
   * Get latest block number
   */
  async getLatestBlockNumber(chain: string): Promise<number> {
    const result = await this.rpcCall(chain, 'eth_blockNumber', []);
    return parseInt(result, 16);
  }

  /**
   * Get block by number with full transaction objects
   */
  async getBlockByNumber(chain: string, blockNumber: number): Promise<EVMBlock | null> {
    const blockHex = '0x' + blockNumber.toString(16);
    const block = await this.rpcCall(chain, 'eth_getBlockByNumber', [blockHex, true]);
    return block;
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(chain: string, txHash: string): Promise<EVMTransaction | null> {
    return await this.rpcCall(chain, 'eth_getTransactionByHash', [txHash]);
  }

  /**
   * Scan blocks for transactions involving an address
   */
  async scanBlocksForAddress(
    chain: string,
    address: string,
    fromBlock: number,
    toBlock: number
  ): Promise<EVMTransaction[]> {
    const normalizedAddress = this.normalizeAddress(address);
    const transactions: EVMTransaction[] = [];

    // Limit to scanning a reasonable number of blocks to avoid rate limits
    const maxBlocks = 100;
    const actualToBlock = Math.min(toBlock, fromBlock + maxBlocks);

    for (let blockNum = fromBlock; blockNum <= actualToBlock; blockNum++) {
      try {
        const block = await this.getBlockByNumber(chain, blockNum);
        if (!block || !block.transactions) continue;

        for (const tx of block.transactions) {
          if (typeof tx === 'string') continue;

          const txTyped = tx as EVMTransaction;
          const fromMatch = txTyped.from && this.normalizeAddress(txTyped.from) === normalizedAddress;
          const toMatch = txTyped.to && this.normalizeAddress(txTyped.to) === normalizedAddress;

          if (fromMatch || toMatch) {
            txTyped.timestamp = block.timestamp;
            transactions.push(txTyped);
          }
        }
      } catch (error) {
        console.error(`Error scanning block ${blockNum} on ${chain}:`, error);
        // Continue with next block
      }
    }

    return transactions;
  }

  /**
   * Get recent transactions for an address (last ~20 transactions)
   */
  async getRecentTransactions(chain: string, address: string): Promise<TransactionActivity[]> {
    try {
      const latestBlock = await this.getLatestBlockNumber(chain);
      const fromBlock = Math.max(0, latestBlock - 1000); // Scan last ~1000 blocks

      const transactions = await this.scanBlocksForAddress(chain, address, fromBlock, latestBlock);

      return transactions
        .slice(-20) // Take last 20
        .map(tx => this.parseTransaction(address, tx, chain as Chain))
        .reverse(); // Most recent first
    } catch (error) {
      console.error(`Error getting recent transactions for ${address} on ${chain}:`, error);
      return [];
    }
  }

  /**
   * Parse EVM transaction into TransactionActivity
   */
  parseTransaction(targetAddress: string, tx: EVMTransaction, chain: Chain): TransactionActivity {
    const normalizedTarget = this.normalizeAddress(targetAddress);
    const fromAddr = tx.from ? this.normalizeAddress(tx.from) : '';

    const direction = fromAddr === normalizedTarget ? 'out' : 'in';
    const amount = this.weiToEth(tx.value);

    return {
      hash: tx.hash,
      timestamp: tx.timestamp ? parseInt(tx.timestamp, 16) : Date.now() / 1000,
      from: tx.from || '',
      to: tx.to || '',
      amount,
      asset: this.getNativeAsset(chain),
      direction,
    };
  }

  /**
   * Convert wei to ETH/AVAX/etc (18 decimals)
   */
  weiToEth(weiHex: string): number {
    if (!weiHex || weiHex === '0x0') return 0;
    const wei = BigInt(weiHex);
    const eth = Number(wei) / 1e18;
    return Math.round(eth * 1e8) / 1e8; // Round to 8 decimals
  }

  /**
   * Get native asset symbol for chain
   */
  getNativeAsset(chain: Chain): string {
    const assets: Record<string, string> = {
      eth: 'ETH',
      base: 'ETH',
      avax: 'AVAX',
    };
    return assets[chain] || 'NATIVE';
  }

  /**
   * Scan new blocks since last cursor for tracking
   */
  async scanNewBlocks(
    chain: string,
    lastCursor: string,
    trackedAddresses: string[]
  ): Promise<{ transactions: EVMTransaction[]; newCursor: string }> {
    try {
      const latestBlock = await this.getLatestBlockNumber(chain);
      const fromBlock = parseInt(lastCursor) + 1;

      if (fromBlock > latestBlock) {
        return { transactions: [], newCursor: latestBlock.toString() };
      }

      const normalizedAddresses = trackedAddresses.map(addr => this.normalizeAddress(addr));
      const allTransactions: EVMTransaction[] = [];

      // Limit scanning to avoid rate limits
      const maxBlocks = 50;
      const actualToBlock = Math.min(latestBlock, fromBlock + maxBlocks - 1);

      for (let blockNum = fromBlock; blockNum <= actualToBlock; blockNum++) {
        try {
          const block = await this.getBlockByNumber(chain, blockNum);
          if (!block || !block.transactions) continue;

          for (const tx of block.transactions) {
            if (typeof tx === 'string') continue;

            const txTyped = tx as EVMTransaction;
            const fromAddr = txTyped.from ? this.normalizeAddress(txTyped.from) : '';
            const toAddr = txTyped.to ? this.normalizeAddress(txTyped.to) : '';

            if (normalizedAddresses.includes(fromAddr) || normalizedAddresses.includes(toAddr)) {
              txTyped.timestamp = block.timestamp;
              allTransactions.push(txTyped);
            }
          }
        } catch (error) {
          console.error(`Error scanning block ${blockNum}:`, error);
        }
      }

      return {
        transactions: allTransactions,
        newCursor: actualToBlock.toString(),
      };
    } catch (error) {
      console.error(`Error scanning new blocks on ${chain}:`, error);
      return { transactions: [], newCursor: lastCursor };
    }
  }
}

export const evmService = new EVMService();
