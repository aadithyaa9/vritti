import 'dotenv/config';
import { prisma } from './config/prisma.js';

async function main() {
  console.log('🌱 Starting Universal Seed: Vritti Parametric Engine...');

  // 1. DATA CLEANUP
  console.log('🧹 Cleaning existing demo data...');
  try {
    await prisma.payout.deleteMany();
    await prisma.policy.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.weatherMetric.deleteMany();
    await prisma.newsSignal.deleteMany();
    await prisma.newsArticle.deleteMany();
    await prisma.disruptionCheck.deleteMany();
    // await prisma.crisisEvent.deleteMany(); // 🚨 Commented out because of your red squiggle
  } catch (err) {
    console.log('⚠️ Cleanup warning: Some tables were already empty.');
  }

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  // 2. CREATE USERS & WALLETS
  console.log('👤 Creating Test Users...');
  const usersData = [
    { name: "Rohan Das", phone: "9876543210", city: "Chennai", platform: "Swiggy" },
    { name: "Suresh Kumar", phone: "9876543211", city: "Chennai", platform: "Zomato" }
  ];

  const createdUsers = [];
  for (const u of usersData) {
    const user = await prisma.user.create({
      data: {
        name: u.name,
        phone: u.phone,
        city: u.city,
        platform: u.platform,
        incomeBracket: "5k-10k",
        wallet: { create: { balance: 1200.0 } }
      }
    });
    createdUsers.push(user);
    
    await prisma.activityLog.create({
      data: { userId: user.id, city: u.city, date: new Date(), earnings: 5.0 }
    });
  }

  // 3. CREATE POLICIES (Strictly matching your schema)
  console.log('📜 Activating Safety SIPs (Policies)...');
  for (const user of createdUsers) {
    await prisma.policy.create({
      data: {
        userId: user.id,
        // ❌ NO 'city' field here - it's in the User model
        status: "active",
        basePremium: 150.0,
        wLocMultiplier: 1.2,
        loyaltyDiscount: 10.0,
        //premiumAmount: 200.0,
        finalPremiumPaid: 200.0,
        //coverageAmount: 1500.0,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
      }
    });
  }

  // 4. ENVIRONMENTAL SIGNALS
  console.log('⛈️  Injecting Disruption Data...');
  await prisma.weatherMetric.create({
    data: {
      city: "Chennai", 
      recordedAt: new Date(),
      precipitationMm: 150.0, 
      isExtremeThreshold: true
    }
  });

  console.log('✅ SEED SUCCESSFUL');
}

main()
  .catch((e) => { console.error('❌ SEED FAILED:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });