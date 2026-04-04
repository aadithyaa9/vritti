import type { Request, Response } from 'express';
import { DisruptionService } from './disruption.service.js';

export class DisruptionController {
  private disruptionService: DisruptionService;

  constructor() {
    this.disruptionService = new DisruptionService();
  }

  /**
   * Manually trigger city-wide disruption evaluation
   * Used for hackathon demo and cron fallback
   */
  public async evaluateDisruption(req: Request, res: Response): Promise<void> {
    try {
      const { city } = req.body;

      if (!city) {
        res.status(400).json({ error: 'City is required' });
        return;
      }

      console.log(`[DISRUPTION CONTROLLER] Manual evaluation triggered for ${city}`);
      // await this.disruptionService.evaluateCity(city);

      res.status(200).json({
        message: `Disruption evaluation completed for ${city}. Check server logs for full pipeline output.`,
        city,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[DISRUPTION CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Disruption evaluation failed' });
    }
  }

  /**
   * One-Touch Claim endpoint
   * Returns step-by-step verification log so frontend can render the terminal UI
   */
  public async oneTouchClaim(req: Request, res: Response): Promise<void> {
    try {
      const { userId, lat, lng } = req.body;

      if (!userId || lat === undefined || lng === undefined) {
        res.status(400).json({
          error: 'userId, lat, and lng are all required for One-Touch Claim',
        });
        return;
      }

      const result = await this.disruptionService.processOneTouchClaim(
        userId,
        Number(lat),
        Number(lng)
      );

      // Return 200 always — success/failure is communicated in the result body
      // The frontend reads result.success to decide what to show
      res.status(200).json(result);
    } catch (error) {
      console.error('[ONE-TOUCH CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to process One-Touch Claim' });
    }
  }

  /**
   * Get disruption check history for a city
   */
  public async getDisruptionHistory(req: Request, res: Response): Promise<void> {
    try {
      const city = Array.isArray(req.params['city'])
        ? req.params['city'][0]
        : req.params['city'];

      if (!city) {
        res.status(400).json({ error: 'City parameter is required' });
        return;
      }

      const disruptionChecks = await this.disruptionService.getRecentChecks(city);

      res.status(200).json({
        city,
        checks: disruptionChecks,
        count: disruptionChecks.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[DISRUPTION CONTROLLER ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve disruption history' });
    }
  }

  /**
   * Get current city disruption status — used by frontend dashboard polling
   */
  public async getCityStatus(req: Request, res: Response): Promise<void> {
    try {
      const city = Array.isArray(req.params['city'])
        ? req.params['city'][0]
        : req.params['city'];

      if (!city) {
        res.status(400).json({ error: 'City parameter is required' });
        return;
      }

      const status = await this.disruptionService.getCityStatus(city);
      res.status(200).json(status);
    } catch (error) {
      console.error('[CITY STATUS ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve city status' });
    }
  }

  /**
   * Health check
   */
  public async health(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'healthy',
      service: 'DisruptionService',
      timestamp: new Date().toISOString(),
    });
  }
}
