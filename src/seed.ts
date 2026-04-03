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
    console.log('   ⚠️  Cleanup warning (some tables may have been empty).\n');
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
      balance: 1200.0,
    },
    {
      name: 'Suresh Kumar',
      phone: '9876543211',
      city: 'Chennai',
      platform: 'Zomato',
      incomeBracket: '5k - 10k',
      balance: 850.0,
    },
    {
      name: 'Priya Nair',
      phone: '9876543212',
      city: 'Chennai',
      platform: 'Swiggy',
      incomeBracket: '5k - 10k',
      balance: 2100.0,
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
        isDeviceSecure: true, // Consent given
        lat: 13.0827,
        lng: 80.2707,
        wallet: { create: { balance: u.balance } },
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
        finalPremiumPaid: 162.0, // 150 * 1.2 * 0.9
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
      },
    });
    console.log(`   ✅ Active policy for ${user.name} (valid until ${weekEnd.toLocaleDateString()})`);
  }

  // ============================================================
  // 4. ACTIVITY LOGS (for disruption check baseline)
  // ============================================================
  console.log('\n📊 Seeding Activity Logs...');

  for (const user of createdUsers) {
    // Very low orders today → simulates disruption conditions
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        city: user.city ?? 'Chennai',
        date: today,
        ordersCompleted: 5, // Way below 1000 baseline → 99.5% drop
        earnings: 150.0,
      },
    });
  }
  console.log(`   ✅ Low activity logs seeded (5 orders vs 1000 baseline → 99.5% drop)`);

  // ============================================================
  // 5. WEATHER SIGNALS — Extreme Conditions
  // ============================================================
  console.log('\n⛈️  Seeding Weather Signals...');

  await prisma.weatherMetric.create({
    data: {
      city: 'Chennai',
      recordedAt: new Date(),
      precipitationMm: 165.0,
      temperatureCelsius: 26.5,
      aqiLevel: 287,
      windGustKmh: 55.0,
      isExtremeThreshold: true,
    },
  });
  console.log(`   ✅ Extreme weather: 165mm precipitation, AQI 287, 55km/h wind`);

  // ============================================================
  // 6. NEWS SIGNALS
  // ============================================================
  console.log('\n📰 Seeding News Signals...');

  const articles = [
    {
      title: 'Heavy flooding paralyses Chennai — arterial roads blocked',
      summary: 'Record rainfall in Chennai has led to widespread flooding. Multiple delivery platforms report 80% order drop.',
      source: 'The Hindu',
    },
    {
      title: 'Chennai gig workers stranded as Adyar and Kotturpuram flood',
      summary: 'Thousands of delivery riders unable to operate. Civic authorities declare orange alert.',
      source: 'NDTV',
    },
    {
      title: 'IMD issues red alert for Chennai and surrounding districts',
      summary: 'India Meteorological Department warns of extremely heavy rain for the next 48 hours.',
      source: 'Reuters',
    },
  ];

  for (const a of articles) {
    const article = await prisma.newsArticle.create({
      data: {
        city: 'Chennai',
        title: a.title,
        summary: a.summary,
        source: a.source,
        url: `https://news.example.com/${Date.now()}`,
        publishedAt: new Date(),
        fetchedAt: new Date(),
      },
    });

    await prisma.newsSignal.create({
      data: {
        articleId: article.id,
        city: 'Chennai',
        isStrongMatch: true,
        matchedKeywords: ['flood', 'disruption', 'alert', 'warning'],
      },
    });

    console.log(`   ✅ "${a.title.slice(0, 60)}..."`);
  }

  // ============================================================
  // 7. HEARTBEATS — FLAGGED for the primary demo user
  // ============================================================
  console.log('\n💓 Seeding Edge Engine Heartbeats...');

  const primaryUser = createdUsers[0]!;

  // Seed several FLAGGED heartbeats in the last 10 minutes (demo-ready)
  for (let i = 0; i < 3; i++) {
    await prisma.heartbeat.create({
      data: {
        userId: primaryUser.id,
        lat: 13.0827 + (Math.random() - 0.5) * 0.01,
        lng: 80.2707 + (Math.random() - 0.5) * 0.01,
        status: 'FLAGGED',
        createdAt: new Date(Date.now() - (i + 1) * 3 * 60 * 1000), // 3, 6, 9 minutes ago
      },
    });
  }

  // Seed NORMAL heartbeats for other users
  for (const user of createdUsers.slice(1)) {
    await prisma.heartbeat.create({
      data: {
        userId: user.id,
        lat: 13.0827,
        lng: 80.2707,
        status: 'NORMAL',
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });
  }

  console.log(`   ✅ FLAGGED heartbeats (3x, last 9 mins) for ${primaryUser.name}`);
  console.log(`   ✅ NORMAL heartbeats for other users`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n====================================================');
  console.log('✅ SEED COMPLETE — Demo is ready!');
  console.log('====================================================\n');

  console.log('📋 Demo State Summary:');
  console.log(`   Users     : ${createdUsers.length} (all in Chennai)`);
  console.log(`   Policies  : ${createdUsers.length} active Safety SIPs`);
  console.log(`   Weather   : EXTREME (165mm precipitation, isExtremeThreshold=true)`);
  console.log(`   News      : 3 strong-match signals`);
  console.log(`   Activity  : 5 orders (99.5% drop from 1000 baseline)`);
  console.log(`   Heartbeat : ${primaryUser.name} → FLAGGED (3 times, last 9 mins)`);
  console.log(`\n🎯 One-Touch Claim will SUCCEED for ${primaryUser.name}`);
  console.log(`   userId: ${primaryUser.id}`);
  console.log(`   phone:  ${primaryUser.phone}`);
  console.log(`\n💡 To demo the claim flow:`);
  console.log(`   POST /api/v1/claims/one-touch`);
  console.log(`   { "userId": "${primaryUser.id}", "lat": 13.0827, "lng": 80.2707 }\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ SEED FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
