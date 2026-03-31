import { prisma } from '../../config/prisma.js';
import { PayoutService } from '../payout/payout.service.js';

export class DisruptionService {
  private payoutService: PayoutService;

  constructor() {
    this.payoutService = new PayoutService();
  }

  /**
   * Core evaluation logic: Query news signals, weather metrics, and platform activity.
   * If both signals are high AND activity dropped 70%, declare disruption and trigger payouts.
   */
  public async evaluateCity(city: string): Promise<void> {
    try {
      console.log(`[DISRUPTION SERVICE] Starting evaluation for ${city}...`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Evaluate News & Weather Hazards
      const newsSignalsCount = await prisma.newsSignal.count({
        where: {
          city,
          isStrongMatch: true,
          createdAt: { gte: today },
        },
      });

      const extremeWeather = await prisma.weatherMetric.findFirst({
        where: {
          city,
          isExtremeThreshold: true,
          recordedAt: { gte: today },
        },
      });

      console.log(`[DISRUPTION] News Signals: ${newsSignalsCount}, Extreme Weather: ${!!extremeWeather}`);

      // 2. Evaluate Ground Truth (Platform Activity)
      const todayActivity = await prisma.activityLog.aggregate({
        where: {
          city,
          date: today,
        },
        _sum: { ordersCompleted: true },
      });

      const todayOrders = todayActivity._sum.ordersCompleted || 0;
      const HISTORICAL_AVG_ORDERS = 1000; // Mock baseline for the hackathon
      const activityScore = todayOrders / HISTORICAL_AVG_ORDERS;
      const activityDropRatio = 1 - activityScore;

      console.log(
        `[DISRUPTION] Today's Orders: ${todayOrders}, Historical Avg: ${HISTORICAL_AVG_ORDERS}, Drop: ${(activityDropRatio * 100).toFixed(2)}%`
      );

      // 3. Decision Matrix
      // Crisis declared if: News signals > 2 AND Weather Alert OR Activity dropped 70%+
      const newsThreshold = newsSignalsCount > 2;
      const weatherThreshold = extremeWeather !== null;
      const activityThreshold = activityDropRatio >= 0.7;

      const isCrisis = (newsThreshold || weatherThreshold) && activityThreshold;

      const reason = isCrisis
        ? `🚨 CRISIS DECLARED: News(${newsSignalsCount}), Weather(${!!extremeWeather}), Activity Drop(${(activityDropRatio * 100).toFixed(2)}%)`
        : `✓ Normal Operations: Activity at ${(activityScore * 100).toFixed(2)}% of baseline`;

      // 4. Log the Check (Immutable Record)
      const check = await prisma.disruptionCheck.create({
        data: {
          city,
          validNewsCount: newsSignalsCount,
          newsStatus: newsThreshold,
          avgOrders: HISTORICAL_AVG_ORDERS,
          todayOrders,
          activityScore: activityScore as any,
          disruption: isCrisis,
          reason,
        },
      });

      console.log(`[DISRUPTION] Check recorded: ${check.id}`);

      // 5. Trigger Event & Payouts if Crisis
      if (isCrisis) {
        const event = await prisma.event.create({
          data: {
            city,
            type: extremeWeather ? 'weather' : 'civic_strike',
            status: 'active',
            triggeredBy: 'Automated Intelligence Pipeline',
            disruptionCheckId: check.id,
            startTime: new Date(),
          },
        });

        console.log(
          `🚨 [CRISIS EVENT] Type: ${event.type} | City: ${city} | Event ID: ${event.id} | Triggering Payouts...`
        );

        await this.payoutService.executeEventPayouts(event.id, city);
        console.log(`✅ [CRISIS RESOLVED] Payout execution completed for ${city}`);
      } else {
        console.log(`ℹ️ [NORMAL] No disruption for ${city}. Continuing normal operations.`);
      }
    } catch (error) {
      console.error(`[DISRUPTION SERVICE ERROR] Failed to evaluate ${city}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve recent disruption checks for a city (last 24 hours)
   */
  public async getRecentChecks(city: string): Promise<any[]> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return await prisma.disruptionCheck.findMany({
      where: {
        city,
        createdAt: { gte: last24Hours },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}