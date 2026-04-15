import { prisma } from "../../config/prisma.js";

export class PayoutService {
  private readonly DAILY_PAYOUT_AMOUNT = 500.0;

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

  // FAST INTERNAL GATEWAY FOR DEMO
  public async executeSingleUserPayout(
    userId: string,
    amount: number,
    triggerSource: string,
  ): Promise<{
    success: boolean;
    newBalance?: number;
    transactionId?: string;
    gatewayStatus?: string;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true },
      });
      if (!user || !user.wallet) return { success: false };

      console.log(`[GATEWAY] Processing internal transfer...`);
      await new Promise((resolve) => setTimeout(resolve, 800)); // Brief realistic delay

      const bankRef = Math.floor(
        100000000000 + Math.random() * 900000000000,
      ).toString();
      const transactionId = `UPI_${bankRef}`;

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
        `[PAYOUT SUCCESS] ₹${amount} credited for ${userId} (Txn: ${transactionId})`,
      );

      return {
        success: true,
        newBalance: Number(finalWallet.balance),
        transactionId,
        gatewayStatus: "COMPLETED",
      };
    } catch (error) {
      console.error(`[PAYOUT FAILED] One-Touch failed for ${userId}`, error);
      return { success: false };
    }
  }
}
