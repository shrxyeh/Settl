import { TransactionActivity, RiskLevel } from '../types';

interface RiskAnalysis {
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
}

export class RiskService {
  /**
   * Calculate heuristic risk score based on recent activity
   * Score range: 0-100
   */
  calculateRiskScore(recentActivity: TransactionActivity[]): RiskAnalysis {
    let score = 0;
    const reasons: string[] = [];

    // No activity - neutral
    if (recentActivity.length === 0) {
      return {
        riskScore: 0,
        riskLevel: 'low',
        reasons: ['No recent activity detected'],
      };
    }

    // 1. Check transaction velocity (high frequency = higher risk)
    const velocityScore = this.analyzeVelocity(recentActivity);
    score += velocityScore.score;
    if (velocityScore.reason) reasons.push(velocityScore.reason);

    // 2. Check for large transaction spikes
    const spikeScore = this.analyzeSpikes(recentActivity);
    score += spikeScore.score;
    if (spikeScore.reason) reasons.push(spikeScore.reason);

    // 3. Check wallet age (very new + active = higher risk)
    const ageScore = this.analyzeWalletAge(recentActivity);
    score += ageScore.score;
    if (ageScore.reason) reasons.push(ageScore.reason);

    // 4. Check for round number amounts (possible automation/bot)
    const patternScore = this.analyzePatterns(recentActivity);
    score += patternScore.score;
    if (patternScore.reason) reasons.push(patternScore.reason);

    // 5. Check inflow/outflow balance
    const flowScore = this.analyzeFlows(recentActivity);
    score += flowScore.score;
    if (flowScore.reason) reasons.push(flowScore.reason);

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    // Determine risk level
    const riskLevel = this.getRiskLevel(score);

    // Add general activity info
    reasons.unshift(`${recentActivity.length} transactions analyzed`);

    return {
      riskScore: Math.round(score),
      riskLevel,
      reasons,
    };
  }

  /**
   * Analyze transaction velocity
   */
  private analyzeVelocity(activity: TransactionActivity[]): { score: number; reason?: string } {
    if (activity.length < 2) return { score: 0 };

    // Calculate average time between transactions
    const timestamps = activity.map(a => a.timestamp).sort((a, b) => a - b);
    let totalGap = 0;
    for (let i = 1; i < timestamps.length; i++) {
      totalGap += timestamps[i] - timestamps[i - 1];
    }
    const avgGapSeconds = totalGap / (timestamps.length - 1);
    const avgGapMinutes = avgGapSeconds / 60;

    // High velocity (< 5 min avg) = higher risk
    if (avgGapMinutes < 5 && activity.length >= 10) {
      return {
        score: 25,
        reason: 'Very high transaction velocity (potential bot activity)',
      };
    } else if (avgGapMinutes < 30 && activity.length >= 5) {
      return {
        score: 15,
        reason: 'High transaction frequency detected',
      };
    }

    return { score: 0 };
  }

  /**
   * Analyze for large transaction spikes
   */
  private analyzeSpikes(activity: TransactionActivity[]): { score: number; reason?: string } {
    if (activity.length < 3) return { score: 0 };

    const amounts = activity.map(a => a.amount);
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const maxAmount = Math.max(...amounts);

    // Large spike detection
    if (maxAmount > avgAmount * 10 && maxAmount > 1) {
      return {
        score: 20,
        reason: `Large transaction spike detected (${maxAmount.toFixed(4)} vs avg ${avgAmount.toFixed(4)})`,
      };
    } else if (maxAmount > avgAmount * 5 && maxAmount > 0.5) {
      return {
        score: 10,
        reason: 'Unusual transaction size variation',
      };
    }

    return { score: 0 };
  }

  /**
   * Analyze wallet age based on activity
   */
  private analyzeWalletAge(activity: TransactionActivity[]): { score: number; reason?: string } {
    if (activity.length === 0) return { score: 0 };

    const timestamps = activity.map(a => a.timestamp).sort((a, b) => a - b);
    const firstTx = timestamps[0];
    const now = Date.now() / 1000;
    const ageSeconds = now - firstTx;
    const ageDays = ageSeconds / 86400;

    // Very new wallet (< 7 days) with high activity
    if (ageDays < 7 && activity.length >= 10) {
      return {
        score: 20,
        reason: 'New wallet with high activity (potential throwaway)',
      };
    } else if (ageDays < 30 && activity.length >= 15) {
      return {
        score: 10,
        reason: 'Recently created wallet with significant activity',
      };
    }

    return { score: 0 };
  }

  /**
   * Analyze transaction patterns
   */
  private analyzePatterns(activity: TransactionActivity[]): { score: number; reason?: string } {
    if (activity.length < 5) return { score: 0 };

    // Check for round numbers (potential automation)
    let roundCount = 0;
    for (const tx of activity) {
      const amt = tx.amount;
      // Consider round if it's a whole number or has max 2 decimal places
      if (amt === Math.floor(amt) || amt === parseFloat(amt.toFixed(2))) {
        roundCount++;
      }
    }

    const roundRatio = roundCount / activity.length;
    if (roundRatio > 0.7) {
      return {
        score: 15,
        reason: 'Many round-number transactions (possible automation)',
      };
    }

    return { score: 0 };
  }

  /**
   * Analyze inflow vs outflow patterns
   */
  private analyzeFlows(activity: TransactionActivity[]): { score: number; reason?: string } {
    if (activity.length < 3) return { score: 0 };

    let totalIn = 0;
    let totalOut = 0;
    let inCount = 0;
    let outCount = 0;

    for (const tx of activity) {
      if (tx.direction === 'in') {
        totalIn += tx.amount;
        inCount++;
      } else {
        totalOut += tx.amount;
        outCount++;
      }
    }

    // Rapid outflows after inflows (layering behavior)
    if (totalIn > 0 && totalOut > totalIn * 0.8 && outCount >= 3) {
      return {
        score: 20,
        reason: 'Rapid outflow pattern detected (possible layering)',
      };
    }

    // Only outflows with no inflows (possible mixer/tumbler)
    if (outCount > 5 && inCount === 0) {
      return {
        score: 15,
        reason: 'Only outflows detected (possible funds distribution)',
      };
    }

    return { score: 0 };
  }

  /**
   * Map score to risk level
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }
}

export const riskService = new RiskService();
