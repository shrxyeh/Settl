import prisma from './db';
import { config } from './config';
import { evmService } from './services/evm';
import { solanaService } from './services/solana';
import { telegramService } from './services/telegram';

/**
 * Polling Worker
 * Scans blockchain for new activity on tracked addresses and sends alerts
 */

console.log('🔄 Starting polling worker...\n');

// Track last poll times
let lastEvmPoll = Date.now();
let lastSolanaPoll = Date.now();

/**
 * Main worker loop
 */
async function runWorker() {
  const now = Date.now();

  // Poll EVM chains
  if (now - lastEvmPoll >= config.worker.evmPollInterval) {
    await pollEvmChains();
    lastEvmPoll = now;
  }

  // Poll Solana
  if (now - lastSolanaPoll >= config.worker.solanaPollInterval) {
    await pollSolana();
    lastSolanaPoll = now;
  }

  // Schedule next iteration
  setTimeout(runWorker, 5000); // Check every 5 seconds
}

/**
 * Poll EVM chains (ETH, Base, Avalanche)
 */
async function pollEvmChains() {
  const evmChains = ['eth', 'base', 'avax'];

  for (const chain of evmChains) {
    try {
      console.log(`[${new Date().toISOString()}] Polling ${chain.toUpperCase()}...`);
      await pollEvmChain(chain);
    } catch (error) {
      console.error(`Error polling ${chain}:`, error);
    }
  }
}

/**
 * Poll a single EVM chain
 */
async function pollEvmChain(chain: string) {
  // Get or create chain cursor
  let chainCursor = await prisma.chainCursor.findUnique({
    where: { chain },
  });

  if (!chainCursor) {
    // Initialize cursor at current block
    const latestBlock = await evmService.getLatestBlockNumber(chain);
    chainCursor = await prisma.chainCursor.create({
      data: {
        chain,
        lastBlockNumber: latestBlock.toString(),
      },
    });
    console.log(`  Initialized ${chain} cursor at block ${latestBlock}`);
    return;
  }

  // Get tracked addresses for this chain
  const trackedAddresses = await prisma.trackedAddress.findMany({
    where: {
      chain,
      isActive: true,
    },
    include: {
      user: true,
    },
  });

  if (trackedAddresses.length === 0) {
    console.log(`  No tracked addresses for ${chain}`);
    return;
  }

  console.log(`  Scanning ${trackedAddresses.length} tracked addresses`);

  // Scan new blocks
  const addresses = trackedAddresses.map(t => t.address);
  const { transactions, newCursor } = await evmService.scanNewBlocks(
    chain,
    chainCursor.lastBlockNumber,
    addresses
  );

  console.log(`  Found ${transactions.length} transactions`);

  // Process transactions
  for (const tx of transactions) {
    for (const tracked of trackedAddresses) {
      const normalizedTracked = evmService.normalizeAddress(tracked.address);
      const fromAddr = tx.from ? evmService.normalizeAddress(tx.from) : '';
      const toAddr = tx.to ? evmService.normalizeAddress(tx.to) : '';

      if (fromAddr !== normalizedTracked && toAddr !== normalizedTracked) {
        continue;
      }

      // Determine direction
      const direction = fromAddr === normalizedTracked ? 'out' : 'in';

      // Parse amount
      const amount = evmService.weiToEth(tx.value);
      const asset = evmService.getNativeAsset(chain as any);

      // Check threshold
      if (amount < tracked.minAmount) {
        continue;
      }

      // Check for duplicate
      const existing = await prisma.alertEvent.findUnique({
        where: {
          chain_txHashOrSig_trackedAddressId: {
            chain,
            txHashOrSig: tx.hash,
            trackedAddressId: tracked.id,
          },
        },
      });

      if (existing) {
        continue; // Already alerted
      }

      // Create alert event
      const timestamp = tx.timestamp ? new Date(parseInt(tx.timestamp, 16) * 1000) : new Date();
      await prisma.alertEvent.create({
        data: {
          trackedAddressId: tracked.id,
          chain,
          txHashOrSig: tx.hash,
          timestamp,
          direction,
          amount,
          asset,
          sentToTelegram: false,
        },
      });

      // Send Telegram alert
      try {
        const explorerLink = evmService.getTxLink(chain as any, tx.hash);
        const message = telegramService.formatAlert(
          chain,
          tracked.address,
          tracked.label,
          tx.hash,
          direction,
          amount,
          asset,
          explorerLink
        );

        await telegramService.sendMessage({
          chatId: parseInt(tracked.user.telegramUserId),
          text: message,
          parseMode: 'Markdown',
        });

        // Mark as sent
        await prisma.alertEvent.updateMany({
          where: {
            chain,
            txHashOrSig: tx.hash,
            trackedAddressId: tracked.id,
          },
          data: {
            sentToTelegram: true,
          },
        });

        console.log(`  ✅ Sent alert for ${tracked.label} (${tx.hash.slice(0, 10)}...)`);
      } catch (error) {
        console.error(`  ❌ Failed to send alert:`, error);
      }
    }
  }

  // Update chain cursor
  if (newCursor !== chainCursor.lastBlockNumber) {
    await prisma.chainCursor.update({
      where: { chain },
      data: { lastBlockNumber: newCursor },
    });
    console.log(`  Updated ${chain} cursor to block ${newCursor}`);
  }
}

/**
 * Poll Solana chain
 */
async function pollSolana() {
  try {
    console.log(`[${new Date().toISOString()}] Polling SOLANA...`);

    // Get tracked Solana addresses
    const trackedAddresses = await prisma.trackedAddress.findMany({
      where: {
        chain: 'sol',
        isActive: true,
      },
      include: {
        user: true,
      },
    });

    if (trackedAddresses.length === 0) {
      console.log('  No tracked Solana addresses');
      return;
    }

    console.log(`  Scanning ${trackedAddresses.length} tracked addresses`);

    // Poll each address individually (Solana is address-specific)
    for (const tracked of trackedAddresses) {
      try {
        const lastCursor = tracked.lastSeenCursor || undefined;
        const { signatures, newCursor } = await solanaService.getNewSignatures(
          tracked.address,
          lastCursor
        );

        if (signatures.length === 0) {
          continue;
        }

        console.log(`  Found ${signatures.length} new transactions for ${tracked.label}`);

        // Process each signature
        for (const sig of signatures) {
          if (sig.err) continue; // Skip failed transactions

          // Parse transaction
          const parsed = await solanaService.parseTransactionAmount(tracked.address, sig.signature);
          if (!parsed) continue;

          const { amount, direction } = parsed;

          // Check threshold
          if (amount < tracked.minAmount) {
            continue;
          }

          // Check for duplicate
          const existing = await prisma.alertEvent.findUnique({
            where: {
              chain_txHashOrSig_trackedAddressId: {
                chain: 'sol',
                txHashOrSig: sig.signature,
                trackedAddressId: tracked.id,
              },
            },
          });

          if (existing) {
            continue;
          }

          // Create alert event
          const timestamp = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date();
          await prisma.alertEvent.create({
            data: {
              trackedAddressId: tracked.id,
              chain: 'sol',
              txHashOrSig: sig.signature,
              timestamp,
              direction,
              amount,
              asset: 'SOL',
              sentToTelegram: false,
            },
          });

          // Send Telegram alert
          try {
            const explorerLink = solanaService.getTxLink(sig.signature);
            const message = telegramService.formatAlert(
              'sol',
              tracked.address,
              tracked.label,
              sig.signature,
              direction,
              amount,
              'SOL',
              explorerLink
            );

            await telegramService.sendMessage({
              chatId: parseInt(tracked.user.telegramUserId),
              text: message,
              parseMode: 'Markdown',
            });

            // Mark as sent
            await prisma.alertEvent.updateMany({
              where: {
                chain: 'sol',
                txHashOrSig: sig.signature,
                trackedAddressId: tracked.id,
              },
              data: {
                sentToTelegram: true,
              },
            });

            console.log(`  ✅ Sent alert for ${tracked.label} (${sig.signature.slice(0, 10)}...)`);
          } catch (error) {
            console.error(`  ❌ Failed to send alert:`, error);
          }
        }

        // Update cursor
        if (newCursor && newCursor !== tracked.lastSeenCursor) {
          await prisma.trackedAddress.update({
            where: { id: tracked.id },
            data: { lastSeenCursor: newCursor },
          });
          console.log(`  Updated cursor for ${tracked.label}`);
        }
      } catch (error) {
        console.error(`  Error polling ${tracked.label}:`, error);
      }
    }
  } catch (error) {
    console.error('Error polling Solana:', error);
  }
}

/**
 * Handle shutdown
 */
process.on('SIGTERM', async () => {
  console.log('\n⏸️  SIGTERM received, shutting down worker...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⏸️  SIGINT received, shutting down worker...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start worker
console.log(`⚙️  Configuration:`);
console.log(`   EVM poll interval: ${config.worker.evmPollInterval}ms`);
console.log(`   Solana poll interval: ${config.worker.solanaPollInterval}ms`);
console.log(`   Max tracked per user: ${config.limits.maxTrackedPerUser}`);
console.log(`   Max tracked total: ${config.limits.maxTrackedTotal}\n`);

runWorker().catch(error => {
  console.error('Fatal error in worker:', error);
  process.exit(1);
});
