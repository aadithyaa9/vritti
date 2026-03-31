import { prisma } from '../../config/prisma.js';

export class PayoutService {
  private readonly DAILY_PAYOUT_AMOUNT = 500.0; // Rs. 500 daily income replacement

  /**
   * Execute atomic payouts for all affected users in a city.
   * Finds all active policies for the event period and pays out simultaneously.
   * Uses prisma.$transaction for financial safety.
   */
  public async executeEventPayouts(eventId: string, city: string): Promise<void> {
    try {
      console.log(`[PAYOUT SERVICE] Starting payout execution for Event: ${eventId}, City: ${city}`);

      const now = new Date();

      // 1. Find all active policies in the affected city for this week
      const affectedPolicies = await prisma.policy.findMany({
        where: {
          status: 'active',
          weekStartDate: { lte: now },
          weekEndDate: { gte: now },
          user: { city },
        },
        include: {
          user: {
            include: { wallet: true },
          },
        },
      });

      console.log(`[PAYOUT] Found ${affectedPolicies.length} affected policy holders in ${city}`);

      if (affectedPolicies.length === 0) {
        console.log(`[PAYOUT] No active policies found for ${city}. Skipping payouts.`);
        return;
      }

      // 2. Execute payouts atomically per policy holder
      let successCount = 0;
      let failureCount = 0;

      for (const policy of affectedPolicies) {
        if (!policy.user.wallet) {
          console.warn(`[PAYOUT] User ${policy.userId} has no wallet. Skipping.`);
          failureCount++;
          continue;
        }

        try {
          // Atomic transaction: Increment wallet + Create payout record
          await prisma.$transaction(async (tx) => {
            // A. Increment wallet balance (CREDIT)
            const updatedWallet = await tx.wallet.update({
              where: { userId: policy.userId },
              data: {
                balance: {
                  increment: this.DAILY_PAYOUT_AMOUNT as unknown as any,
                },
              },
            });

            console.log(
              `[PAYOUT] Wallet updated for User ${policy.userId}: +${this.DAILY_PAYOUT_AMOUNT}, New Balance: ${updatedWallet.balance}`
            );

            // B. Record the payout ledger entry (IMMUTABLE)
            const payoutRecord = await tx.payout.create({
              data: {
                userId: policy.userId,
                eventId,
                amount: this.DAILY_PAYOUT_AMOUNT as any,
                status: 'success',
              },
            });

            console.log(
              `[PAYOUT SUCCESS] Payout recorded: User ${policy.userId} received ₹${this.DAILY_PAYOUT_AMOUNT}. Payout ID: ${payoutRecord.id}`
            );
          });

          successCount++;
        } catch (txError) {
          console.error(`[PAYOUT FAILED] Transaction failed for User ${policy.userId}:`, txError);
          failureCount++;

          // Record failed payout for auditing
          try {
            await prisma.payout.create({
              data: {
                userId: policy.userId,
                eventId,
                amount: this.DAILY_PAYOUT_AMOUNT as any,
                status: 'failed',
              },
            });
          } catch (auditError) {
            console.error(`[PAYOUT AUDIT ERROR] Could not record failed payout:`, auditError);
          }
        }
      }

      console.log(
        `[PAYOUT SUMMARY] Event: ${eventId}, City: ${city}, Success: ${successCount}/${affectedPolicies.length}, Failed: ${failureCount}`
      );
    } catch (error) {
      console.error(`[PAYOUT SERVICE ERROR] Critical failure during payout execution:`, error);
      throw error;
    }
  }

  /**
   * Optional: Get payout history for a user
   */
  public async getUserPayoutHistory(userId: string): Promise<any[]> {
    return await prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Optional: Get aggregate payout stats for an event
   */
  public async getEventPayoutStats(eventId: string): Promise<any> {
    const stats = await prisma.payout.aggregate({
      where: { eventId },
      _sum: { amount: true },
      _count: true,
    });

    return {
      eventId,
      totalPayouts: stats._count,
      totalAmount: stats._sum.amount || 0,
    };
  }
}