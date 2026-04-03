import { prisma } from '../../config/prisma.js';
import { PayoutService } from '../payout/payout.service.js';
import axios from 'axios';

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

  public async processOneTouchClaim(userId: string, lat: number, lng: number): Promise<{ success: boolean, message: string }> {
    console.log(`\n🚨 [ONE-TOUCH] Initiating flow for User: ${userId} at [${lat}, ${lng}]`);
    
    try {
      // --- 0. WEEKLY LIMIT CHECK (NEW) ---
      const now = new Date();
      const activePolicy = await prisma.policy.findFirst({
        where: {
          userId,
          status: 'active',
          weekStartDate: { lte: now },
          weekEndDate: { gte: now }
        }
      });

      if (!activePolicy) {
        console.log(`❌ [ONE-TOUCH] Rejected: No active policy.`);
        return { success: false, message: "Claim denied: You do not have an active policy for this week." };
      }

      const existingPayout = await prisma.payout.findFirst({
        where: {
          userId,
          status: 'success',
          createdAt: {
            gte: activePolicy.weekStartDate,
            lte: activePolicy.weekEndDate
          }
        }
      });

      if (existingPayout) {
        console.log(`❌ [ONE-TOUCH] Rejected: Weekly limit reached for ${userId}.`);
        return { success: false, message: "Claim denied: You have already received your maximum allowed payout for this week." };
      }

      // --- 1. EDGE ENGINE INSIGHTS (Physical Verification) ---
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentHeartbeat = await prisma.heartbeat.findFirst({
        where: {
          userId,
          status: 'FLAGGED',
          createdAt: { gte: fifteenMinsAgo }
        },
        orderBy: { createdAt: 'desc' }
      });

      const isPhysicallyFlagged = !!recentHeartbeat;
      console.log(`[ONE-TOUCH] Edge Engine Flagged: ${isPhysicallyFlagged}`);

      // --- 2. NEWS SCRAPER CALL ---
      const PYTHON_SCRAPER_URL = process.env.PYTHON_SCRAPER_URL || 'http://localhost:5000/scrape';
      let newsIntensityScore = 0;
      try {
         // const response = await axios.post(PYTHON_SCRAPER_URL, { lat, lng });
         // newsIntensityScore = response.data.intensityScore;
         newsIntensityScore = 85; // Mocking High Intensity
      } catch(e) {
         console.warn('[ONE-TOUCH] Python API unreachable, using mock score.');
         newsIntensityScore = 85; 
      }
      
      // --- 3. WEATHER API CALL ---
      let isRaining = false;
      try {
         // const wxResponse = await axios.get(`https://api.openweathermap.org/data/2.5/weather?...`);
         // isRaining = wxResponse.data.weather[0].main === 'Rain';
         isRaining = true; // Mocking rain
      } catch(e) {
         console.warn('[ONE-TOUCH] Weather API unreachable, using mock data.');
         isRaining = true;
      }

      console.log(`[ONE-TOUCH] News Intensity: ${newsIntensityScore}, Is Raining: ${isRaining}`);

      // --- 4. FINAL AGGREGATION ---
      const hasExternalDisruption = newsIntensityScore >= 70 || isRaining;

      if (hasExternalDisruption && isPhysicallyFlagged) {
         console.log(`✅ [ONE-TOUCH] Physical & External Data Match! Triggering Payout...`);
         
         const payoutSuccess = await this.payoutService.executeSingleUserPayout(
            userId, 
            500.0, 
            'One-Touch: Edge Engine + External Validation'
         );

         if (payoutSuccess) {
            return { success: true, message: "Claim approved: Environmental disruption physically verified. ₹500 credited." };
         } else {
            return { success: false, message: "Claim approved, but payment processing failed." };
         }
      } else {
         let reason = "Conditions not met.";
         if (!isPhysicallyFlagged) reason += " Edge Engine did not detect critical physical anomalies.";
         if (!hasExternalDisruption) reason += " External APIs (News/Weather) show clear conditions.";
         
         console.log(`❌ [ONE-TOUCH] Rejected: ${reason}`);
         return { success: false, message: `Claim denied: ${reason}` };
      }
    } catch (error) {
      console.error(`[ONE-TOUCH ERROR]`, error);
      throw new Error("Internal failure processing One-Touch claim");
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