import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { DisruptionService } from './modules/intelligence/disruption.service.js';
import { PremiumService } from './modules/premium/premium.service.js';
const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
const disruptionService = new DisruptionService();
const premiumService = new PremiumService();
// ==========================================
// 🕒 THE AUTONOMOUS CRON ENGINE
// ==========================================
// 1. AI Disruption Check - Runs at 2 PM and 8 PM daily
cron.schedule('0 14,20 * * *', async () => {
    console.log('[CRON] Initiating Disruption Intelligence Check for Chennai...');
    await disruptionService.evaluateCity('Chennai');
});
// 2. Weekly Premium Renewal - Runs at 11:55 PM every Saturday
cron.schedule('55 23 * * 6', async () => {
    console.log('[CRON] Initiating Weekly Policy Renewals...');
    await premiumService.processWeeklyRenewals();
});
// ==========================================
// 🚀 API ENDPOINTS (For Flutter App & Webhooks)
// ==========================================
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Online', service: 'Vritti-Core' });
});
// Hackathon Demo Backdoor: Force a Crisis Trigger instantly
app.post('/api/demo/force-trigger', async (req, res) => {
    const { city } = req.body;
    try {
        await disruptionService.evaluateCity(city);
        res.status(200).json({ message: `Forced evaluation for ${city}. Check logs for payout execution.` });
    }
    catch (err) {
        res.status(500).json({ error: 'Evaluation failed' });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️ Vritti Core Engine is live on port ${PORT}`);
});
//# sourceMappingURL=main.js.map