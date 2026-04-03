import { Router } from 'express';
import { DisruptionController } from './modules/intelligence/disruption.controller.js';
import { PremiumController } from './modules/premium/premium.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { FraudController } from './modules/fraud/fraud.controller.js';
import { LocationController } from './modules/location/location.controller.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { PayoutService } from './modules/payout/payout.service.js';
import { prisma } from './config/prisma.js';

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
router.post('/api/v1/auth/request-otp', (req, res) => authController.requestOtp(req, res));
router.post('/api/v1/auth/verify-otp', (req, res) => authController.verifyOtp(req, res));
router.get('/api/v1/auth/profile/:userId', (req, res) => authController.getUserProfile(req, res));

// ============================================================
// 📍 LOCATION & EDGE ENGINE
// ============================================================
router.post('/api/v1/user/location', (req, res) => locationController.syncLocation(req, res));
router.post('/api/heartbeat', (req, res) => fraudController.syncHeartbeat(req, res));
router.get('/api/v1/user/heartbeat/:userId', (req, res) => fraudController.getHeartbeatStatus(req, res));

// ============================================================
// 📊 DASHBOARD
// ============================================================
router.get('/api/v1/user/dashboard/:userId', async (req, res) => {
  const { userId } = req.params as { userId: string };

  try {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    
    // 🚨 FIXED: Moved recentFlag into Promise.all to prevent waterfall delay on UI
    const [invested, credited, user, latestHeartbeat, recentPayouts, recentFlag] = await Promise.all([
      premiumService.getTotalInvested(userId),
      payoutService.getTotalCredited(userId),
      prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true, policies: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      prisma.heartbeat.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      payoutService.getPayoutHistory(userId, 5),
      prisma.heartbeat.findFirst({ where: { userId, status: 'FLAGGED', createdAt: { gte: fifteenMinsAgo } } })
    ]);

    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    res.status(200).json({
      userId,
      moneyInvested: invested,
      moneyCredited: credited,
      currentBalance: user.wallet ? Number(user.wallet.balance) : 0,
      incomeBracket: user.incomeBracket,
      activePolicy: user.policies[0] ?? null,
      edgeEngine: {
        latestStatus: latestHeartbeat?.status ?? 'NO_DATA',
        isActivelyFlagged: !!recentFlag,
        lastBeatAt: latestHeartbeat?.createdAt ?? null,
        minutesSinceLastBeat: latestHeartbeat ? Math.floor((Date.now() - latestHeartbeat.createdAt.getTime()) / 60000) : null,
      },
      recentPayouts,
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
router.post('/api/v1/intelligence/evaluate', (req, res) => disruptionController.evaluateDisruption(req, res));
router.get('/api/v1/intelligence/history/:city', (req, res) => disruptionController.getDisruptionHistory(req, res));
router.get('/api/v1/intelligence/status/:city', (req, res) => disruptionController.getCityStatus(req, res));
router.get('/api/v1/intelligence/health', (req, res) => disruptionController.health(req, res));

// ============================================================
// 💳 ONE-TOUCH CLAIM
// ============================================================
router.post('/api/v1/claims/one-touch', (req, res) => disruptionController.oneTouchClaim(req, res));

// ============================================================
// 💰 PREMIUM & POLICIES
// ============================================================
router.post('/api/v1/premium/renew', (req, res) => premiumController.triggerWeeklyRenewals(req, res));
router.get('/api/v1/premium/policies/:userId', (req, res) => premiumController.getUserPolicies(req, res));
router.get('/api/v1/premium/estimate', (req, res) => premiumController.getPremiumEstimate(req, res));
router.get('/api/v1/premium/health', (req, res) => premiumController.health(req, res));

// ============================================================
// 💸 PAYOUT HISTORY
// ============================================================
router.get('/api/v1/payouts/:userId', async (req, res) => {
  const userId = req.params['userId'] as string;
  const limit = parseInt(req.query['limit'] as string) || 10;

  try {
    const history = await payoutService.getPayoutHistory(userId, limit);
    const total = await payoutService.getTotalCredited(userId);
    res.status(200).json({ userId, totalCredited: total, payouts: history, count: history.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payout history' });
  }
});

// ============================================================
// 🏥 SYSTEM HEALTH & DEMO BACKDOORS
// ============================================================
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Online', service: 'Vritti-Core', version: '2.0.0', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

router.post('/api/demo/force-trigger', async (req, res) => {
  const { city } = req.body as { city?: string };
  if (!city) { res.status(400).json({ error: 'city is required' }); return; }
  try {
    const { DisruptionService } = await import('./modules/intelligence/disruption.service.js');
    const svc = new DisruptionService();
    await svc.evaluateCity(city);
    res.status(200).json({ message: `Forced disruption evaluation for ${city} completed. Check server logs.` });
  } catch (err) { res.status(500).json({ error: 'Evaluation failed' }); }
});

router.post('/api/demo/force-renewal', async (req, res) => {
  try {
    const result = await premiumService.processWeeklyRenewals();
    res.status(200).json({ message: 'Manual premium renewal completed.', ...result });
  } catch (err) { res.status(500).json({ error: 'Renewal failed' }); }
});

router.post('/api/demo/seed-heartbeat', async (req, res) => {
  const { userId, status } = req.body as { userId?: string; status?: string };
  if (!userId || !status) { res.status(400).json({ error: 'userId and status required' }); return; }
  if (status !== 'NORMAL' && status !== 'FLAGGED') { res.status(400).json({ error: 'status must be NORMAL or FLAGGED' }); return; }

  try {
    const heartbeat = await prisma.heartbeat.create({ data: { userId, lat: 13.0827, lng: 80.2707, status } });
    console.log(`[DEMO] Seeded ${status} heartbeat for ${userId}`);
    res.status(200).json({ message: `Seeded ${status} heartbeat for demo`, heartbeat });
  } catch (err) { res.status(500).json({ error: 'Failed to seed heartbeat' }); }
});

export default router;