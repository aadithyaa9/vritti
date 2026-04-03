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

  // Inside PayoutService class, add this method:

  public async executeSingleUserPayout(userId: string, amount: number, triggerSource: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
      if (!user || !user.wallet) return false;

      // Create a specific event record for this isolated claim
      const event = await prisma.event.create({
        data: {
          city: user.city || 'Unknown',
          type: 'one_touch_claim',
          status: 'resolved',
          triggeredBy: triggerSource,
          startTime: new Date()
        }
      });

      await prisma.$transaction(async (tx) => {
        // A. Credit Wallet
        const updatedWallet = await tx.wallet.update({
          where: { userId: user.id },
          data: { balance: { increment: amount as any } },
        });

        // B. Update Profile Bracket
        const totalBalance = Number(updatedWallet.balance);
        let newBracket = "5k - 10k";
        if (totalBalance > 15000) newBracket = "15k+ Premium";
        
        await tx.user.update({
          where: { id: user.id },
          data: { incomeBracket: newBracket }
        });

        // C. Record Payout
        await tx.payout.create({
          data: {
            userId: user.id,
            eventId: event.id,
            amount: amount as any,
            status: 'success',
          },
        });
      });
      console.log(`[PAYOUT SUCCESS] One-Touch payout of ₹${amount} credited for ${userId}`);
      return true;
    } catch (error) {
      console.error(`[PAYOUT FAILED] One-Touch failed for ${userId}`, error);
      return false;
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