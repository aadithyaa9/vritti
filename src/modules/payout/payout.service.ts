import { prisma } from "../../config/prisma.js";

export class PayoutService {
  private readonly DAILY_PAYOUT_AMOUNT = 500.0;

  // Added this method to bridge the gap with DisruptionService
  public async processPayout(userId: string, amount: number): Promise<void> {
    await this.executeSingleUserPayout(
      userId,
      amount,
      "parametric_disruption_claim",
    );
  }

  public async executeEventPayouts(
    eventId: string,
    city: string,
  ): Promise<void> {
    const now = new Date();
    const affectedPolicies = await prisma.policy.findMany({
      where: {
        status: "active",
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
          const updatedWallet = await tx.wallet.update({
            where: { userId: policy.userId },
            data: { balance: { increment: this.DAILY_PAYOUT_AMOUNT as any } },
          });

          const totalBalance = Number(updatedWallet.balance);
          let newBracket = "5k - 10k";
          if (totalBalance > 15000) newBracket = "15k+ Premium";

          await tx.user.update({
            where: { id: policy.userId },
            data: { incomeBracket: newBracket },
          });

          await tx.payout.create({
            data: {
              userId: policy.userId,
              eventId,
              amount: this.DAILY_PAYOUT_AMOUNT as any,
              status: "success",
            },
          });
        });
        console.log(
          `[PAYOUT SUCCESS] Wallet & Bracket updated for ${policy.userId}`,
        );
      } catch (error) {
        console.error(`[PAYOUT FAILED]`, error);
      }
    }
  }

  public async executeSingleUserPayout(
    userId: string,
    amount: number,
    triggerSource: string,
  ): Promise<{ success: boolean; newBalance?: number }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
      });
      if (!user || !user.wallet) return { success: false };

      const event = await prisma.event.create({
        data: {
          city: user.city || "Unknown",
          type: "one_touch_claim",
          status: "resolved",
          triggeredBy: triggerSource,
          startTime: new Date(),
        },
      });

      const finalWallet = await prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.wallet.update({
          where: { userId: user.id },
          data: { balance: { increment: amount as any } },
        });

        const totalBalance = Number(updatedWallet.balance);
        let newBracket = "5k - 10k";
        if (totalBalance > 15000) newBracket = "15k+ Premium";

        await tx.user.update({
          where: { id: user.id },
          data: { incomeBracket: newBracket },
        });

        await tx.payout.create({
          data: {
            userId: user.id,
            eventId: event.id,
            amount: amount as any,
            status: "success",
          },
        });

        return updatedWallet;
      });
      console.log(
        `[PAYOUT SUCCESS] One-Touch payout of ₹${amount} credited for ${userId}`,
      );
      return { success: true, newBalance: Number(finalWallet.balance) };
    } catch (error) {
      console.error(`[PAYOUT FAILED] One-Touch failed for ${userId}`, error);
      return { success: false };
    }
  }

  public async getTotalCredited(userId: string): Promise<number> {
    const result = await prisma.payout.aggregate({
      where: { userId, status: "success" },
      _sum: { amount: true },
    });
    return Number(result._sum.amount || 0);
  }

  public async getPayoutHistory(userId: string, limit: number): Promise<any[]> {
    return await prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}