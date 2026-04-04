import { prisma } from "../config/prisma.js";

export async function validateAndProcessClaim(userId: string) {
  // 1. Check active policy
  const policy = await prisma.policy.findFirst({
    where: { userId, status: "ACTIVE" }
  });

  if (!policy) {
    throw new Error("No active policy");
  }

  // 2. Check if already claimed this week
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const existingClaim = await prisma.payout.findFirst({
    where: {
      userId,
      createdAt: { gte: startOfWeek }
    }
  });

  if (existingClaim) {
    throw new Error("Already received payout for this week");
  }

  // 3. Check if flagged by edge engine
  if (policy.status !== "FLAGGED") {
    throw new Error("Policy not eligible for claim");
  }

  // 4. Transaction: payout
  return await prisma.$transaction(async (tx: any) => {
    const payoutAmount = 500;

    await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: payoutAmount } }
    });

    await tx.payout.create({
      data: {
        userId,
        amount: payoutAmount,
        eventId: '00000000-0000-0000-0000-000000000000', // Mock event ID for legacy compatibility
        status: 'SUCCESS'
      }
    });

    await tx.policy.update({
      where: { id: policy.id },
      data: { status: "CLAIMED_THIS_WEEK" }
    });

    return { success: true, amount: payoutAmount };
  });
}
