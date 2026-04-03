import type { Request, Response } from 'express';
import { DisruptionService } from './disruption.service.js';

export class DisruptionController {
  private disruptionService: DisruptionService;

  constructor() {
    this.disruptionService = new DisruptionService();
  }

  /**
   * Manually trigger disruption evaluation for a city
   * Used for hackathon demo and testing
   */
  public async evaluateDisruption(req: Request, res: Response): Promise<void> {
    try {
      const { city } = req.body;

      if (!city) {
        res.status(400).json({ error: 'City is required' });
        return;
      }

      console.log(`[DISRUPTION CONTROLLER] Evaluating disruption for ${city}`);
      await this.disruptionService.evaluateCity(city);

      res.status(200).json({
        message: `Disruption evaluation completed for ${city}. Check logs for payout execution.`,
        city,
      });
    } catch (error) {
      console.error('[DISRUPTION CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Disruption evaluation failed' });
    }
  }

  public async oneTouchClaim(req: Request, res: Response): Promise<void> {
    try {
      const { userId, lat, lng } = req.body;

      if (!userId || !lat || !lng) {
        res.status(400).json({ error: 'userId, lat, and lng are required for One-Touch Claim' });
        return;
      }

      const result = await this.disruptionService.processOneTouchClaim(userId, lat, lng);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result); // Return 400 if denied, so frontend can show rejection UI
      }
    } catch (error) {
      console.error('[ONE-TOUCH CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to process One-Touch Claim' });
    }
  }
  /**
   * Get recent disruption checks for a city
   */
  public async getDisruptionHistory(req: Request, res: Response): Promise<void> {
    try {
      const city = Array.isArray(req.params.city) ? req.params.city[0] : req.params.city;

      if (!city) {
        res.status(400).json({ error: 'City parameter is required' });
        return;
      }

      const disruptionChecks = await this.disruptionService.getRecentChecks(city);

      res.status(200).json({
        city,
        checks: disruptionChecks,
        count: disruptionChecks.length,
      });
    } catch (error) {
      console.error('[DISRUPTION CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve disruption history' });
    }
  }

  /**
   * Health check for disruption service
   */
  public async health(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'DisruptionService',
      timestamp: new Date().toISOString(),
    });
  }
}
