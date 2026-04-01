import { prisma } from '../../config/prisma.js';

export class PayoutService {
  private readonly DAILY_PAYOUT_AMOUNT = 500.0;

  public async executeEventPayouts(eventId: string, city: string): Promise<void> {
    const now = new Date();
    const affectedPolicies = await prisma.policy.findMany({
      where: {
        status: 'active',
        weekStartDate: { lte: now },
        weekEndDate: { gte: now },
        user: { city },
      },
      include: { user: { include: { wallet: true } } },
    });

    for (const policy of affectedPolicies) {
      if (!policy.user.wallet) continue;

      try {
        await prisma.$transaction(async (tx) => {
          // A. Credit Wallet
          const updatedWallet = await tx.wallet.update({
            where: { userId: policy.userId },
            data: { balance: { increment: this.DAILY_PAYOUT_AMOUNT as any } },
          });

          // B. 🆕 Update Profile (Income Bracket) after successful credit
          const totalBalance = Number(updatedWallet.balance);
          let newBracket = "5k - 10k";
          if (totalBalance > 15000) newBracket = "15k+ Premium";
          
          await tx.user.update({
            where: { id: policy.userId },
            data: { incomeBracket: newBracket }
          });

          // C. Record the Payout
          await tx.payout.create({
            data: {
              userId: policy.userId,
              eventId,
              amount: this.DAILY_PAYOUT_AMOUNT as any,
              status: 'success',
            },
          });
        });
        console.log(`[PAYOUT SUCCESS] Wallet & Bracket updated for ${policy.userId}`);
      } catch (error) {
        console.error(`[PAYOUT FAILED]`, error);
      }
    }
  }

  public async getTotalCredited(userId: string): Promise<number> {
    const result = await prisma.payout.aggregate({
      where: { userId, status: 'success' },
      _sum: { amount: true }
    });
    return Number(result._sum.amount || 0);
  }
}