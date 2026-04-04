import { prisma } from '../../config/prisma.js';

export class NotificationService {
  /**
   * Create a notification for a user.
   */
  public async createNotification(userId: string, title: string, message: string, type: 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR') {
    try {
      return await prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type,
        },
      });
    } catch (error) {
      console.error('[NOTIFICATION SERVICE ERROR]', error);
      // Don't throw, just log. Notifications are non-critical.
    }
  }

  /**
   * Get latest notifications for a user.
   */
  public async getLatestNotifications(userId: string, limit: number = 5) {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}
