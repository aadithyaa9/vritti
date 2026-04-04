import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class FraudController {

  /**
   * Receive heartbeat from Edge Engine (mobile app sensors).
   * The mobile app calls this every 30-60 seconds with real sensor data.
   * 
   * Body:
   *   userId   - user UUID
   *   lat      - current GPS latitude
   *   lng      - current GPS longitude
   *   status   - 'NORMAL' | 'FLAGGED'
   *   accelX   - accelerometer X axis (raw sensor value)
   *   accelY   - accelerometer Y axis
   *   accelZ   - accelerometer Z axis
   *   gyroX    - gyroscope X (raw)
   *   gyroY    - gyroscope Y
   *   gyroZ    - gyroscope Z
   *   speed    - GPS-derived speed in km/h
   *   maeScore - Motion Anomaly Engine score (0-100, >70 = anomaly)
   */
  public async syncHeartbeat(req: Request, res: Response): Promise<void> {
    const {
      userId,
      lat,
      lng,
      status,
      speed,
      maeScore,
      sensors,
    } = req.body;

    if (!userId || !status) {
      res.status(400).json({ error: 'Missing required fields: userId and status' });
      return;
    }

    try {
      // Map contract status to internal status if necessary
      // Contract: VERIFIED -> NORMAL, FRAUD_FLAG -> FLAGGED (or just keep them)
      // Let's keep them as passed from contract for maximum flexibility.
      
      // Save heartbeat with all available sensor data
      const heartbeat = await prisma.heartbeat.create({
        data: {
          userId,
          lat: lat ?? null,
          lng: lng ?? null,
          status,
          speed: speed !== undefined ? Number(speed) : null,
          maeScore: maeScore !== undefined ? Number(maeScore) : null,
          sensors: sensors || null,
        },
      });

      // Also update the user's live location
      if (lat && lng) {
        await prisma.user.update({
          where: { id: userId },
          data: { lat, lng },
        });
      }

      console.log(
        `[TELEMETRY] Heartbeat #${heartbeat.id.slice(0, 8)} | User: ${userId.slice(0, 8)}... | Status: ${status} | MAE: ${maeScore ?? 'N/A'} | Speed: ${speed ?? 'N/A'} km/h`
      );

      res.status(200).json({
        message: 'Telemetry synced successfully',
        heartbeatId: heartbeat.id,
        status,
        timestamp: heartbeat.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('[HEARTBEAT ERROR]', error);
      res.status(500).json({ error: 'Failed to sync heartbeat' });
    }
  }

  /**
   * Get the latest heartbeat status for a user.
   * Frontend polls this to update the fraud status indicator (red/green dot).
   * Also returns the most recent sensor values for display.
   */
  public async getHeartbeatStatus(req: Request, res: Response): Promise<void> {
    const userId = Array.isArray(req.params['userId'])
      ? req.params['userId'][0]
      : req.params['userId'];

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      // Most recent heartbeat regardless of status
      const latest = await prisma.heartbeat.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      // Most recent FLAGGED heartbeat in last 15 minutes
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentFlag = await prisma.heartbeat.findFirst({
        where: {
          userId,
          status: 'FLAGGED',
          createdAt: { gte: fifteenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Count of FLAGGED events in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const flaggedCount = await prisma.heartbeat.count({
        where: {
          userId,
          status: 'FLAGGED',
          createdAt: { gte: oneHourAgo },
        },
      });

      // Recent heartbeat stream for frontend graph (last 20)
      const recentStream = await prisma.heartbeat.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          lat: true,
          lng: true,
          createdAt: true,
        },
      });

      const isActivelyFlagged = !!recentFlag;
      const minutesSinceLastBeat = latest
        ? Math.floor((Date.now() - latest.createdAt.getTime()) / 60000)
        : null;

      res.status(200).json({
        userId,
        currentStatus: latest?.status ?? 'NO_DATA',
        isActivelyFlagged,
        recentFlagMinutesAgo: recentFlag
          ? Math.floor((Date.now() - recentFlag.createdAt.getTime()) / 60000)
          : null,
        flaggedCountLastHour: flaggedCount,
        minutesSinceLastBeat,
        lastHeartbeat: latest,
        recentStream: recentStream.reverse(), // chronological order
        eligibleForClaim: isActivelyFlagged, // convenience field for frontend
      });
    } catch (error) {
      console.error('[HEARTBEAT STATUS ERROR]', error);
      res.status(500).json({ error: 'Failed to retrieve heartbeat status' });
    }
  }
}
