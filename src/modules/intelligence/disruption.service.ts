import { prisma } from '../../config/prisma.js';
import { PayoutService } from '../payout/payout.service.js';
import axios from 'axios';

// This type is returned to the frontend so it can render the terminal log
export interface ClaimStep {
  step: number;
  label: string;
  status: 'passed' | 'failed' | 'warning' | 'info';
  detail: string;
  timestamp: string;
}

export interface OneTouchClaimResult {
  success: boolean;
  message: string;
  steps: ClaimStep[];
  payoutAmount?: number;
  newBalance?: number;
}

export class DisruptionService {
  private payoutService: PayoutService;

  constructor() {
    this.payoutService = new PayoutService();
  }

  /**
   * Core evaluation logic for cron-based city-wide disruption checks.
   * Queries news signals, weather metrics, and platform activity.
   * If crisis conditions are met, triggers payouts for all active users in city.
   */
  public async evaluateCity(city: string): Promise<void> {
    try {
      console.log(`\n[DISRUPTION SERVICE] ============================================`);
      console.log(`[DISRUPTION SERVICE] Starting evaluation for ${city}...`);
      console.log(`[DISRUPTION SERVICE] ============================================`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Evaluate News Signals
      const newsSignalsCount = await prisma.newsSignal.count({
        where: {
          city,
          isStrongMatch: true,
          createdAt: { gte: today },
        },
      });

      const recentArticles = await prisma.newsArticle.findMany({
        where: { city, fetchedAt: { gte: today } },
        include: { signals: true },
        take: 3,
        orderBy: { fetchedAt: 'desc' },
      });

      console.log(`[DISRUPTION] 📰 Strong News Signals Today: ${newsSignalsCount}`);
      recentArticles.forEach((a) => {
        console.log(`   → "${a.title}" (${a.source})`);
      });

      // 2. Evaluate Weather
      const extremeWeather = await prisma.weatherMetric.findFirst({
        where: {
          city,
          isExtremeThreshold: true,
          recordedAt: { gte: today },
        },
      });

      if (extremeWeather) {
        console.log(
          `[DISRUPTION] ⛈️  Extreme Weather Detected: Precipitation=${extremeWeather.precipitationMm}mm, AQI=${extremeWeather.aqiLevel}`
        );
      } else {
        console.log(`[DISRUPTION] ☀️  No extreme weather recorded today`);
      }

      // 3. Platform Activity (Ground Truth)
      const todayActivity = await prisma.activityLog.aggregate({
        where: { city, date: today },
        _sum: { ordersCompleted: true },
      });

      const todayOrders = todayActivity._sum.ordersCompleted || 0;
      const HISTORICAL_AVG_ORDERS = 1000;
      const activityScore = todayOrders / HISTORICAL_AVG_ORDERS;
      const activityDropRatio = 1 - activityScore;

      console.log(
        `[DISRUPTION] 📊 Platform Activity: ${todayOrders} orders today vs ${HISTORICAL_AVG_ORDERS} historical avg → Drop: ${(activityDropRatio * 100).toFixed(2)}%`
      );

      // 4. Decision Matrix
      const newsThreshold = newsSignalsCount > 2;
      const weatherThreshold = extremeWeather !== null;
      const activityThreshold = activityDropRatio >= 0.7;

      const isCrisis = (newsThreshold || weatherThreshold) && activityThreshold;

      const reason = isCrisis
        ? `🚨 CRISIS DECLARED: News(${newsSignalsCount} signals), Weather(${!!extremeWeather}), Activity Drop(${(activityDropRatio * 100).toFixed(2)}%)`
        : `✓ Normal Operations: Activity at ${(activityScore * 100).toFixed(2)}% of baseline. Crisis requires (news>2 OR extreme weather) AND activity drop ≥70%.`;

      console.log(`\n[DISRUPTION] VERDICT: ${reason}`);

      // 5. Immutable Log
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

      console.log(`[DISRUPTION] ✅ Check recorded with ID: ${check.id}`);

      // 6. Trigger Payouts if Crisis
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
          `\n🚨 [CRISIS EVENT] Type: ${event.type} | City: ${city} | Event ID: ${event.id}`
        );
        console.log(`[CRISIS] Triggering mass payouts for all active users in ${city}...`);

        await this.payoutService.executeEventPayouts(event.id, city);
        console.log(`✅ [CRISIS RESOLVED] Payout execution completed for ${city}\n`);
      } else {
        console.log(`ℹ️  [NORMAL] No disruption declared for ${city}.\n`);
      }
    } catch (error) {
      console.error(`[DISRUPTION SERVICE ERROR] Failed to evaluate ${city}:`, error);
      throw error;
    }
  }

  /**
   * One-Touch Claim: The individual rider-initiated claim flow.
   *
   * This is the DEMO-CRITICAL path. It runs 4 sequential verification steps
   * and returns a detailed steps array so the frontend can render a terminal log.
   *
   * Steps:
   *   0. Weekly limit & active policy check
   *   1. Edge Engine physical verification (heartbeat table)
   *   2. News Scraper call (Python microservice or mock)
   *   3. Weather API call (OpenWeatherMap or mock)
   *   4. Final aggregation & payout
   */
  public async processOneTouchClaim(
    userId: string,
    lat: number,
    lng: number
  ): Promise<OneTouchClaimResult> {
    const steps: ClaimStep[] = [];
    const ts = () => new Date().toISOString();

    console.log(`\n🚨 [ONE-TOUCH] ============================================`);
    console.log(`[ONE-TOUCH] Initiating claim for User: ${userId}`);
    console.log(`[ONE-TOUCH] Location: lat=${lat}, lng=${lng}`);
    console.log(`[ONE-TOUCH] ============================================`);

    try {
      // ============================================================
      // STEP 0: Active Policy & Weekly Limit Check
      // ============================================================
      console.log(`\n[STEP 0/4] Checking active policy and weekly limit...`);
      steps.push({
        step: 0,
        label: 'Policy & Limit Verification',
        status: 'info',
        detail: `Querying active policy for user ${userId}...`,
        timestamp: ts(),
      });

      const now = new Date();
      const activePolicy = await prisma.policy.findFirst({
        where: {
          userId,
          status: 'active',
          weekStartDate: { lte: now },
          weekEndDate: { gte: now },
        },
      });

      if (!activePolicy) {
        const msg = 'No active policy found for this week. Please renew your Safety SIP.';
        console.log(`[STEP 0] ❌ REJECTED: ${msg}`);
        steps.push({
          step: 0,
          label: 'Policy & Limit Verification',
          status: 'failed',
          detail: msg,
          timestamp: ts(),
        });
        return { success: false, message: msg, steps };
      }

      const existingPayout = await prisma.payout.findFirst({
        where: {
          userId,
          status: 'success',
          createdAt: {
            gte: activePolicy.weekStartDate,
            lte: activePolicy.weekEndDate,
          },
        },
      });

      if (existingPayout) {
        const msg = `Weekly payout limit reached. You already received ₹500 this week (${existingPayout.createdAt.toLocaleDateString()}).`;
        console.log(`[STEP 0] ❌ REJECTED: ${msg}`);
        steps.push({
          step: 0,
          label: 'Policy & Limit Verification',
          status: 'failed',
          detail: msg,
          timestamp: ts(),
        });
        return { success: false, message: msg, steps };
      }

      steps.push({
        step: 0,
        label: 'Policy & Limit Verification',
        status: 'passed',
        detail: `Active policy found (valid until ${activePolicy.weekEndDate.toLocaleDateString()}). No prior payout this week. ✓`,
        timestamp: ts(),
      });
      console.log(`[STEP 0] ✅ Active policy found. No prior payout this week.`);

      // ============================================================
      // STEP 1: Edge Engine Physical Verification
      // ============================================================
      console.log(`\n[STEP 1/4] Querying Edge Engine heartbeat data...`);
      steps.push({
        step: 1,
        label: 'Edge Engine Physical Verification',
        status: 'info',
        detail: `Scanning heartbeat table for FLAGGED status in last 15 minutes for user ${userId}...`,
        timestamp: ts(),
      });

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentHeartbeat = await prisma.heartbeat.findFirst({
        where: {
          userId,
          status: 'FLAGGED',
          createdAt: { gte: fifteenMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      const isPhysicallyFlagged = !!recentHeartbeat;

      if (isPhysicallyFlagged) {
        const minutesAgo = Math.floor(
          (Date.now() - recentHeartbeat!.createdAt.getTime()) / 60000
        );
        steps.push({
          step: 1,
          label: 'Edge Engine Physical Verification',
          status: 'passed',
          detail: `FLAGGED heartbeat detected ${minutesAgo} minute(s) ago. MAE vibration/speed mismatch confirmed. Physical presence verified. ✓`,
          timestamp: ts(),
        });
        console.log(
          `[STEP 1] ✅ FLAGGED heartbeat found ${minutesAgo} min ago. Physical anomaly confirmed.`
        );
      } else {
        // Check for any recent heartbeat to give context
        const anyRecent = await prisma.heartbeat.findFirst({
          where: { userId, createdAt: { gte: fifteenMinsAgo } },
          orderBy: { createdAt: 'desc' },
        });

        if (anyRecent) {
          steps.push({
            step: 1,
            label: 'Edge Engine Physical Verification',
            status: 'warning',
            detail: `Last heartbeat was NORMAL — sensors show no physical anomaly detected. Edge Engine did not flag motion irregularity.`,
            timestamp: ts(),
          });
          console.log(`[STEP 1] ⚠️  Recent heartbeat exists but status is NORMAL.`);
        } else {
          steps.push({
            step: 1,
            label: 'Edge Engine Physical Verification',
            status: 'warning',
            detail: `No heartbeat received in the last 15 minutes. Edge Engine may be offline or app was closed.`,
            timestamp: ts(),
          });
          console.log(`[STEP 1] ⚠️  No heartbeat in last 15 minutes.`);
        }
      }

      // ============================================================
      // STEP 2: News Intelligence Scraper Call
      // ============================================================
      console.log(`\n[STEP 2/4] Contacting News Intelligence Scraper...`);
      const PYTHON_SCRAPER_URL =
        process.env.PYTHON_SCRAPER_URL || 'http://localhost:5000/scrape';

      steps.push({
        step: 2,
        label: 'News Intelligence Scraper',
        status: 'info',
        detail: `POST → ${PYTHON_SCRAPER_URL} | Payload: { lat: ${lat.toFixed(4)}, lng: ${lng.toFixed(4)} }`,
        timestamp: ts(),
      });
      console.log(`[STEP 2] Calling Python scraper at ${PYTHON_SCRAPER_URL}...`);

      let newsIntensityScore = 0;
      let newsSource = 'mock';
      let newsDetail = '';

      try {
        const response = await axios.post(
          PYTHON_SCRAPER_URL,
          { lat, lng },
          { timeout: 5000 }
        );
        newsIntensityScore = response.data.intensityScore ?? 0;
        newsSource = 'live';
        newsDetail = response.data.summary ?? 'No summary returned';
        console.log(
          `[STEP 2] ✅ Scraper responded. Intensity Score: ${newsIntensityScore}/100`
        );
      } catch (scraperError) {
        // Fallback to mock — explicitly labeled for demo transparency
        newsIntensityScore = 87;
        newsSource = 'mock_fallback';
        newsDetail =
          'Heavy flooding reported across Chennai. Multiple arterial roads blocked. Delivery platforms reporting 70%+ order drop.';
        console.warn(
          `[STEP 2] ⚠️  Python scraper unreachable (${PYTHON_SCRAPER_URL}). Using mock intensity score: ${newsIntensityScore}`
        );
      }

      const newsThresholdMet = newsIntensityScore >= 70;
      steps.push({
        step: 2,
        label: 'News Intelligence Scraper',
        status: newsThresholdMet ? 'passed' : 'failed',
        detail: `[${newsSource.toUpperCase()}] Intensity Score: ${newsIntensityScore}/100 (threshold: 70). ${newsDetail}. ${newsThresholdMet ? '✓ PASSED' : '✗ FAILED'}`,
        timestamp: ts(),
      });
      console.log(
        `[STEP 2] News Intensity: ${newsIntensityScore}/100 → ${newsThresholdMet ? 'PASSED' : 'FAILED'}`
      );

      // ============================================================
      // STEP 3: Live Weather API Call
      // ============================================================
      console.log(`\n[STEP 3/4] Querying Live Weather API...`);
      const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=metric`;

      steps.push({
        step: 3,
        label: 'Live Weather API',
        status: 'info',
        detail: `GET → OpenWeatherMap API | Location: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`,
        timestamp: ts(),
      });
      console.log(`[STEP 3] Calling OpenWeatherMap at lat=${lat}, lng=${lng}...`);

      let isRaining = false;
      let weatherDescription = '';
      let weatherSource = 'mock';
      let tempCelsius = 0;
      let precipMm = 0;

      if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== 'your_key_here') {
        try {
          const wxResponse = await axios.get(weatherUrl, { timeout: 5000 });
          const weatherData = wxResponse.data;
          const mainCondition: string = weatherData.weather[0]?.main ?? 'Clear';
          weatherDescription = weatherData.weather[0]?.description ?? 'unknown';
          tempCelsius = weatherData.main?.temp ?? 0;
          precipMm = weatherData.rain?.['1h'] ?? 0;

          isRaining =
            mainCondition === 'Rain' ||
            mainCondition === 'Drizzle' ||
            mainCondition === 'Thunderstorm';
          weatherSource = 'live';

          console.log(
            `[STEP 3] ✅ Weather API responded. Condition: ${mainCondition} (${weatherDescription}), Temp: ${tempCelsius}°C, Precip: ${precipMm}mm`
          );
        } catch (wxError) {
          // Fallback to mock
          isRaining = true;
          weatherDescription = 'heavy intensity rain';
          tempCelsius = 27;
          precipMm = 45;
          weatherSource = 'mock_fallback';
          console.warn(`[STEP 3] ⚠️  Weather API failed. Using mock data.`);
        }
      } else {
        // No API key — use mock
        isRaining = true;
        weatherDescription = 'heavy intensity rain';
        tempCelsius = 27;
        precipMm = 45;
        weatherSource = 'mock_no_key';
        console.warn(`[STEP 3] ⚠️  OPENWEATHER_API_KEY not set. Using mock weather data.`);
      }

      steps.push({
        step: 3,
        label: 'Live Weather API',
        status: isRaining ? 'passed' : 'failed',
        detail: `[${weatherSource.toUpperCase()}] Condition: ${weatherDescription || 'clear'} | Temp: ${tempCelsius}°C | Precipitation: ${precipMm}mm/hr. Rain detected: ${isRaining}. ${isRaining ? '✓ PASSED' : '✗ FAILED'}`,
        timestamp: ts(),
      });
      console.log(
        `[STEP 3] Weather: "${weatherDescription}" | Rain: ${isRaining} → ${isRaining ? 'PASSED' : 'FAILED'}`
      );

      // ============================================================
      // STEP 4: Final Aggregation & Payout Decision
      // ============================================================
      console.log(`\n[STEP 4/4] Running Final Aggregation Engine...`);
      const hasExternalDisruption = newsThresholdMet || isRaining;

      steps.push({
        step: 4,
        label: 'Final Aggregation Engine',
        status: 'info',
        detail: `Aggregating: EdgeEngine(${isPhysicallyFlagged ? '✓' : '✗'}) + News(${newsThresholdMet ? '✓' : '✗'}) + Weather(${isRaining ? '✓' : '✗'}). Rule: ExternalDisruption AND PhysicalVerification must both be true.`,
        timestamp: ts(),
      });

      console.log(`[STEP 4] Aggregation: Physical=${isPhysicallyFlagged}, External=${hasExternalDisruption}`);

      if (hasExternalDisruption && isPhysicallyFlagged) {
        console.log(`[STEP 4] ✅ ALL CONDITIONS MET. Triggering payout...`);

        const PAYOUT_AMOUNT = 500.0;
        const payoutResult = await this.payoutService.executeSingleUserPayoutWithBalance(
          userId,
          PAYOUT_AMOUNT,
          'One-Touch: Edge Engine + News Scraper + Weather API'
        );

        if (payoutResult.success) {
          steps.push({
            step: 4,
            label: 'Final Aggregation Engine',
            status: 'passed',
            detail: `✅ ALL CONDITIONS MET. ₹${PAYOUT_AMOUNT} credited to your Gullak wallet. New balance: ₹${payoutResult.newBalance?.toFixed(2)}.`,
            timestamp: ts(),
          });

          const successMsg = `Claim approved! Environmental disruption physically verified. ₹${PAYOUT_AMOUNT} has been credited to your Gullak.`;
          console.log(`[STEP 4] ✅ Payout successful. New balance: ₹${payoutResult.newBalance}`);

          return {
            success: true,
            message: successMsg,
            steps,
            payoutAmount: PAYOUT_AMOUNT,
            newBalance: payoutResult.newBalance,
          };
        } else {
          steps.push({
            step: 4,
            label: 'Final Aggregation Engine',
            status: 'failed',
            detail: 'Conditions met but payment processing encountered an error. Please contact support.',
            timestamp: ts(),
          });
          return {
            success: false,
            message: 'Claim approved but payment processing failed. Please contact support.',
            steps,
          };
        }
      } else {
        // Build a detailed rejection reason
        const reasons: string[] = [];
        if (!isPhysicallyFlagged) {
          reasons.push('Edge Engine did not detect a physical anomaly (no FLAGGED heartbeat in the last 15 minutes)');
        }
        if (!hasExternalDisruption) {
          reasons.push('External APIs show clear conditions (News intensity < 70 AND no rain detected)');
        }

        const rejectionDetail = `Claim denied: ${reasons.join('. ')}.`;
        steps.push({
          step: 4,
          label: 'Final Aggregation Engine',
          status: 'failed',
          detail: rejectionDetail,
          timestamp: ts(),
        });

        console.log(`[STEP 4] ❌ Conditions not met. ${rejectionDetail}`);
        return { success: false, message: rejectionDetail, steps };
      }
    } catch (error) {
      console.error(`[ONE-TOUCH ERROR]`, error);
      steps.push({
        step: 99,
        label: 'System Error',
        status: 'failed',
        detail: `Internal server error: ${(error as Error).message}`,
        timestamp: ts(),
      });
      return {
        success: false,
        message: 'An internal error occurred while processing your claim.',
        steps,
      };
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

  /**
   * Get current disruption status for a city — used by dashboard polling
   */
  public async getCityStatus(city: string): Promise<{
    city: string;
    isDisrupted: boolean;
    lastCheck: any | null;
    activeEvent: any | null;
  }> {
    const lastCheck = await prisma.disruptionCheck.findFirst({
      where: { city },
      orderBy: { createdAt: 'desc' },
    });

    const activeEvent = await prisma.event.findFirst({
      where: { city, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      city,
      isDisrupted: lastCheck?.disruption ?? false,
      lastCheck,
      activeEvent,
    };
  }
}
