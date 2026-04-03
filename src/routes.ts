import { Router } from 'express';
import { DisruptionController } from './modules/intelligence/disruption.controller.js';
import { PremiumController } from './modules/premium/premium.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { FraudController } from './modules/fraud/fraud.controller.js';
import { LocationController } from './modules/location/location.controller.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { PayoutService } from './modules/payout/payout.service.js';
import { prisma } from './config/prisma.js';

// ============================================================
// Instantiate Controllers & Services
// ============================================================
const router = Router();
const disruptionController = new DisruptionController();
const premiumController = new PremiumController();
const authController = new AuthController();
const fraudController = new FraudController();
const locationController = new LocationController();
const premiumService = new PremiumService();
const payoutService = new PayoutService();

// ============================================================
// 🔐 AUTH — Onboarding & Sign In
// ============================================================

/**
 * POST /api/v1/auth/request-otp
 * Body: { phone: string }
 * Response: { message, isNewUser: boolean }
 * Works for both sign up (new user) and sign in (returning user).
 * Frontend uses isNewUser to show/hide the name/city/platform fields.
 */
router.post('/api/v1/auth/request-otp', (req, res) => authController.requestOtp(req, res));

/**
 * POST /api/v1/auth/verify-otp
 * Body (Sign Up): { phone, otp, name, city, platform, consentGiven: true }
 * Body (Sign In): { phone, otp }
 * Response: { message, isNewUser, user: { id, name, wallet, activePolicy, ... } }
 * Sign Up creates wallet + first Safety SIP policy.
 * Sign In just returns existing user data.
 */
router.post('/api/v1/auth/verify-otp', (req, res) => authController.verifyOtp(req, res));

/**
 * GET /api/v1/auth/profile/:userId
 * Returns full user profile including wallet and active policy.
 * Frontend calls this to refresh data after payouts.
 */
router.get('/api/v1/auth/profile/:userId', (req, res) => authController.getUserProfile(req, res));

// ============================================================
// 📍 LOCATION & EDGE ENGINE
// ============================================================

/**
 * POST /api/v1/user/location
 * Body: { userId, lat, lng, city }
 * Updates the user's live GPS coordinates in the database.
 */
router.post('/api/v1/user/location', (req, res) => locationController.syncLocation(req, res));

/**
 * POST /api/heartbeat
 * Body: { userId, lat, lng, status: 'NORMAL'|'FLAGGED', accelX, accelY, accelZ,
 *         gyroX, gyroY, gyroZ, speed, maeScore }
 * The Edge Engine (mobile) calls this every 30-60s with real sensor data.
 * status is determined by the MAE (Motion Anomaly Engine) on-device.
 */
router.post('/api/heartbeat', (req, res) => fraudController.syncHeartbeat(req, res));

/**
 * GET /api/v1/user/heartbeat/:userId
 * Returns the latest heartbeat status + recent stream for the Edge Engine UI panel.
 * Frontend polls this to update the red/green fraud indicator live.
 */
router.get('/api/v1/user/heartbeat/:userId', (req, res) =>
  fraudController.getHeartbeatStatus(req, res)
);

// ============================================================
// 📊 DASHBOARD
// ============================================================

/**
 * GET /api/v1/user/dashboard/:userId
 * Returns all stats needed for the main dashboard:
 *   - moneyInvested (total premiums paid)
 *   - moneyCredited (total payouts received)
 *   - currentBalance (live wallet balance)
 *   - incomeBracket
 *   - latestHeartbeatStatus (for Edge Engine panel)
 *   - activePolicy
 *   - recentPayouts (last 5)
 */
router.get('/api/v1/user/dashboard/:userId', async (req, res) => {
  const { userId } = req.params as { userId: string };

  try {
    // Parallel fetch for performance
    const [invested, credited, user, latestHeartbeat, recentPayouts] = await Promise.all([
      premiumService.getTotalInvested(userId),
      payoutService.getTotalCredited(userId),
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          policies: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      // Latest heartbeat for Edge Engine status indicator
      prisma.heartbeat.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Recent payouts for activity feed
      payoutService.getPayoutHistory(userId, 5),
    ]);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if user is currently flagged (last 15 minutes)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFlag = await prisma.heartbeat.findFirst({
      where: {
        userId,
        status: 'FLAGGED',
        createdAt: { gte: fifteenMinsAgo },
      },
    });

    res.status(200).json({
      userId,
      // Financial summary
      moneyInvested: invested,
      moneyCredited: credited,
      currentBalance: user.wallet ? Number(user.wallet.balance) : 0,
      incomeBracket: user.incomeBracket,
      // Policy info
      activePolicy: user.policies[0] ?? null,
      // Edge Engine status (for the fraud indicator)
      edgeEngine: {
        latestStatus: latestHeartbeat?.status ?? 'NO_DATA',
        isActivelyFlagged: !!recentFlag,
        lastBeatAt: latestHeartbeat?.createdAt ?? null,
        minutesSinceLastBeat: latestHeartbeat
          ? Math.floor((Date.now() - latestHeartbeat.createdAt.getTime()) / 60000)
          : null,
      },
      // Activity feed
      recentPayouts,
      // Meta
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[DASHBOARD ERROR]', err);
    res.status(500).json({ error: 'Dashboard data fetch failed' });
  }
});

// ============================================================
// 🔍 INTELLIGENCE & DISRUPTION
// ============================================================

/**
 * POST /api/v1/intelligence/evaluate
 * Body: { city: string }
 * Manually triggers city-wide disruption evaluation (cron fallback / demo).
 */
router.post('/api/v1/intelligence/evaluate', (req, res) =>
  disruptionController.evaluateDisruption(req, res)
);

/**
 * GET /api/v1/intelligence/history/:city
 * Returns last 24h of disruption checks for a city.
 */
router.get('/api/v1/intelligence/history/:city', (req, res) =>
  disruptionController.getDisruptionHistory(req, res)
);

/**
 * GET /api/v1/intelligence/status/:city
 * Returns current disruption status for a city (isDisrupted, lastCheck, activeEvent).
 * Frontend can poll this to show a city-wide alert banner.
 */
router.get('/api/v1/intelligence/status/:city', (req, res) =>
  disruptionController.getCityStatus(req, res)
);

/**
 * GET /api/v1/intelligence/health
 */
router.get('/api/v1/intelligence/health', (req, res) => disruptionController.health(req, res));

// ============================================================
// 💳 ONE-TOUCH CLAIM
// ============================================================

/**
 * POST /api/v1/claims/one-touch
 * Body: { userId: string, lat: number, lng: number }
 *
 * This is the CORE DEMO ENDPOINT. Runs the full 4-step verification:
 *   0. Policy & weekly limit check
 *   1. Edge Engine heartbeat verification
 *   2. News Intelligence Scraper (Python microservice)
 *   3. Live Weather API (OpenWeatherMap)
 *   4. Final aggregation & payout
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   steps: ClaimStep[],  ← frontend renders these as terminal log
 *   payoutAmount?: number,
 *   newBalance?: number  ← frontend updates wallet display immediately
 * }
 */
router.post('/api/v1/claims/one-touch', (req, res) =>
  disruptionController.oneTouchClaim(req, res)
);

// ============================================================
// 💰 PREMIUM & POLICIES
// ============================================================

/**
 * POST /api/v1/premium/renew
 * Manually triggers weekly renewal for all users (demo / cron fallback).
 * Response includes processed/succeeded/failed counts.
 */
router.post('/api/v1/premium/renew', (req, res) =>
  premiumController.triggerWeeklyRenewals(req, res)
);

/**
 * GET /api/v1/premium/policies/:userId
 * Returns all active policies for a user.
 */
router.get('/api/v1/premium/policies/:userId', (req, res) =>
  premiumController.getUserPolicies(req, res)
);

/**
 * GET /api/v1/premium/estimate?city=Chennai
 * Returns estimated weekly premium for a given city.
 */
router.get('/api/v1/premium/estimate', (req, res) =>
  premiumController.getPremiumEstimate(req, res)
);

/**
 * GET /api/v1/premium/health
 */
router.get('/api/v1/premium/health', (req, res) => premiumController.health(req, res));

// ============================================================
// 💸 PAYOUT HISTORY
// ============================================================

/**
 * GET /api/v1/payouts/:userId
 * Returns payout history for a user (default last 10).
 * Used for the activity feed / transaction history screen.
 */
router.get('/api/v1/payouts/:userId', async (req, res) => {
  const userId = req.params['userId'] as string;
  const limit = parseInt(req.query['limit'] as string) || 10;

  try {
    const history = await payoutService.getPayoutHistory(userId, limit);
    const total = await payoutService.getTotalCredited(userId);

    res.status(200).json({
      userId,
      totalCredited: total,
      payouts: history,
      count: history.length,
    });
  } catch (err) {
    console.error('[PAYOUT HISTORY ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

// ============================================================
// 🏥 SYSTEM HEALTH
// ============================================================

/**
 * GET /health
 * Basic server health check.
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'Online',
    service: 'Vritti-Core',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================================
// 🧪 DEMO BACKDOORS (Hackathon only)
// ============================================================

/**
 * POST /api/demo/force-trigger
 * Body: { city: string }
 * Legacy compatibility route — triggers disruption evaluation.
 */
router.post('/api/demo/force-trigger', async (req, res) => {
  const { city } = req.body as { city?: string };
  if (!city) {
    res.status(400).json({ error: 'city is required' });
    return;
  }
  try {
    const { DisruptionService } = await import('./modules/intelligence/disruption.service.js');
    const svc = new DisruptionService();
    await svc.evaluateCity(city);
    res.status(200).json({
      message: `Forced disruption evaluation for ${city} completed. Check server logs.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

/**
 * POST /api/demo/force-renewal
 * Manually triggers the Saturday renewal process.
 */
router.post('/api/demo/force-renewal', async (req, res) => {
  try {
    const result = await premiumService.processWeeklyRenewals();
    res.status(200).json({
      message: 'Manual premium renewal completed.',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: 'Renewal failed' });
  }
});

/**
 * POST /api/demo/seed-heartbeat
 * Body: { userId: string, status: 'NORMAL'|'FLAGGED' }
 * Seeds a heartbeat for demo purposes (simulates Edge Engine sending data).
 */
router.post('/api/demo/seed-heartbeat', async (req, res) => {
  const { userId, status } = req.body as { userId?: string; status?: string };

  if (!userId || !status) {
    res.status(400).json({ error: 'userId and status required' });
    return;
  }

  if (status !== 'NORMAL' && status !== 'FLAGGED') {
    res.status(400).json({ error: 'status must be NORMAL or FLAGGED' });
    return;
  }

  try {
    const heartbeat = await prisma.heartbeat.create({
      data: {
        userId,
        lat: 13.0827,  // Chennai coordinates
        lng: 80.2707,
        status,
      },
    });

    console.log(`[DEMO] Seeded ${status} heartbeat for ${userId}`);
    res.status(200).json({
      message: `Seeded ${status} heartbeat for demo`,
      heartbeat,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed heartbeat' });
  }
});

export default router;
