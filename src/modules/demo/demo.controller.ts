import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { NotificationService } from '../notification/notification.service.js';

export class DemoController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * POST /api/demo/simulate-week
   * Generates random earnings, updates wallet, and adds notification.
   */
  public async simulateWeek(req: Request, res: Response): Promise<void> {
    const { userId } = req.body as { userId: string };

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      // 1. Generate random number between 9000 and 12000
      const earningsAdded = Math.floor(Math.random() * (12000 - 9000 + 1)) + 9000;
      const sipCost = 200;

      // 2. Update wallet: + earnings - SIP cost
      const updatedWallet = await prisma.wallet.update({
        where: { userId },
        data: {
          balance: { increment: (earningsAdded - sipCost) },
          lastUpdatedAt: new Date()
        }
      });

      // 3. Log the "Shift Simulated" notification
      await this.notificationService.createNotification(
        userId,
        'Shift Simulated',
        `You earned ₹${earningsAdded.toLocaleString()} this week. ₹${sipCost} Safety SIP deducted.`,
        'INFO'
      );

      console.log(`[DEMO] Simulated week for ${userId}: +₹${earningsAdded} earnings, -₹${sipCost} SIP.`);

      res.status(200).json({
        success: true,
        earningsAdded,
        sipCost,
        newBalance: Number(updatedWallet.balance),
        message: `Week simulated successfully. ₹${earningsAdded} added to your account.`
      });
    } catch (error) {
      console.error('[DEMO ERROR]', error);
      res.status(500).json({ error: 'Simulation failed' });
    }
  }

  /**
   * POST /api/demo/force-trigger
   * Force disruption evaluation for a city.
   */
  public async forceTrigger(req: Request, res: Response): Promise<void> {
    const { city } = req.body as { city?: string };
    if (!city) { res.status(400).json({ error: 'city is required' }); return; }
    try {
      const { DisruptionService } = await import('../intelligence/disruption.service.js');
      const svc = new DisruptionService();
      await svc.evaluateCity(city);
      res.status(200).json({ message: `Forced disruption evaluation for ${city} completed. Check server logs.` });
    } catch (err) { 
      console.error('[FORCE TRIGGER ERROR]', err);
      res.status(500).json({ error: 'Evaluation failed' }); 
    }
  }
}
