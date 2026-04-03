import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {

  public async requestOtp(req: Request, res: Response): Promise<void> {
    const { phone } = req.body;
    if (!phone) { res.status(400).json({ error: 'Phone number is required' }); return; }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60000);

    try {
      const user = await prisma.user.upsert({
        where: { phone },
        update: { otpCode, otpExpiresAt },
        create: { phone, otpCode, otpExpiresAt },
      });

      const isNewUser = !user.name; 

      console.log(`\n📱 [OTP SERVICE] ================================`);
      console.log(`   Phone  : ${phone}`);
      console.log(`   OTP    : ${otpCode}`);
      console.log(`   Type   : ${isNewUser ? 'SIGN UP' : 'SIGN IN'}`);
      console.log(`================================================\n`);

      res.status(200).json({ message: 'OTP sent successfully', isNewUser });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: 'Failed to process OTP request' });
    }
  }

  public async verifyOtp(req: Request, res: Response): Promise<void> {
    const { phone, otp, name, platform, city, consentGiven } = req.body;

    if (!phone || !otp) { res.status(400).json({ error: 'Phone and OTP are required' }); return; }

    try {
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) { res.status(404).json({ error: 'User not found. Please request an OTP first.' }); return; }
      if (user.otpCode !== String(otp)) { res.status(401).json({ error: 'Invalid OTP.' }); return; }
      if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) { res.status(401).json({ error: 'OTP has expired.' }); return; }

      const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const isSignUp = !existingWallet;

      if (isSignUp && !consentGiven) {
        res.status(400).json({ error: 'You must provide consent to keep the app active while driving.' }); return;
      }

      const finalUser = await prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            name: name ?? user.name,
            platform: platform ?? user.platform,
            city: city ?? user.city,
            isDeviceSecure: consentGiven ? true : user.isDeviceSecure,
            otpCode: null, otpExpiresAt: null,
          },
        });

        if (isSignUp) {
          await tx.wallet.create({ data: { userId: updatedUser.id, balance: 0.0 } });
          const today = new Date();
          const weekEnd = new Date(today);
          weekEnd.setDate(today.getDate() + 7);

          await tx.policy.create({
            data: {
              userId: updatedUser.id, status: 'active',
              basePremium: 150.0, wLocMultiplier: 1.0, loyaltyDiscount: 0.0,
              finalPremiumPaid: 150.0, weekStartDate: today, weekEndDate: weekEnd,
            },
          });
        }
        return updatedUser;
      });

      const completeUser = await prisma.user.findUnique({
        where: { id: finalUser.id },
        include: { wallet: true, policies: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      res.status(200).json({
        message: isSignUp ? 'Welcome to Vritti! Your account is ready.' : 'Welcome back!',
        isNewUser: isSignUp,
        user: {
          id: completeUser!.id, name: completeUser!.name, phone: completeUser!.phone,
          city: completeUser!.city, platform: completeUser!.platform,
          incomeBracket: completeUser!.incomeBracket, isDeviceSecure: completeUser!.isDeviceSecure,
          wallet: completeUser!.wallet, activePolicy: completeUser!.policies[0] ?? null,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
  }

  public async getUserProfile(req: Request, res: Response): Promise<void> {
    // 🚨 FIXED: Removed Array.isArray(req.params.userId) which causes Express parsing errors
    const userId = req.params.userId as string; 

    if (!userId) { res.status(400).json({ error: 'User ID is required' }); return; }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true, policies: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!user) { res.status(404).json({ error: 'User not found' }); return; }

      res.status(200).json({
        id: user.id, name: user.name, phone: user.phone, city: user.city,
        platform: user.platform, incomeBracket: user.incomeBracket,
        isDeviceSecure: user.isDeviceSecure, lat: user.lat, lng: user.lng,
        wallet: user.wallet, activePolicy: user.policies[0] ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}