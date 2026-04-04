import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { PremiumService } from '../premium/premium.service.js';
import { PayoutService } from '../payout/payout.service.js';
import { NotificationService } from '../notification/notification.service.js';

export class DashboardController {
  private premiumService: PremiumService;
  private payoutService: PayoutService;
  private notificationService: NotificationService;

  constructor() {
    this.premiumService = new PremiumService();
    this.payoutService = new PayoutService();
    this.notificationService = new NotificationService();
  }

  public async getDashboardData(req: Request, res: Response): Promise<void> {
    const { userId } = req.params as { userId: string };

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      const [invested, credited, user, notifications] = await Promise.all([
        this.premiumService.getTotalInvested(userId),
        this.payoutService.getTotalCredited(userId),
        prisma.user.findUnique({
          where: { id: userId },
          include: { wallet: true },
        }),
        this.notificationService.getLatestNotifications(userId, 10),
      ]);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Format response as per API Contract
      res.status(200).json({
        premiumInvested: invested,
        weeklyEarnings: 10450, // Mock for now as per friend's suggestion, or calculate from ActivityLog
        walletBalance: user.wallet ? Number(user.wallet.balance) : 0,
        moneyCredited: credited,
        notifications: notifications.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          timestamp: n.timestamp,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[DASHBOARD ERROR]', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }
}
