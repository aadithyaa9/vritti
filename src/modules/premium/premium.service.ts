import { prisma } from '../../config/prisma.js';
import { PricingEngineService } from '../pricing/pricing.engine.service.js';

export class PremiumService {
  private readonly BASE_PREMIUM = 150.0;
  private readonly LOYALTY_DISCOUNT = 0.1;
  private pricingEngine: PricingEngineService;

  constructor() {
    this.pricingEngine = new PricingEngineService();
  }

  public async getTotalInvested(userId: string): Promise<number> {
    const result = await prisma.policy.aggregate({
      where: { userId },
      _sum: { finalPremiumPaid: true },
    });
    return Number(result._sum.finalPremiumPaid || 0);
  }

  // ----------------------------------------------------------
  // Weekly renewal — uses /predict/batch for efficiency
  // ----------------------------------------------------------
  public async processWeeklyRenewals(): Promise<{
    processed: number;
    success: boolean;
    engineUsed: boolean;
  }> {
    try {
      console.log('\n[PREMIUM SERVICE] ====================================');
      console.log('[PREMIUM SERVICE] Starting weekly policy renewals...');
      console.log('[PREMIUM SERVICE] ====================================\n');

      const users = await prisma.user.findMany({ include: { wallet: true } });

      let processed = 0;
      let engineUsed = false;
      const nextSunday = this.getNextSunday();
      const nextSaturday = new Date(nextSunday);
      nextSaturday.setDate(nextSaturday.getDate() + 6);

      // ── Check engine health once ───────────────────────────
      const health = await this.pricingEngine.checkHealth();
      const engineReady = health?.ready === true;

      if (engineReady) {
        console.log(
          `[PREMIUM SERVICE] ✅ Pricing engine ready (baseline_w_risk=${health!.baseline_w_risk})`
        );
      } else {
        console.warn(
          '[PREMIUM SERVICE] ⚠️  Pricing engine unavailable — using fallback formula'
        );
      }

      // ── Group users by city for batch pricing ──────────────
      const usersByCity = new Map<string, typeof users>();
      for (const user of users) {
        if (!user.wallet) continue;
        const city = user.city ?? 'Chennai';
        if (!usersByCity.has(city)) usersByCity.set(city, []);
        usersByCity.get(city)!.push(user);
      }

      // ── Process each city as a single batch call ───────────
      for (const [city, cityUsers] of usersByCity.entries()) {
        console.log(
          `\n[PREMIUM SERVICE] Processing ${cityUsers.length} users in ${city}...`
        );

        let premiumMap = new Map<
          string,
          { finalPremium: number; wRiskScore: number; rAlertMultiplier: number }
        >();

        if (engineReady) {
          premiumMap = await this.pricingEngine.getDynamicPremiumsBatch(
            cityUsers.map((u) => u.id),
            city
          );
          engineUsed = true;
        } else {
          // Local fallback formula
          for (const user of cityUsers) {
            const riskMultiplier = Math.random() * (1.8 - 1.0) + 1.0;
            const premium =
              this.BASE_PREMIUM * riskMultiplier * (1 - this.LOYALTY_DISCOUNT);
            premiumMap.set(user.id, {
              finalPremium: parseFloat(premium.toFixed(2)),
              wRiskScore: 0.83,
              rAlertMultiplier: 1.0,
            });
          }
        }

        // ── Persist policies ───────────────────────────────────
        for (const user of cityUsers) {
          const pricing = premiumMap.get(user.id) ?? {
            finalPremium: this.BASE_PREMIUM,
            wRiskScore: 0.83,
            rAlertMultiplier: 1.0,
          };

          try {
            await prisma.$transaction(async (tx) => {
              await tx.wallet.update({
                where: { userId: user.id },
                data: { balance: { decrement: pricing.finalPremium as any } },
              });

              await tx.policy.create({
                data: {
                  userId: user.id,
                  weekStartDate: nextSunday,
                  weekEndDate: nextSaturday,
                  basePremium: this.BASE_PREMIUM as any,
                  wLocMultiplier: pricing.wRiskScore as any,
                  loyaltyDiscount: this.LOYALTY_DISCOUNT as any,
                  finalPremiumPaid: pricing.finalPremium as any,
                  status: 'active',
                },
              });
            });

            console.log(
              `[PREMIUM SERVICE] ✅ ${user.name ?? user.id} → ₹${pricing.finalPremium} ` +
                `(w_risk=${pricing.wRiskScore.toFixed(3)}, r_alert×${pricing.rAlertMultiplier})`
            );
            processed++;
          } catch (txError) {
            console.error(`[PREMIUM SERVICE] ❌ Failed for ${user.id}:`, txError);
          }
        }
      }

      console.log(
        `\n[PREMIUM SERVICE] ✅ Renewal complete — ${processed} policies | engine=${engineUsed}\n`
      );
      return { processed, success: true, engineUsed };
    } catch (error) {
      console.error('[PREMIUM SERVICE ERROR]', error);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Personalised estimate for a single user via ML engine
  // ----------------------------------------------------------
  public async calculatePremiumEstimateForUser(
    userId: string,
    city: string
  ): Promise<{
    basePremium: number;
    estimatedFinalPremium: number;
    wRiskScore: number;
    rAlertMultiplier: number;
    source: 'engine' | 'fallback';
    currency: string;
    city: string;
  }> {
    const result = await this.pricingEngine.getDynamicPremium(userId, city);
    return {
      basePremium: this.BASE_PREMIUM,
      estimatedFinalPremium: result.finalPremium,
      wRiskScore: result.wRiskScore,
      rAlertMultiplier: result.rAlertMultiplier,
      source: result.source,
      currency: 'INR',
      city,
    };
  }

  // Static fallback estimate (no userId provided)
  public calculatePremiumEstimate(_city?: string): number {
    return parseFloat(
      (this.BASE_PREMIUM * 1.4 * (1 - this.LOYALTY_DISCOUNT)).toFixed(2)
    );
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
}