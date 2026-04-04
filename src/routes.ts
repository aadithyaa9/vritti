import { Router } from 'express';
import { DisruptionController } from './modules/intelligence/disruption.controller.js';
import { PremiumController } from './modules/premium/premium.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { FraudController } from './modules/fraud/fraud.controller.js';
import { LocationController } from './modules/location/location.controller.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { DemoController } from './modules/demo/demo.controller.js';
import { PricingEngineService } from './modules/pricing/pricing.engine.service.js';
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
const dashboardController = new DashboardController();
const demoController = new DemoController();
const pricingEngine = new PricingEngineService();

// ============================================================
// 🔐 AUTH
// ============================================================
router.post('/api/v1/auth/request-otp', (req, res) => authController.requestOtp(req, res));
router.post('/api/v1/auth/verify-otp', (req, res) => authController.verifyOtp(req, res));
router.get('/api/v1/auth/profile/:userId', (req, res) => authController.getUserProfile(req, res));

// ============================================================
// 📍 LOCATION & EDGE ENGINE
// ============================================================
router.post('/api/v1/user/location', (req, res) => locationController.syncLocation(req, res));
router.post('/api/heartbeat', (req, res) => fraudController.syncHeartbeat(req, res));
router.post('/api/v1/telemetry/heartbeat', (req, res) => fraudController.syncHeartbeat(req, res));
router.get('/api/v1/user/heartbeat/:userId', (req, res) => fraudController.getHeartbeatStatus(req, res));

// ============================================================
// 📊 DASHBOARD
// ============================================================
router.get('/api/v1/user/dashboard/:userId', (req, res) => dashboardController.getDashboardData(req, res));

// ============================================================
// 🔍 INTELLIGENCE & DISRUPTION
// ============================================================
router.post('/api/v1/intelligence/evaluate', (req, res) => disruptionController.evaluateDisruption(req, res));
router.get('/api/v1/intelligence/history/:city', (req, res) => disruptionController.getDisruptionHistory(req, res));
router.get('/api/v1/intelligence/status/:city', (req, res) => disruptionController.getCityStatus(req, res));
router.get('/api/v1/intelligence/health', (req, res) => disruptionController.health(req, res));

// ============================================================
// 🚨 CLAIMS
// ============================================================
router.post('/api/v1/claims/one-touch', (req, res) => disruptionController.oneTouchClaim(req, res));
router.post('/api/v1/claims/trigger', (req, res) => disruptionController.oneTouchClaim(req, res));

// ============================================================
// 💳 PREMIUM & POLICIES
// ============================================================
router.post('/api/v1/premium/renew', (req, res) => premiumController.triggerWeeklyRenewals(req, res));
router.get('/api/v1/premium/policies/:userId', (req, res) => premiumController.getUserPolicies(req, res));
router.get('/api/v1/premium/estimate', (req, res) => premiumController.getPremiumEstimate(req, res));
router.get('/api/v1/premium/health', (req, res) => premiumController.health(req, res));

// ============================================================
// 🤖 ML PRICING ENGINE — direct endpoints
// ============================================================

/**
 * GET /api/v1/pricing/health
 * Check if the ML pricing engine is up and model is trained.
 */
router.get('/api/v1/pricing/health', async (_req, res) => {
  try {
    const health = await pricingEngine.checkHealth();
    if (!health) {
      res.status(503).json({ status: 'unavailable', message: 'Pricing engine is unreachable' });
      return;
    }
    res.status(200).json({ status: 'ok', engine: health });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach pricing engine' });
  }
});

/**
 * GET /api/v1/pricing/r-alert/:city?imd_level=0&max_temp=30
 * Returns the real-time R_alert zone multiplier for a city.
 */
router.get('/api/v1/pricing/r-alert/:city', async (req, res) => {
  const city = req.params['city'] as string;
  const imdLevel = parseInt(req.query['imd_level'] as string) || 0;
  const maxTemp = parseFloat(req.query['max_temp'] as string) || 30;

  try {
    const alert = await pricingEngine.getRAlert(city, imdLevel, maxTemp);
    if (!alert) {
      res.status(503).json({ error: 'R-Alert unavailable for this zone' });
      return;
    }
    res.status(200).json({ city, ...alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch R-Alert' });
  }
});

/**
 * GET /api/v1/pricing/quote/:userId?city=Chennai
 * Full personalised ML quote: calls /predict + /r_alert, returns combined result.
 */
router.get('/api/v1/pricing/quote/:userId', async (req, res) => {
  const userId = req.params['userId'] as string;
  const city = typeof req.query['city'] === 'string' ? req.query['city'] : 'Chennai';

  if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

  try {
    const result = await pricingEngine.getDynamicPremium(userId, city);
    res.status(200).json({
      userId,
      city,
      basePremium: 150.0,
      finalPremium: result.finalPremium,
      wRiskScore: result.wRiskScore,
      rAlertMultiplier: result.rAlertMultiplier,
      source: result.source,
      engineResponse: result.engineResponse,
      currency: 'INR',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate pricing quote' });
  }
});

/**
 * POST /api/v1/pricing/predict
 * Raw passthrough to the ML engine's /predict endpoint.
 */
router.post('/api/v1/pricing/predict', async (req, res) => {
  try {
    const prediction = await pricingEngine.predictSingle(req.body);
    if (!prediction) {
      res.status(503).json({ error: 'Pricing engine predict unavailable' });
      return;
    }
    res.status(200).json(prediction);
  } catch (err) {
    res.status(500).json({ error: 'Predict failed' });
  }
});

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
// 🏥 HEALTH
// ============================================================
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
// 🧪 DEMO BACKDOORS
// ============================================================
router.post('/api/demo/simulate-week', (req, res) => demoController.simulateWeek(req, res));

router.post('/api/demo/force-trigger', async (req, res) => {
  const { city } = req.body as { city?: string };
  if (!city) { res.status(400).json({ error: 'city is required' }); return; }
  try {
    const { DisruptionService } = await import('./modules/intelligence/disruption.service.js');
    const svc = new DisruptionService();
    await svc.evaluateCity(city);
    res.status(200).json({ message: `Forced disruption evaluation for ${city} completed.` });
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
    const heartbeat = await prisma.heartbeat.create({
      data: { userId, lat: 13.0827, lng: 80.2707, status },
    });
    res.status(200).json({ message: `Seeded ${status} heartbeat for demo`, heartbeat });
  } catch (err) { res.status(500).json({ error: 'Failed to seed heartbeat' }); }
});

/**
 * POST /api/demo/pricing-quote
 * Shows full ML pricing breakdown for a seeded user — great for hackathon demo.
 * Body: { userId, city? }
 */
router.post('/api/demo/pricing-quote', async (req, res) => {
  const { userId, city = 'Chennai' } = req.body as { userId?: string; city?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const payload = await pricingEngine.buildPayloadForUser(userId);
    const result = await pricingEngine.getDynamicPremium(userId, city);
    res.status(200).json({
      userId,
      city,
      pricingResult: result,
      mlPayload: payload,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Pricing demo failed' });
  }
});

export default router;
//6caa2898-035a-4a05-b759-6fafeda9c0f6