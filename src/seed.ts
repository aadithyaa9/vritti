import 'dotenv/config';
import { prisma } from './config/prisma.js';

async function main() {
  console.log('\n🌱 ====================================================');
  console.log('   Vritti Demo Seed — Parametric Micro-Insurance');
  console.log('====================================================\n');

  // ============================================================
  // 1. CLEANUP
  // ============================================================
  console.log('🧹 Cleaning existing demo data...');
  try {
    await prisma.notification.deleteMany();
    await prisma.payout.deleteMany();
    await prisma.heartbeat.deleteMany();
    await prisma.policy.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.newsSignal.deleteMany();
    await prisma.newsArticle.deleteMany();
    await prisma.weatherMetric.deleteMany();
    await prisma.disruptionCheck.deleteMany();
    await prisma.event.deleteMany();
    console.log('   ✅ Cleanup complete\n');
  } catch (err) {
    console.log('   ⚠️  Cleanup warning.\n');
  }

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  // ============================================================
  // 2. CREATE DEMO USERS
  // ============================================================
  console.log('👤 Creating Demo Users...');

  const usersData = [
    {
      name: 'Rohan Das',
      phone: '9876543210',
      city: 'Chennai',
      platform: 'Swiggy',
      incomeBracket: '5k - 10k',
      balance: 12500.0,
    },
    {
      name: 'Suresh Kumar',
      phone: '9876543211',
      city: 'Chennai',
      platform: 'Zomato',
      incomeBracket: '5k - 10k',
      balance: 850.0,
    },
  ];

  const createdUsers = [];

  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        phone: u.phone,
        city: u.city,
        platform: u.platform,
        incomeBracket: u.incomeBracket,
        isDeviceSecure: true,
        lat: 13.0827,
        lng: 80.2707,
        wallet: { create: { balance: u.balance } },
        notifications: {
          create: {
            title: 'Welcome to Vritti!',
            message: 'Your Safety SIP is active. You are now protected against zonal disruptions.',
            type: 'SUCCESS'
          }
        }
      },
    });
    createdUsers.push(user);
    console.log(`   ✅ ${u.name} (${u.phone}) — Wallet: ₹${u.balance}`);
  }

  // ============================================================
  // 3. CREATE ACTIVE POLICIES
  // ============================================================
  console.log('\n📜 Activating Safety SIP Policies...');

  for (const user of createdUsers) {
    await prisma.policy.create({
      data: {
        userId: user.id,
        status: 'active',
        basePremium: 150.0,
        wLocMultiplier: 1.2,
        loyaltyDiscount: 10.0,
        finalPremiumPaid: 162.0,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
      },
    });
    console.log(`   ✅ Active policy for ${user.name}`);
  }

  // ============================================================
  // 4. ACTIVITY LOGS
  // ============================================================
  console.log('\n📊 Seeding Activity Logs...');

  for (const user of createdUsers) {
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        city: user.city ?? 'Chennai',
        date: today,
        ordersCompleted: 5,
        earnings: 150.0,
      },
    });
  }

  // ============================================================
  // 5. WEATHER & NEWS
  // ============================================================
  console.log('\n⛈️  Seeding Weather & News...');

  await prisma.weatherMetric.create({
    data: {
      city: 'Chennai',
      recordedAt: new Date(),
      precipitationMm: 165.0,
      temperatureCelsius: 26.5,
      isExtremeThreshold: true,
    },
  });

  await prisma.newsArticle.create({
    data: {
      city: 'Chennai',
      title: 'Heavy flooding paralyses Chennai — arterial roads blocked',
      source: 'The Hindu',
      signals: {
        create: {
          city: 'Chennai',
          isStrongMatch: true,
          matchedKeywords: ['flood', 'disruption'],
        }
      }
    },
  });

  // ============================================================
  // 6. HEARTBEATS — Enhanced Telemetry
  // ============================================================
  console.log('\n💓 Seeding Enhanced Telemetry (Heartbeats)...');

  const rohan = createdUsers[0]!;
  const suresh = createdUsers[1]!;

  // Rohan: VERIFIED heartbeats (SUCCESS Case)
  for (let i = 0; i < 5; i++) {
    await prisma.heartbeat.create({
      data: {
        userId: rohan.id,
        lat: 13.0827,
        lng: 80.2707,
        status: 'VERIFIED',
        speed: 35.0 + Math.random() * 10,
        maeScore: 0.05 + Math.random() * 0.1,
        sensors: { ax: 0.1, ay: 0.2, az: 9.8, gx: 0.01, gy: 0.02, gz: 0.03 },
        createdAt: new Date(Date.now() - i * 15 * 1000), // Every 15s in last minute
      },
    });
  }

  // Suresh: FLAGGED heartbeats (FRAUD Case)
  await prisma.heartbeat.create({
    data: {
      userId: suresh.id,
      lat: 13.0827,
      lng: 80.2707,
      status: 'FLAGGED',
      speed: 120.0, // Unrealistic speed
      maeScore: 0.95, // High anomaly
      sensors: { ax: 5.5, ay: 8.2, az: 15.8 },
      createdAt: new Date(),
    },
  });

  console.log(`   ✅ ${rohan.name} → 5x VERIFIED heartbeats (Success case)`);
  console.log(`   ✅ ${suresh.name} → 1x FLAGGED heartbeat (Fraud case)`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n====================================================');
  console.log('✅ SEED COMPLETE — Demo is ready!');
  console.log('====================================================\n');
  console.log(`🎯 SUCCESS CASE: ${rohan.name} (${rohan.id})`);
  console.log(`🚫 FRAUD CASE:   ${suresh.name} (${suresh.id})`);
  console.log(`\n💡 Run this to test Rohan's claim:`);
  console.log(`   curl -X POST http://localhost:3000/api/v1/claims/trigger -H "Content-Type: application/json" -d '{"userId": "${rohan.id}", "lat": 13.0827, "lng": 80.2707}'`);
}

main()
  .catch((e) => {
    console.error('\n❌ SEED FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
