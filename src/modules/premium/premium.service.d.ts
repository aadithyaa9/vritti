import { prisma } from '../../config/prisma.js';

export class PremiumService {
  private readonly BASE_PREMIUM = 150.0;
  private readonly LOYALTY_DISCOUNT = 0.1; // 10%

  /**
   * Total premiums paid by a user = their "money invested" shown in the app
   */
  public async getTotalInvested(userId: string): Promise<number> {
    const result = await prisma.policy.aggregate({
      where: { userId },
      _sum: { finalPremiumPaid: true },
    });
    return Number(result._sum.finalPremiumPaid ?? 0);
  }

  /**
   * Weekly renewal: deducts premium and issues next week's policy for all users.
   * Runs every Saturday at 23:55 via cron.
   */
  public async processWeeklyRenewals(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    console.log('\n[PREMIUM SERVICE] ============================================');
    console.log('[PREMIUM SERVICE] Starting weekly policy renewals...');
    console.log('[PREMIUM SERVICE] ============================================\n');

    const users = await prisma.user.findMany({
      include: { wallet: true },
    });

    const nextSunday = this.getNextSunday();
    const nextSaturday = new Date(nextSunday);
    nextSaturday.setDate(nextSaturday.getDate() + 6);

    let succeeded = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.wallet) {
        console.log(`[PREMIUM] Skipping ${user.id} — no wallet`);
        continue;
      }

      try {
        // Risk multiplier based on city (mock — in production this calls the Python AI Brain)
        const riskMultiplier = this.getCityRiskMultiplier(user.city);
        const premiumAfterRisk = this.BASE_PREMIUM * riskMultiplier;
        const finalPremium = premiumAfterRisk * (1 - this.LOYALTY_DISCOUNT);

        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { userId: user.id },
            data: { balance: { decrement: finalPremium as any } },
          });

          // Mark any existing active policies for this period as expired
          await tx.policy.updateMany({
            where: {
              userId: user.id,
              status: 'active',
              weekEndDate: { lte: nextSunday },
            },
            data: { status: 'expired' },
          });

          await tx.policy.create({
            data: {
              userId: user.id,
              weekStartDate: nextSunday,
              weekEndDate: nextSaturday,
              basePremium: this.BASE_PREMIUM as any,
              wLocMultiplier: riskMultiplier as any,
              loyaltyDiscount: this.LOYALTY_DISCOUNT as any,
              finalPremiumPaid: finalPremium as any,
              status: 'active',
            },
          });
        });

        succeeded++;
        console.log(
          `[PREMIUM] ✅ Policy issued for ${user.name ?? user.id} at ₹${finalPremium.toFixed(2)} (risk: ${riskMultiplier.toFixed(2)}x)`
        );
      } catch (txError) {
        failed++;
        console.error(`[PREMIUM FAILED] User ${user.id}:`, txError);
      }
    }

    console.log(
      `\n[PREMIUM SUMMARY] ${succeeded} succeeded, ${failed} failed out of ${users.length} users\n`
    );

    return { processed: users.length, succeeded, failed };
  }

  private getCityRiskMultiplier(city: string | null): number {
    // In production, this would call the Python AI Brain
    // For demo, we use city-based static multipliers
    const cityRisks: Record<string, number> = {
      Chennai: 1.4,
      Mumbai: 1.6,
      Bangalore: 1.2,
      Delhi: 1.5,
      Hyderabad: 1.3,
    };
    return city && cityRisks[city] ? cityRisks[city]! : 1.0 + Math.random() * 0.8;
  }

  private getNextSunday(): Date {
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday;
  }

  public async getUserActivePolicies(userId: string): Promise<any[]> {
    const now = new Date();
    return await prisma.policy.findMany({
      where: { userId, status: 'active', weekEndDate: { gte: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  public calculatePremiumEstimate(city?: string): number {
    const riskMultiplier = this.getCityRiskMultiplier(city ?? 'Chennai');
    const finalPremium = this.BASE_PREMIUM * riskMultiplier * (1 - this.LOYALTY_DISCOUNT);
    return parseFloat(finalPremium.toFixed(2));
  }
}
