import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { DisruptionService } from './modules/intelligence/disruption.service.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { IngestionService } from './modules/ingestion/ingestion.service.js';
import routes from './routes.js';
// Initialize services
const disruptionService = new DisruptionService();
const premiumService = new PremiumService();
const ingestionService = new IngestionService();
// Initialize Express app
const app = express();
// ==========================================
// 🛡️ Middleware Stack
// ==========================================
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // JSON parsing
app.use(express.urlencoded({ extended: true })); // URL encoding
// ==========================================
// 📡 Mount Routes
// ==========================================
app.use(routes);
// ==========================================
// 🕒 Autonomous Cron Engine
// ==========================================
console.log('[CRON] Initializing autonomous scheduling engine...');
/**
 * Every 4 hours: Fetch external data (mock weather & news) for Chennai
 * 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
 */
cron.schedule('0 */4 * * *', async () => {
    try {
        console.log('\n🌍 [CRON - 4 HOUR] External Data Ingestion starting...');
        await ingestionService.fetchExternalData('Chennai');
        console.log('✅ [CRON - 4 HOUR] External data ingestion completed\n');
    }
    catch (error) {
        console.error('❌ [CRON - 4 HOUR ERROR]', error);
    }
});
/**
 * Daily at 14:00 (2:00 PM): AI Disruption Intelligence Check
 * Evaluates news signals, weather data, and platform activity for Chennai
 */
cron.schedule('0 14 * * *', async () => {
    try {
        console.log('\n🔍 [CRON - 14:00] Daily Disruption Intelligence Check starting...');
        await disruptionService.evaluateCity('Chennai');
        console.log('✅ [CRON - 14:00] Disruption check completed\n');
    }
    catch (error) {
        console.error('❌ [CRON - 14:00 ERROR]', error);
    }
});
/**
 * Daily at 20:00 (8:00 PM): Evening Disruption Intelligence Check
 * Another evaluation window for real-time crisis detection
 */
cron.schedule('0 20 * * *', async () => {
    try {
        console.log('\n🔍 [CRON - 20:00] Evening Disruption Intelligence Check starting...');
        await disruptionService.evaluateCity('Chennai');
        console.log('✅ [CRON - 20:00] Disruption check completed\n');
    }
    catch (error) {
        console.error('❌ [CRON - 20:00 ERROR]', error);
    }
});
/**
 * Every Saturday at 23:55: Weekly Premium Renewal
 * Calculates and deducts premiums, issues new policies for the upcoming week
 */
cron.schedule('55 23 * * 6', async () => {
    try {
        console.log('\n💳 [CRON - SATURDAY 23:55] Weekly Policy Renewal starting...');
        await premiumService.processWeeklyRenewals();
        console.log('✅ [CRON - SATURDAY 23:55] Weekly renewals completed\n');
    }
    catch (error) {
        console.error('❌ [CRON - SATURDAY 23:55 ERROR]', error);
    }
});
console.log('[CRON] Autonomous scheduling engine initialized successfully!');
console.log('[CRON] Scheduled Tasks:');
console.log('  ➜ Every 4 hours: External Data Ingestion');
console.log('  ➜ Daily 14:00: Disruption Intelligence Check');
console.log('  ➜ Daily 20:00: Evening Disruption Check');
console.log('  ➜ Saturday 23:55: Weekly Premium Renewal Process');
// ==========================================
// 🚀 Server Startup
// ==========================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const server = app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('🛡️  VRITTI CORE ENGINE - PARAMETRIC MICRO-INSURANCE PLATFORM');
    console.log(`${'='.repeat(60)}`);
    console.log(`📍 Environment: ${NODE_ENV.toUpperCase()}`);
    console.log(`🚀 Server Running: http://localhost:${PORT}`);
    console.log(`⏰ Started: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}\n`);
    // Log available endpoints
    console.log('📚 Available Endpoints:');
    console.log('  Health & Status:');
    console.log('    GET  /health');
    console.log('    GET  /api/v1/intelligence/health');
    console.log('    GET  /api/v1/premium/health');
    console.log('\n  Intelligence & Disruption:');
    console.log('    POST /api/v1/intelligence/evaluate          (Manual trigger - Demo)');
    console.log('    GET  /api/v1/intelligence/history/:city     (View disruption history)');
    console.log('\n  Premium & Policies:');
    console.log('    POST /api/v1/premium/renew                  (Manual trigger - Demo)');
    console.log('    GET  /api/v1/premium/policies/:userId       (View user policies)');
    console.log('    GET  /api/v1/premium/estimate               (Premium estimate)');
    console.log('\n  Demo/Backdoor:');
    console.log('    POST /api/demo/force-trigger                (Legacy compatibility)');
    console.log('    POST /api/demo/force-renewal                (Legacy compatibility)');
    console.log(`\n${'='.repeat(60)}\n`);
});
// ==========================================
// 🛑 Graceful Shutdown
// ==========================================
process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] SIGTERM received. Gracefully shutting down...');
    server.close(() => {
        console.log('[SHUTDOWN] Server closed. Exiting process.');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] SIGINT received. Gracefully shutting down...');
    server.close(() => {
        console.log('[SHUTDOWN] Server closed. Exiting process.');
        process.exit(0);
    });
});
// Error handling
process.on('uncaughtException', (error) => {
    console.error('[FATAL ERROR] Uncaught exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL ERROR] Unhandled rejection:', reason);
    process.exit(1);
});
//# sourceMappingURL=main.js.map