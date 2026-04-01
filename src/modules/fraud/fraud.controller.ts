import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class FraudController {
  public async syncHeartbeat(req: Request, res: Response) {
    const { userId, status } = req.body; // status: 'VERIFIED' or 'FRAUD_FLAG'

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isDeviceSecure: status === 'VERIFIED' }
      });

      res.status(200).json({ status: 'Physical integrity synced' });
    } catch (error) {
      res.status(500).json({ error: 'Security sync failed' });
    }
  }
}