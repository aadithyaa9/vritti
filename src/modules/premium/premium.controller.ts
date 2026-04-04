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

      if (!userId) { res.status(400).json({ error: 'User ID is required' }); return; }

      const policies = await this.premiumService.getUserActivePolicies(userId);
      res.status(200).json({ userId, policies, count: policies.length });
    } catch (error) {
      console.error('[PREMIUM CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve policies' });
    }
  }

  /**
   * GET /api/v1/premium/estimate?city=Chennai&userId=<uuid>
   *
   * With userId  → ML-powered personalised quote from pricing engine
   * Without userId → static fallback estimate
   */
  public async getPremiumEstimate(req: Request, res: Response): Promise<void> {
    try {
      const city =
        typeof req.query['city'] === 'string' ? req.query['city'] : 'Chennai';
      const userId =
        typeof req.query['userId'] === 'string' ? req.query['userId'] : null;

      if (userId) {
        const estimate = await this.premiumService.calculatePremiumEstimateForUser(userId, city);
        res.status(200).json({
          ...estimate,
          description:
            estimate.source === 'engine'
              ? 'ML-powered personalised premium via dynamic pricing engine'
              : 'Fallback estimate — pricing engine unavailable',
        });
      } else {
        const staticEstimate = this.premiumService.calculatePremiumEstimate(city);
        res.status(200).json({
          basePremium: 150.0,
          estimatedFinalPremium: staticEstimate,
          wRiskScore: null,
          rAlertMultiplier: null,
          source: 'static',
          currency: 'INR',
          city,
          description: 'Static estimate — provide ?userId= for ML-powered personalised quote',
        });
      }
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