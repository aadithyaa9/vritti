import { prisma } from '../../config/prisma.js';
export class PremiumService {
    BASE_PREMIUM = 150.0;
    LOYALTY_DISCOUNT = 0.1; // 10% loyalty discount
    /**
     * Process weekly premium renewals for all active users.
     * Calculates dynamic premiums based on risk multiplier and applies discount.
     * Uses atomic transactions for wallet deduction and policy creation.
     */
    async processWeeklyRenewals() {
        try {
            console.log('[PREMIUM SERVICE] Starting weekly policy renewals...');
            const users = await prisma.user.findMany({
                include: { wallet: true },
            });
            console.log(`[PREMIUM] Found ${users.length} users to process`);
            // Calculate the upcoming week (Sunday to Saturday)
            const nextSunday = this.getNextSunday();
            const nextSaturday = new Date(nextSunday);
            nextSaturday.setDate(nextSaturday.getDate() + 6);
            let successCount = 0;
            let failureCount = 0;
            let skipCount = 0;
            for (const user of users) {
                if (!user.wallet) {
                    console.warn(`[PREMIUM] User ${user.id} has no wallet. Skipping.`);
                    skipCount++;
                    continue;
                }
                try {
                    // Calculate dynamic premium based on risk location multiplier
                    const riskMultiplier = Math.random() * (1.8 - 1.0) + 1.0; // Random between 1.0 and 1.8
                    const premiumAfterRisk = this.BASE_PREMIUM * riskMultiplier;
                    const finalPremium = premiumAfterRisk * (1 - this.LOYALTY_DISCOUNT);
                    console.log(`[PREMIUM] User ${user.id}: Base=${this.BASE_PREMIUM}, Risk Multiplier=${riskMultiplier.toFixed(2)}, Loyalty Discount=${(this.LOYALTY_DISCOUNT * 100).toFixed(0)}%, Final=₹${finalPremium.toFixed(2)}`);
                    // Atomic transaction: Deduct premium + Create policy
                    await prisma.$transaction(async (tx) => {
                        // A. Deduct premium from wallet
                        const updatedWallet = await tx.wallet.update({
                            where: { userId: user.id },
                            data: {
                                balance: {
                                    decrement: finalPremium,
                                },
                            },
                        });
                        console.log(`[PREMIUM] Wallet charged: User ${user.id}, -₹${finalPremium.toFixed(2)}, Remaining: ₹${updatedWallet.balance}`);
                        // B. Create new policy record
                        const policy = await tx.policy.create({
                            data: {
                                userId: user.id,
                                weekStartDate: nextSunday,
                                weekEndDate: nextSaturday,
                                basePremium: this.BASE_PREMIUM,
                                wLocMultiplier: riskMultiplier,
                                loyaltyDiscount: this.LOYALTY_DISCOUNT,
                                finalPremiumPaid: finalPremium,
                                status: 'active',
                            },
                        });
                        console.log(`[PREMIUM SUCCESS] Policy created for User ${user.id}: ${nextSunday.toDateString()} - ${nextSaturday.toDateString()}, Policy ID: ${policy.id}`);
                    });
                    successCount++;
                }
                catch (txError) {
                    console.error(`[PREMIUM FAILED] Transaction failed for User ${user.id}:`, txError);
                    failureCount++;
                }
            }
            console.log(`[PREMIUM SUMMARY] Weekly Renewals Complete - Success: ${successCount}, Failed: ${failureCount}, Skipped: ${skipCount}`);
        }
        catch (error) {
            console.error('[PREMIUM SERVICE ERROR] Critical failure during weekly renewals:', error);
            throw error;
        }
    }
    /**
     * Calculate the next Sunday at 00:00
     */
    getNextSunday() {
        const now = new Date();
        const currentDay = now.getDay();
        const daysUntilSunday = (7 - currentDay) % 7 || 7; // If today is Sunday, next Sunday
        const nextSunday = new Date(now);
        nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
        nextSunday.setHours(0, 0, 0, 0);
        return nextSunday;
    }
    /**
     * Optional: Get active policies for a user
     */
    async getUserActivePolicies(userId) {
        const now = new Date();
        return await prisma.policy.findMany({
            where: {
                userId,
                status: 'active',
                weekEndDate: { gte: now },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * Optional: Calculate premium estimate for a user
     */
    calculatePremiumEstimate() {
        const riskMultiplier = 1.4; // Average risk multiplier
        const premiumAfterRisk = this.BASE_PREMIUM * riskMultiplier;
        const finalPremium = premiumAfterRisk * (1 - this.LOYALTY_DISCOUNT);
        return parseFloat(finalPremium.toFixed(2));
    }
}
//# sourceMappingURL=premium.service.js.map