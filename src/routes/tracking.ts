import { Router, Request, Response } from 'express';
import prisma from '../db';
import { config } from '../config';
import { evmService } from '../services/evm';
import { solanaService } from '../services/solana';
import { Chain } from '../types';

const router = Router();

/**
 * GET /tracking/view-tracked
 * Get all tracked addresses for a user
 */
router.get('/view-tracked', async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.query;

    if (!telegramUserId) {
      return res.status(400).json({
        error: 'Missing required parameter: telegramUserId',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { telegramUserId: String(telegramUserId) },
      include: {
        trackedAddresses: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.json({
        tracked: [],
        count: 0,
      });
    }

    return res.json({
      tracked: user.trackedAddresses.map(addr => ({
        id: addr.id,
        chain: addr.chain,
        address: addr.address,
        label: addr.label,
        minAmount: addr.minAmount,
        createdAt: addr.createdAt,
      })),
      count: user.trackedAddresses.length,
    });
  } catch (error) {
    console.error('Error in /tracking/view-tracked:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /tracking/add-new
 * Add a new address to track
 */
router.post('/add-new', async (req: Request, res: Response) => {
  try {
    const { telegramUserId, chain, address, label, minAmount } = req.body;

    // Validate input
    if (!telegramUserId || !chain || !address || !label) {
      return res.status(400).json({
        error: 'Missing required fields: telegramUserId, chain, address, label',
      });
    }

    // Validate chain
    const validChains: Chain[] = ['eth', 'base', 'avax', 'sol'];
    if (!validChains.includes(chain)) {
      return res.status(400).json({
        error: `Invalid chain. Supported: ${validChains.join(', ')}`,
      });
    }

    // Validate address format
    let isValid = false;
    if (chain === 'sol') {
      isValid = solanaService.isValidAddress(address);
    } else {
      isValid = evmService.isValidAddress(address);
    }

    if (!isValid) {
      return res.status(400).json({
        error: `Invalid ${chain.toUpperCase()} address format`,
      });
    }

    // Parse minAmount
    const minAmountValue = parseFloat(minAmount) || 0;
    if (minAmountValue < 0) {
      return res.status(400).json({
        error: 'minAmount must be >= 0',
      });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramUserId: String(telegramUserId) },
      include: { trackedAddresses: { where: { isActive: true } } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { telegramUserId: String(telegramUserId) },
        include: { trackedAddresses: { where: { isActive: true } } },
      });
    }

    // Check per-user limit
    if (user.trackedAddresses.length >= config.limits.maxTrackedPerUser) {
      return res.status(400).json({
        error: `Maximum tracked addresses per user (${config.limits.maxTrackedPerUser}) reached`,
      });
    }

    // Check total limit
    const totalTracked = await prisma.trackedAddress.count({
      where: { isActive: true },
    });

    if (totalTracked >= config.limits.maxTrackedTotal) {
      return res.status(400).json({
        error: `Maximum total tracked addresses (${config.limits.maxTrackedTotal}) reached`,
      });
    }

    // Check for duplicates
    const existing = await prisma.trackedAddress.findFirst({
      where: {
        userId: user.id,
        chain,
        address: chain === 'sol' ? address : evmService.normalizeAddress(address),
        isActive: true,
      },
    });

    if (existing) {
      return res.status(400).json({
        error: 'This address is already tracked',
      });
    }

    // Initialize cursor
    let initialCursor = '';
    if (chain === 'sol') {
      // For Solana, get the latest signature as cursor
      const signatures = await solanaService.getSignaturesForAddress(address, 1);
      initialCursor = signatures[0]?.signature || '';
    } else {
      // For EVM, get current block number
      const latestBlock = await evmService.getLatestBlockNumber(chain);
      initialCursor = latestBlock.toString();
    }

    // Create tracked address
    const tracked = await prisma.trackedAddress.create({
      data: {
        userId: user.id,
        chain,
        address: chain === 'sol' ? address : evmService.normalizeAddress(address),
        label,
        minAmount: minAmountValue,
        lastSeenCursor: initialCursor,
      },
    });

    return res.json({
      success: true,
      tracked: {
        id: tracked.id,
        chain: tracked.chain,
        address: tracked.address,
        label: tracked.label,
        minAmount: tracked.minAmount,
      },
      message: `Now tracking ${label} on ${chain.toUpperCase()}`,
    });
  } catch (error) {
    console.error('Error in /tracking/add-new:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /tracking/remove
 * Remove (deactivate) a tracked address
 */
router.post('/remove', async (req: Request, res: Response) => {
  try {
    const { telegramUserId, trackedId } = req.body;

    if (!telegramUserId || !trackedId) {
      return res.status(400).json({
        error: 'Missing required fields: telegramUserId, trackedId',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { telegramUserId: String(telegramUserId) },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    // Update tracked address
    const tracked = await prisma.trackedAddress.updateMany({
      where: {
        id: parseInt(trackedId),
        userId: user.id,
      },
      data: {
        isActive: false,
      },
    });

    if (tracked.count === 0) {
      return res.status(404).json({
        error: 'Tracked address not found',
      });
    }

    return res.json({
      success: true,
      message: 'Tracking removed',
    });
  } catch (error) {
    console.error('Error in /tracking/remove:', error);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
