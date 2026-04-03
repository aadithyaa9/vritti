import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {
  
  public async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;
    
    if (!phone) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60000);

    try {
      await prisma.user.upsert({
        where: { phone },
        update: { otpCode, otpExpiresAt },
        create: { phone, otpCode, otpExpiresAt }
      });

      console.log(`[DEV MODE] Generated OTP for ${phone} is: ${otpCode}`);

      res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: "Failed to process OTP request" });
    }
  }

  public async verifyOtp(req: Request, res: Response): Promise<void> {
    const { phone, otp, name, platform, city } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user || user.otpCode !== String(otp) || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        res.status(401).json({ error: "Invalid or expired OTP" });
        return;
      }

      const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

      const finalUser = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { 
            name: name || user.name, 
            platform: platform || user.platform, 
            city: city || user.city,
            otpCode: null, 
            otpExpiresAt: null 
          }
        });

        if (!existingWallet) {
          await tx.wallet.create({ data: { userId: updatedUser.id, balance: 0.0 } });
          
          const today = new Date();
          const nextWeek = new Date(today);
          nextWeek.setDate(today.getDate() + 7);

          await tx.policy.create({
            data: {
              userId: updatedUser.id, 
              status: 'active',
              basePremium: 150.0, 
              wLocMultiplier: 1.0,
              loyaltyDiscount: 0.0, 
              finalPremiumPaid: 150.0,
              weekStartDate: today, 
              weekEndDate: nextWeek,
            }
          });
          console.log(`[AUTH] Created new wallet and policy for ${phone}`);
        }
        
        return updatedUser;
      });

      res.status(200).json({ message: "Authentication successful", user: finalUser });
    } catch (error) {
      console.error('[AUTH VERIFY ERROR]', error);
      res.status(500).json({ error: "Verification failed" });
    }
  }
}