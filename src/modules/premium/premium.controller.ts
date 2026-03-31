import type { Request, Response } from 'express';
import { PremiumService } from './premium.service.js';

export class PremiumController {
  private premiumService: PremiumService;

  constructor() {
    this.premiumService = new PremiumService();
  }

  /**
   * Manually trigger weekly premium renewals
   * Used for hackathon demo and testing
   */
  public async triggerWeeklyRenewals(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PREMIUM CONTROLLER] Manual weekly renewal triggered');
      await this.premiumService.processWeeklyRenewals();

      res.status(200).json({
        message: 'Weekly policy renewals completed successfully.',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Weekly renewal process failed' });
    }
  }

  /**
   * Get active policies for a user
   */
  public async getUserPolicies(req: Request, res: Response): Promise<void> {
    try {
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const policies = await this.premiumService.getUserActivePolicies(userId);

      res.status(200).json({
        userId,
        policies,
        count: policies.length,
      });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve policies' });
    }
  }

  /**
   * Get premium estimate
   */
  public async getPremiumEstimate(req: Request, res: Response): Promise<void> {
    try {
      const estimate = this.premiumService.calculatePremiumEstimate();

      res.status(200).json({
        basePremium: 150.0,
        estimatedFinalPremium: estimate,
        currency: 'INR',
        description: 'Average premium after risk multiplier and loyalty discount',
      });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to calculate premium estimate' });
    }
  }

  /**
   * Health check for premium service
   */
  public async health(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'PremiumService',
      timestamp: new Date().toISOString(),
    });
  }
}
