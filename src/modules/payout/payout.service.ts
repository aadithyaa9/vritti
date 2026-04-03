import { prisma } from '../../config/prisma.js';

export class PayoutService {

  public async executeSingleUserPayout(userId: string, amount: number, triggerSource: string): Promise<{ success: boolean, newBalance: number }> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
      if (!user || !user.wallet) return { success: false, newBalance: 0 };

      const event = await prisma.event.create({
        data: {
          city: user.city || 'Unknown', type: 'one_touch_claim',
          status: 'resolved', triggeredBy: triggerSource, startTime: new Date()
        }
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
          where: { id: user.id }, data: { incomeBracket: newBracket }
        });

        await tx.payout.create({
          data: { userId: user.id, eventId: event.id, amount: amount as any, status: 'success' },
        });

        return updatedWallet;
      });

      return { success: true, newBalance: Number(finalWallet.balance) };
    } catch (error) {
      console.error(`[PAYOUT FAILED]`, error);
      return { success: false, newBalance: 0 };
    }
  }
}