import { prisma } from '../../config/prisma.js';

export class PremiumService {
  private readonly BASE_PREMIUM = 150.0;
  private readonly LOYALTY_DISCOUNT = 0.1; // 10% loyalty discount

  public async getTotalInvested(userId: string): Promise<number> {
    const result = await prisma.policy.aggregate({
      where: { userId },
      _sum: { finalPremiumPaid: true } 
    });
    return Number(result._sum.finalPremiumPaid || 0);
  }

  public async processWeeklyRenewals(): Promise<{ processed: number; success: boolean }> {
    try {
      console.log('[PREMIUM SERVICE] Starting weekly policy renewals...');
      const users = await prisma.user.findMany({
        include: { wallet: true },
      });
      
      let processed = 0;
      const nextSunday = this.getNextSunday();
      const nextSaturday = new Date(nextSunday);
      nextSaturday.setDate(nextSaturday.getDate() + 6);

      for (const user of users) {
        if (!user.wallet) continue;

        try {
          const riskMultiplier = Math.random() * (1.8 - 1.0) + 1.0;
          const premiumAfterRisk = this.BASE_PREMIUM * riskMultiplier;
          const finalPremium = premiumAfterRisk * (1 - this.LOYALTY_DISCOUNT);

          await prisma.$transaction(async (tx) => {
            await tx.wallet.update({
              where: { userId: user.id },
              data: { balance: { decrement: finalPremium as any } },
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
          processed++;
        } catch (txError) {
          console.error(`[PREMIUM FAILED] User ${user.id}:`, txError);
        }
      }
      return { processed, success: true };
    } catch (error) {
      console.error('[PREMIUM SERVICE ERROR]', error);
      throw error;
    }
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
    const riskMultiplier = 1.4;
    const finalPremium = (this.BASE_PREMIUM * riskMultiplier) * (1 - this.LOYALTY_DISCOUNT);
    return parseFloat(finalPremium.toFixed(2));
  }
}