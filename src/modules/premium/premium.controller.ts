import type { Request, Response } from 'express';
import { PremiumService } from './premium.service.js';

export class PremiumController {
  private premiumService: PremiumService;

  constructor() {
    this.premiumService = new PremiumService();
  }

  public async triggerWeeklyRenewals(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PREMIUM CONTROLLER] Manual weekly renewal triggered');
      const result = await this.premiumService.processWeeklyRenewals();

      res.status(200).json({
        message: 'Weekly policy renewals completed.',
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Weekly renewal process failed' });
    }
  }

  public async getUserPolicies(req: Request, res: Response): Promise<void> {
    try {
      const userId = Array.isArray(req.params['userId'])
        ? req.params['userId'][0]
        : req.params['userId'];

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

  public async getPremiumEstimate(req: Request, res: Response): Promise<void> {
    try {
      const city =
        typeof req.query['city'] === 'string' ? req.query['city'] : 'Chennai';
      const estimate = this.premiumService.calculatePremiumEstimate(city);

      res.status(200).json({
        basePremium: 150.0,
        estimatedFinalPremium: estimate,
        currency: 'INR',
        city,
        description:
          'Weekly Safety SIP premium after city risk multiplier and 10% loyalty discount',
      });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to calculate premium estimate' });
    }
  }

  public async health(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'PremiumService',
      timestamp: new Date().toISOString(),
    });
  }
}
