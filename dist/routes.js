import { Router } from 'express';
import { DisruptionController } from './modules/intelligence/disruption.controller.js';
import { PremiumController } from './modules/premium/premium.controller.js';
const router = Router();
// Initialize controllers
const disruptionController = new DisruptionController();
const premiumController = new PremiumController();
// ==========================================
// 🏥 Health Check Routes
// ==========================================
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'Online',
        service: 'Vritti-Core',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
    });
});
// ==========================================
// 🚨 Intelligence & Disruption Routes
// ==========================================
// Manual disruption evaluation (for demo)
router.post('/api/v1/intelligence/evaluate', (req, res) => {
    disruptionController.evaluateDisruption(req, res);
});
// Get disruption history
router.get('/api/v1/intelligence/history/:city', (req, res) => {
    disruptionController.getDisruptionHistory(req, res);
});
// Intelligence service health
router.get('/api/v1/intelligence/health', (req, res) => {
    disruptionController.health(req, res);
});
// ==========================================
// 💳 Premium & Policy Routes
// ==========================================
// Manual weekly renewal trigger (for demo)
router.post('/api/v1/premium/renew', (req, res) => {
    premiumController.triggerWeeklyRenewals(req, res);
});
// Get user policies
router.get('/api/v1/premium/policies/:userId', (req, res) => {
    premiumController.getUserPolicies(req, res);
});
// Get premium estimate
router.get('/api/v1/premium/estimate', (req, res) => {
    premiumController.getPremiumEstimate(req, res);
});
// Premium service health
router.get('/api/v1/premium/health', (req, res) => {
    premiumController.health(req, res);
});
// ==========================================
// 📊 Legacy Demo Routes (Backward Compat)
// ==========================================
// Hackathon demo backdoor: Direct force trigger
router.post('/api/demo/force-trigger', (req, res) => {
    disruptionController.evaluateDisruption(req, res);
});
// Demo: Force weekly renewals
router.post('/api/demo/force-renewal', (req, res) => {
    premiumController.triggerWeeklyRenewals(req, res);
});
export default router;
//# sourceMappingURL=routes.js.map