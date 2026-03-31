import { prisma } from '../../config/prisma.js';
export class PayoutService {
    async executeEventPayouts(eventId, city) {
        const now = new Date();
        // 1. Find all active policies in the affected city
        const activePolicies = await prisma.policy.findMany({
            where: {
                status: 'active',
                weekStartDate: { lte: now },
                weekEndDate: { gte: now },
                user: { city }
            },
            include: { user: { include: { wallet: true } } }
        });
        const DAILY_PAYOUT_AMOUNT = 500.00; // Simulated median daily wage
        // 2. Execute payouts transactionally
        for (const policy of activePolicies) {
            if (!policy.user.wallet)
                continue;
            try {
                await prisma.$transaction(async (tx) => {
                    // A. Credit the user's wallet
                    await tx.wallet.update({
                        where: { userId: policy.userId },
                        data: { balance: { increment: DAILY_PAYOUT_AMOUNT } }
                    });
                    // B. Record the payout ledger entry
                    await tx.payout.create({
                        data: {
                            userId: policy.userId,
                            eventId: eventId,
                            amount: DAILY_PAYOUT_AMOUNT,
                            status: 'success'
                        }
                    });
                });
                console.log(`[PAYOUT SUCCESS] Deposited ₹${DAILY_PAYOUT_AMOUNT} to User ${policy.userId}`);
            }
            catch (error) {
                console.error(`[PAYOUT FAILED] User ${policy.userId}`, error);
            }
        }
    }
}
//# sourceMappingURL=payout.service.js.map