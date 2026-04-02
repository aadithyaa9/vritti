import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import axios from 'axios';

export class AuthController {
  
  // ==========================================
  // 1. Request OTP (Login & Registration)
  // ==========================================
  public async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;
    
    if (!phone) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    // Generate a random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60000); // Expires in 10 mins

    try {
      // 1. Save OTP to database
      await prisma.user.upsert({
        where: { phone },
        update: { otpCode, otpExpiresAt },
        create: { 
          phone, 
          otpCode, 
          otpExpiresAt 
        }
      });

      console.log(`[DEV MODE] Generated OTP for ${phone} is: ${otpCode}`);

      // 2. Send SMS via Fast2SMS (Make sure FAST2SMS_API_KEY is in your .env)
      if (process.env.FAST2SMS_API_KEY) {
        try {
          await axios.get('https://www.fast2sms.com/dev/bulkV2', {
            params: {
              authorization: process.env.FAST2SMS_API_KEY,
              variables_values: otpCode,
              route: 'otp',
              numbers: phone.replace('+91', '') // Fast2SMS expects 10 digits without +91
            }
          });
          console.log(`[AUTH] Real SMS sent successfully to ${phone}`);
        } catch (smsError) {
          console.error('[AUTH SMS ERROR] Failed to send actual SMS. Please check API Key.', smsError);
          // We don't fail the whole request here in case it's just a dev environment issue
        }
      } else {
        console.warn('[AUTH WARNING] FAST2SMS_API_KEY not found in .env. Falling back to console logging OTP only.');
      }

      res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: "Failed to process OTP request" });
    }
  }

  // ==========================================
  // 2. Verify OTP & Complete Onboarding
  // ==========================================
  public async verifyOtp(req: Request, res: Response): Promise<void> {
    const { phone, otp, name, platform, city } = req.body;

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      // Strict validation: String(otp) ensures it doesn't fail if frontend sends a number
      if (!user || user.otpCode !== String(otp) || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        res.status(401).json({ error: "Invalid or expired OTP" });
        return;
      }

      // Check if this is a brand new user (no wallet yet)
      const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

      // Run database updates in a transaction to ensure everything succeeds or fails together
      const finalUser = await prisma.$transaction(async (tx) => {
        
        // 1. Clear OTP and update user details
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

        // 2. If first time login, setup their wallet and initial policy
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

      // (Optional TODO) Generate JWT token here if you are using JWTs for session management
      
      res.status(200).json({ 
        message: "Authentication successful", 
        user: finalUser 
      });

    } catch (error) {
      console.error('[AUTH VERIFY ERROR]', error);
      res.status(500).json({ error: "Verification failed" });
    }
  }
}