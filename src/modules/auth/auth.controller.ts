// src/modules/auth/auth.controller.ts
import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {
  public async register(req: Request, res: Response) {
    const { name, phone, platform, city } = req.body; // 🛠️ Corrected 'city' mapping

    try {
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { name, phone, platform, city, incomeBracket: null }
        });

        await tx.wallet.create({
          data: { userId: newUser.id, balance: 0.0 }
        });

        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        await tx.policy.create({
          data: {
            userId: newUser.id, status: 'active',
            basePremium: 150.0, wLocMultiplier: 1.0,
            loyaltyDiscount: 0.0, finalPremiumPaid: 150.0,
            weekStartDate: today, weekEndDate: nextWeek,
          }
        });

        return newUser;
      }, {
        maxWait: 10000, // 🆕 Give Prisma 10 seconds to start the transaction
        timeout: 20000  // 🆕 Give the whole process 20 seconds to finish
      });

      res.status(201).json(user);
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      res.status(500).json({ error: "Onboarding failed" });
    }
  }

  public async login(req: Request, res: Response) {
    const { phone } = req.body;
    try {
      const user = await prisma.user.findUnique({
        where: { phone },
        include: { wallet: true }
      });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  }
}