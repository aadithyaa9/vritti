import { prisma } from '../../config/prisma.js';
export class PremiumService {
    async processWeeklyRenewals() {
        const users = await prisma.user.findMany({ include: { wallet: true } });
        for (const user of users) {
            if (!user.wallet)
                continue;
            try {
                // Mocking the call to Layer 3 (Python AI Brain) for the Hackathon
                // In reality: axios.post('http://ai-brain/calculate', { city: user.city })
                const BASE_PREMIUM = 150.00;
                const MOCK_W_LOC_MULTIPLIER = Math.random() * (1.8 - 1.0) + 1.0; // Random between 1.0 and 1.8
                const LOYALTY_DISCOUNT = 0.10;
                const finalPremium = (BASE_PREMIUM * MOCK_W_LOC_MULTIPLIER) * (1 - LOYALTY_DISCOUNT);
                const nextSunday = new Date();
                nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
                nextSunday.setHours(0, 0, 0, 0);
                const nextSaturday = new Date(nextSunday);
                nextSaturday.setDate(nextSaturday.getDate() + 6);
                await prisma.$transaction(async (tx) => {
                    // Deduct Wallet
                    await tx.wallet.update({
                        where: { userId: user.id },
                        data: { balance: { decrement: finalPremium } }
                    });
                    // Issue Policy
                    await tx.policy.create({
                        data: {
                            userId: user.id,
                            weekStartDate: nextSunday,
                            weekEndDate: nextSaturday,
                            basePremium: BASE_PREMIUM,
                            wLocMultiplier: MOCK_W_LOC_MULTIPLIER,
                            loyaltyDiscount: LOYALTY_DISCOUNT,
                            finalPremiumPaid: finalPremium,
                            status: 'active'
                        }
                    });
                });
                console.log(`[RENEWAL] Policy issued for User ${user.id} at ₹${finalPremium.toFixed(2)}`);
            }
            catch (error) {
                console.error(`[RENEWAL ERROR] User ${user.id} failed to renew.`);
            }
        }
    }
}
//# sourceMappingURL=premium.service.js.map