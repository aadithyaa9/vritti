import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class FraudController {
  
  /**
   * Receives telemetry/heartbeat from the user's Edge Engine (mobile app).
   * Saves the physical integrity status (NORMAL or FLAGGED) to the database
   * so it can be cross-referenced during a One-Touch claim.
   */
  public async syncHeartbeat(req: Request, res: Response): Promise<void> {
    const { userId, lat, lng, status } = req.body;

    try {
      if (!userId || !status) {
        res.status(400).json({ error: "Missing required fields (userId, status)" });
        return;
      }

      // 1. Save the actual heartbeat to our new database table
      await prisma.heartbeat.create({
        data: {
          userId,
          lat,
          lng,
          status // 'NORMAL' or 'FLAGGED'
        }
      });

      console.log(`[EDGE ENGINE] Heartbeat saved for ${userId} | Status: ${status}`);
      
      // 2. Return success to the edge client
      res.status(200).json({ status: "Physical integrity synced" });
      
    } catch (error) {
      console.error('[HEARTBEAT ERROR]', error);
      res.status(500).json({ error: "Failed to sync heartbeat" });
    }
  }
}