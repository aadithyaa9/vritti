import { Router } from 'express';
import { DisruptionController } from './modules/intelligence/disruption.controller.js';
import { PremiumController } from './modules/premium/premium.controller.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { FraudController } from './modules/fraud/fraud.controller.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { PayoutService } from './modules/payout/payout.service.js';
import { prisma } from './config/prisma.js';

import { LocationController } from './modules/location/location.controller.js';

// Instantiate
const locationController = new LocationController();

const router = Router();
const disruptionController = new DisruptionController();
const premiumController = new PremiumController();
const authController = new AuthController();
const fraudController = new FraudController();
const premiumService = new PremiumService();
const payoutService = new PayoutService();

// --- Onboarding & Security ---
router.post('/api/v1/auth/request-otp', (req, res) => authController.requestOtp(req, res));
router.post('/api/v1/auth/verify-otp', (req, res) => authController.verifyOtp(req, res));

// Add the new location route:
router.post('/api/v1/user/location', (req, res) => locationController.syncLocation(req, res));
router.post('/api/heartbeat', (req, res) => fraudController.syncHeartbeat(req, res));

// --- Dashboard Stats ---
router.get('/api/v1/user/dashboard/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const invested = await premiumService.getTotalInvested(userId);
    const credited = await payoutService.getTotalCredited(userId);
    const user = await prisma.user.findUnique({ 
      where: { id: userId }, 
      include: { wallet: true } 
    });
    res.json({
      moneyInvested: invested,
      moneyCredited: credited,
      currentBalance: user?.wallet?.balance,
      incomeBracket: user?.incomeBracket
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard failed" });
  }
});

// --- Intelligence & Disruption ---
router.post('/api/v1/intelligence/evaluate', (req, res) => disruptionController.evaluateDisruption(req, res));
router.get('/api/v1/intelligence/history/:city', (req, res) => disruptionController.getDisruptionHistory(req, res));
router.get('/api/v1/intelligence/health', (req, res) => disruptionController.health(req, res));

// --- Premium & Policies ---
router.post('/api/v1/premium/renew', (req, res) => premiumController.triggerWeeklyRenewals(req, res));
// router.post('/api/v1/premium/invest', (req, res) => premiumController.invest(req, res)); 
router.get('/api/v1/premium/policies/:userId', (req, res) => premiumController.getUserPolicies(req, res));
router.get('/api/v1/premium/health', (req, res) => premiumController.health(req, res));
router.post('/api/v1/claims/one-touch', (req, res) => disruptionController.oneTouchClaim(req, res));
// --- System Health ---
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Online', service: 'Vritti-Core' });
});

export default router;