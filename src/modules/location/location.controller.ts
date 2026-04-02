import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import axios from 'axios';

export class LocationController {
  public async syncLocation(req: Request, res: Response): Promise<void> {
    const { userId, lat, lng, city } = req.body;

    if (!userId || !lat || !lng) {
      res.status(400).json({ error: "Missing location parameters" });
      return;
    }

    try {
      // 1. Update user's live location in the database
      await prisma.user.update({
        where: { id: userId },
        data: { lat, lng, city }
      });

      // 2. Hit the specific external/3rd-party endpoint if required
      // Example: Forwarding telemetry to an external risk engine
      /*
      await axios.post('https://external-risk-api.com/telemetry', {
        userId, lat, lng, timestamp: new Date().toISOString()
      });
      */

      res.status(200).json({ status: "Location synced successfully" });
    } catch (error) {
      console.error('[LOCATION SYNC ERROR]', error);
      res.status(500).json({ error: "Failed to sync location" });
    }
  }
}