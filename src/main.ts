import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { DisruptionService } from './modules/intelligence/disruption.service.js';
import { PremiumService } from './modules/premium/premium.service.js';
import { IngestionService } from './modules/ingestion/ingestion.service.js';
import routes from './routes.js';

// ============================================================
// Initialize Services
// ============================================================
const disruptionService = new DisruptionService();
const premiumService = new PremiumService();
const ingestionService = new IngestionService();

// ============================================================
// Express App Setup
// ============================================================
const app = express();

app.use(helmet());
app.use(cors({
  origin: '*', // In production, restrict to your Flutter app's domain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Mount All Routes
// ============================================================
app.use(routes);

// ============================================================
// Autonomous Cron Engine
// ============================================================
console.log('\n[CRON] Initializing autonomous scheduling engine...');

/**
 * Every 4 hours: Fetch fresh weather + news data for Chennai
 * This populates the signals that the disruption check evaluates
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
 * Daily at 14:00: Afternoon disruption intelligence check
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
 * Every Saturday at 23:55: Weekly premium renewal
 * Deducts premiums and issues new policies for the coming week
 */
cron.schedule('55 23 * * 6', async () => {
  try {
    console.log('\n💳 [CRON SAT 23:55] Weekly Policy Renewal starting...');
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

const server = app.listen(PORT, () => {
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
  console.log('     POST  /api/v1/auth/request-otp         → Request OTP (sign up or sign in)');
  console.log('     POST  /api/v1/auth/verify-otp           → Verify OTP + create account');
  console.log('     GET   /api/v1/auth/profile/:userId      → Refresh user profile\n');

  console.log('  📍 LOCATION & EDGE ENGINE');
  console.log('     POST  /api/v1/user/location             → Sync GPS coordinates');
  console.log('     POST  /api/heartbeat                    → Edge Engine sensor heartbeat');
  console.log('     GET   /api/v1/user/heartbeat/:userId    → Poll fraud status indicator\n');

  console.log('  📊 DASHBOARD');
  console.log('     GET   /api/v1/user/dashboard/:userId    → All dashboard stats\n');

  console.log('  🔍 INTELLIGENCE');
  console.log('     POST  /api/v1/intelligence/evaluate     → Manual city evaluation');
  console.log('     GET   /api/v1/intelligence/history/:city');
  console.log('     GET   /api/v1/intelligence/status/:city → Live city disruption status\n');

  console.log('  🚨 CLAIMS');
  console.log('     POST  /api/v1/claims/one-touch          → One-Touch Claim (demo centrepiece)\n');

  console.log('  💳 PREMIUM');
  console.log('     POST  /api/v1/premium/renew             → Manual weekly renewal');
  console.log('     GET   /api/v1/premium/policies/:userId');
  console.log('     GET   /api/v1/premium/estimate?city=\n');

  console.log('  💸 PAYOUTS');
  console.log('     GET   /api/v1/payouts/:userId           → Payout history\n');

  console.log('  🧪 DEMO BACKDOORS');
  console.log('     POST  /api/demo/force-trigger           → Force disruption evaluation');
  console.log('     POST  /api/demo/force-renewal           → Force weekly renewal');
  console.log('     POST  /api/demo/seed-heartbeat          → Seed FLAGGED/NORMAL heartbeat\n');

  console.log('  🏥 HEALTH');
  console.log('     GET   /health\n');

  console.log(border);
  console.log('⏱️  CRON SCHEDULE:');
  console.log('     Every 4 hours  → External Data Ingestion (weather + news)');
  console.log('     Daily 14:00    → Afternoon Disruption Check');
  console.log('     Daily 20:00    → Evening Disruption Check');
  console.log('     Saturday 23:55 → Weekly Premium Renewal');
  console.log(`${border}\n`);
});

// ============================================================
// Graceful Shutdown
// ============================================================
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received. Closing server gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed. Goodbye.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received. Closing server gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed. Goodbye.');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});
