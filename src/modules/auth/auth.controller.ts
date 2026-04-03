import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {

  /**
   * Step 1: Request OTP
   * Works for both Sign Up and Sign In - just needs a phone number.
   * The backend upserts the user record so it works either way.
   */
  public async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    try {
      // Upsert: creates user if new, updates OTP if existing
      const user = await prisma.user.upsert({
        where: { phone },
        update: { otpCode, otpExpiresAt },
        create: { phone, otpCode, otpExpiresAt },
      });

      const isNewUser = !user.name; // If no name yet, it's a fresh sign up

      // In production this would send via SMS. In dev we log it clearly.
      console.log(`\n📱 [OTP SERVICE] ================================`);
      console.log(`   Phone  : ${phone}`);
      console.log(`   OTP    : ${otpCode}`);
      console.log(`   Type   : ${isNewUser ? 'SIGN UP (new user)' : 'SIGN IN (returning user)'}`);
      console.log(`   Expires: ${otpExpiresAt.toISOString()}`);
      console.log(`================================================\n`);

      res.status(200).json({
        message: 'OTP sent successfully',
        isNewUser, // Frontend uses this to decide whether to show name/city/platform fields
      });
    } catch (error) {
      console.error('[AUTH ERROR] requestOtp failed:', error);
      res.status(500).json({ error: 'Failed to process OTP request' });
    }
  }

  /**
   * Step 2: Verify OTP
   *
   * SIGN UP path: Provide name, city, platform, consentGiven=true
   *   → Creates wallet + initial policy (Welcome Safety SIP at ₹150 flat)
   *
   * SIGN IN path: Just phone + otp
   *   → Returns existing user data, no new wallet/policy created
   */
  public async verifyOtp(req: Request, res: Response): Promise<void> {
    const { phone, otp, name, platform, city, consentGiven } = req.body;

    if (!phone || !otp) {
      res.status(400).json({ error: 'Phone and OTP are required' });
      return;
    }

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        res.status(404).json({ error: 'User not found. Please request an OTP first.' });
        return;
      }

      // OTP Validation
      if (user.otpCode !== String(otp)) {
        res.status(401).json({ error: 'Invalid OTP. Please try again.' });
        return;
      }

      if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
        return;
      }

      // Check if this user already has a wallet (determines sign up vs sign in)
      const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const isSignUp = !existingWallet;

      // For sign up, consent is mandatory
      if (isSignUp && !consentGiven) {
        res.status(400).json({
          error: 'You must provide consent to keep the app active while driving to complete sign up.',
        });
        return;
      }

      const finalUser = await prisma.$transaction(async (tx) => {
        // Always clear OTP and update profile fields if provided
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            name: name ?? user.name,
            platform: platform ?? user.platform,
            city: city ?? user.city,
            isDeviceSecure: consentGiven ? true : user.isDeviceSecure,
            otpCode: null,
            otpExpiresAt: null,
          },
        });

        if (isSignUp) {
          // Create wallet with zero balance (they haven't deposited yet)
          await tx.wallet.create({
            data: { userId: updatedUser.id, balance: 0.0 },
          });

          // Issue the first Welcome Safety SIP policy
          const today = new Date();
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() + 7);

          await tx.policy.create({
            data: {
              userId: updatedUser.id,
              status: 'active',
              basePremium: 150.0,
              wLocMultiplier: 1.0,
              loyaltyDiscount: 0.0,
              finalPremiumPaid: 150.0,
              weekStartDate: today,
              weekEndDate: weekEnd,
            },
          });

          console.log(`\n🎉 [AUTH] New User Onboarded!`);
          console.log(`   Name    : ${updatedUser.name}`);
          console.log(`   Phone   : ${phone}`);
          console.log(`   City    : ${updatedUser.city}`);
          console.log(`   Platform: ${updatedUser.platform}`);
          console.log(`   Wallet  : ₹0.00 created`);
          console.log(`   Policy  : Welcome Safety SIP activated (₹150 / week)\n`);
        } else {
          console.log(`\n✅ [AUTH] Returning User Sign In: ${updatedUser.name} (${phone})\n`);
        }

        return updatedUser;
      });

      // Fetch complete user data to return to frontend
      const completeUser = await prisma.user.findUnique({
        where: { id: finalUser.id },
        include: {
          wallet: true,
          policies: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      res.status(200).json({
        message: isSignUp ? 'Welcome to Vritti! Your account is ready.' : 'Welcome back!',
        isNewUser: isSignUp,
        user: {
          id: completeUser!.id,
          name: completeUser!.name,
          phone: completeUser!.phone,
          city: completeUser!.city,
          platform: completeUser!.platform,
          incomeBracket: completeUser!.incomeBracket,
          isDeviceSecure: completeUser!.isDeviceSecure,
          wallet: completeUser!.wallet,
          activePolicy: completeUser!.policies[0] ?? null,
        },
      });
    } catch (error) {
      console.error('[AUTH VERIFY ERROR]', error);
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  }

  /**
   * Get user profile with wallet and active policy
   * Used by frontend to refresh user data after events
   */
  public async getUserProfile(req: Request, res: Response): Promise<void> {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          policies: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.status(200).json({
        id: user.id,
        name: user.name,
        phone: user.phone,
        city: user.city,
        platform: user.platform,
        incomeBracket: user.incomeBracket,
        isDeviceSecure: user.isDeviceSecure,
        lat: user.lat,
        lng: user.lng,
        wallet: user.wallet,
        activePolicy: user.policies[0] ?? null,
      });
    } catch (error) {
      console.error('[AUTH PROFILE ERROR]', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}
