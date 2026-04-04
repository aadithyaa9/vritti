import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { DisruptionService } from './modules/intelligence/disruption.service.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { IngestionService } from './modules/ingestion/ingestion.service.js';
import { PricingEngineService } from './modules/pricing/pricing.engine.service.js';
import routes from './routes.js';

// ============================================================
// Initialize Services
// ============================================================
const disruptionService = new DisruptionService();
const premiumService = new PremiumService();
const ingestionService = new IngestionService();
const pricingEngine = new PricingEngineService();

// ============================================================
// Express App Setup
// ============================================================
const app = express();

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(routes);

// ============================================================
// Autonomous Cron Engine
// ============================================================
console.log('\n[CRON] Initializing autonomous scheduling engine...');

/**
 * Every 4 hours: Fetch fresh weather + news data for Chennai
 */
cron.schedule('0 */4 * * *', async () => {
  try {
    console.log('\n🌍 [CRON 4H] External Data Ingestion starting for Chennai...');
    await ingestionService.fetchExternalData('Chennai');
    console.log('✅ [CRON 4H] Ingestion done\n');
  } catch (error) {
    console.error('❌ [CRON 4H ERROR]', error);
  }
});

/**
 * Every 6 hours: Refresh R-Alert zone multiplier from the pricing engine.
 * Mirrors the engine's own cadence ("Called by alert.cron.ts every 6 hours").
 */
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('\n🤖 [CRON 6H] R-Alert zone refresh from pricing engine...');
    const alert = await pricingEngine.getRAlert('Chennai');
    if (alert) {
      console.log(`✅ [CRON 6H] R-Alert multiplier for Chennai: ${alert.r_alert_multiplier}\n`);
    } else {
      console.warn('⚠️  [CRON 6H] R-Alert returned null (engine may be cold-starting)\n');
    }
  } catch (error) {
    console.error('❌ [CRON 6H ERROR]', error);
  }
});

/**
 * Daily at 14:00: Afternoon disruption check
 */
cron.schedule('0 14 * * *', async () => {
  try {
    console.log('\n🔍 [CRON 14:00] Afternoon Disruption Check for Chennai...');
    await disruptionService.evaluateCity('Chennai');
    console.log('✅ [CRON 14:00] Done\n');
  } catch (error) {
    console.error('❌ [CRON 14:00 ERROR]', error);
  }
});

/**
 * Daily at 20:00: Evening disruption check
 */
cron.schedule('0 20 * * *', async () => {
  try {
    console.log('\n🔍 [CRON 20:00] Evening Disruption Check for Chennai...');
    await disruptionService.evaluateCity('Chennai');
    console.log('✅ [CRON 20:00] Done\n');
  } catch (error) {
    console.error('❌ [CRON 20:00 ERROR]', error);
  }
});

/**
 * Every Saturday at 23:55: Weekly premium renewal via ML pricing engine batch
 */
cron.schedule('55 23 * * 6', async () => {
  try {
    console.log('\n💳 [CRON SAT 23:55] Weekly Policy Renewal with ML pricing...');
    await premiumService.processWeeklyRenewals();
    console.log('✅ [CRON SAT 23:55] Renewals done\n');
  } catch (error) {
    console.error('❌ [CRON SAT 23:55 ERROR]', error);
  }
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, async () => {
  const border = '='.repeat(65);
  console.log(`\n${border}`);
  console.log('🛡️   VRITTI CORE ENGINE  —  Parametric Micro-Insurance Platform');
  console.log(border);
  console.log(`📍  Environment : ${NODE_ENV.toUpperCase()}`);
  console.log(`🚀  Server      : http://localhost:${PORT}`);
  console.log(`⏰  Started     : ${new Date().toISOString()}`);
  console.log(border);

  console.log('\n📚 ENDPOINTS:\n');
  console.log('  🔐 AUTH');
  console.log('     POST  /api/v1/auth/request-otp');
  console.log('     POST  /api/v1/auth/verify-otp');
  console.log('     GET   /api/v1/auth/profile/:userId\n');

  console.log('  📍 LOCATION & EDGE ENGINE');
  console.log('     POST  /api/v1/user/location');
  console.log('     POST  /api/v1/telemetry/heartbeat');
  console.log('     GET   /api/v1/user/heartbeat/:userId\n');

  console.log('  📊 DASHBOARD');
  console.log('     GET   /api/v1/user/dashboard/:userId\n');

  console.log('  🔍 INTELLIGENCE');
  console.log('     POST  /api/v1/intelligence/evaluate');
  console.log('     GET   /api/v1/intelligence/history/:city');
  console.log('     GET   /api/v1/intelligence/status/:city\n');

  console.log('  🚨 CLAIMS');
  console.log('     POST  /api/v1/claims/one-touch\n');

  console.log('  💳 PREMIUM');
  console.log('     POST  /api/v1/premium/renew          ← ML batch pricing');
  console.log('     GET   /api/v1/premium/policies/:userId');
  console.log('     GET   /api/v1/premium/estimate?city=&userId=\n');

  console.log('  🤖 ML PRICING ENGINE');
  console.log('     GET   /api/v1/pricing/health         ← engine readiness');
  console.log('     GET   /api/v1/pricing/r-alert/:city  ← zone multiplier');
  console.log('     GET   /api/v1/pricing/quote/:userId  ← personalised quote');
  console.log('     POST  /api/v1/pricing/predict        ← raw ML passthrough\n');

  console.log('  💸 PAYOUTS');
  console.log('     GET   /api/v1/payouts/:userId\n');

  console.log('  🧪 DEMO');
  console.log('     POST  /api/demo/force-trigger');
  console.log('     POST  /api/demo/force-renewal        ← triggers ML batch');
  console.log('     POST  /api/demo/seed-heartbeat');
  console.log('     POST  /api/demo/pricing-quote        ← full ML breakdown\n');

  console.log('  🏥 HEALTH');
  console.log('     GET   /health\n');

  console.log(border);
  console.log('⏱️  CRON SCHEDULE:');
  console.log('     Every 4 hours  → External Data Ingestion (weather + news)');
  console.log('     Every 6 hours  → R-Alert zone multiplier refresh');
  console.log('     Daily 14:00    → Afternoon Disruption Check');
  console.log('     Daily 20:00    → Evening Disruption Check');
  console.log('     Saturday 23:55 → Weekly Premium Renewal (ML batch)');
  console.log(`${border}\n`);

  // ── Startup: warm up the pricing engine ────────────────────
  try {
    const health = await pricingEngine.checkHealth();
    if (health?.ready) {
      console.log(
        `🤖 [PRICING ENGINE] ✅ Online — trained ${health.model_trained_at} | ` +
          `rows=${health.n_training_rows} | baseline_w_risk=${health.baseline_w_risk}`
      );
    } else {
      console.warn(
        '🤖 [PRICING ENGINE] ⚠️  Not ready or unreachable — fallback premiums will be used'
      );
    }
  } catch {
    console.warn('🤖 [PRICING ENGINE] ⚠️  Startup health check failed');
  }
});

// ============================================================
// Graceful Shutdown
// ============================================================
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received. Closing server gracefully...');
  server.close(() => { console.log('[SHUTDOWN] Server closed.'); process.exit(0); });
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received. Closing server gracefully...');
  server.close(() => { console.log('[SHUTDOWN] Server closed.'); process.exit(0); });
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});