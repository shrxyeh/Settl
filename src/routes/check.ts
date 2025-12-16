import { Router, Request, Response } from 'express';
import { evmService } from '../services/evm';
import { solanaService } from '../services/solana';
import { riskService } from '../services/risk';
import { Chain, CheckResult } from '../types';

const router = Router();

interface CheckRequest {
  chain: Chain;
  targetAddress: string;
}

/**
 * POST /check
 * Check a wallet address on a supported chain and return risk + activity summary
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { chain, targetAddress } = req.body as CheckRequest;

    // Validate input
    if (!chain || !targetAddress) {
      return res.status(400).json({
        error: 'Missing required fields: chain, targetAddress',
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
    let explorerLink = '';

    if (chain === 'sol') {
      isValid = solanaService.isValidAddress(targetAddress);
      explorerLink = solanaService.getAddressLink(targetAddress);
    } else {
      isValid = evmService.isValidAddress(targetAddress);
      explorerLink = evmService.getAddressLink(chain, targetAddress);
    }

    if (!isValid) {
      return res.status(400).json({
        error: `Invalid ${chain.toUpperCase()} address format`,
      });
    }

    // Fetch recent activity
    let recentActivity;
    if (chain === 'sol') {
      recentActivity = await solanaService.getRecentTransactions(targetAddress);
    } else {
      recentActivity = await evmService.getRecentTransactions(chain, targetAddress);
    }

    // Calculate risk score
    const riskAnalysis = riskService.calculateRiskScore(recentActivity);

    // Build result
    const result: CheckResult = {
      riskScore: riskAnalysis.riskScore,
      riskLevel: riskAnalysis.riskLevel,
      reasons: riskAnalysis.reasons,
      recentActivity: recentActivity.slice(0, 20), // Limit to 20
      explorerLink,
    };

    return res.json(result);
  } catch (error) {
    console.error('Error in /check:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
