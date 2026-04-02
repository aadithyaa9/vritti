import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {
  
  // 1. Request OTP (For both Login and Registration)
  public async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    // Generate a 6-digit OTP (Static '123456' for testing, replac
    // Generates a random 6-digit number between 100000 and 999999
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

// Optional: Log it to the console so you know what it is for testing!
    console.log(`[DEV MODE] Generated OTP for ${phone} is: ${otpCode}`);
    const otpExpiresAt = new Date(Date.now() + 10 * 60000); // Expires in 10 mins

    try {
      await prisma.user.upsert({
        where: { phone },
        update: { otpCode, otpExpiresAt },
        create: { 
          phone, 
          otpCode, 
          otpExpiresAt 
        }
      });

      // TODO: Integrate SMS gateway (Twilio/AWS SNS) here to send `otpCode` to `phone`
      console.log(`[AUTH] OTP for ${phone} is ${otpCode}`);

      res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: "Failed to generate OTP" });
    }
  }

  // 2. Verify OTP & Complete Onboarding/Login
  public async verifyOtp(req: Request, res: Response): Promise<void> {
    const { phone, otp, name, platform, city } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user || user.otpCode !== otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        res.status(401).json({ error: "Invalid or expired OTP" });
        return;
      }

      // If user has no wallet, it's a first-time registration
      const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

      const finalUser = await prisma.$transaction(async (tx) => {
        // Clear OTP and update details
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
              userId: updatedUser.id, status: 'active',
              basePremium: 150.0, wLocMultiplier: 1.0,
              loyaltyDiscount: 0.0, finalPremiumPaid: 150.0,
              weekStartDate: today, weekEndDate: nextWeek,
            }
          });
        }
        return updatedUser;
      });

      // TODO: Generate and return a JWT here for session management
      res.status(200).json({ message: "Authentication successful", user: finalUser });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: "Verification failed" });
    }
  }
}