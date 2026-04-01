import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export class AuthController {
  public async register(req: Request, res: Response) {
    const { name, phone, platform, workCity, incomeBracket } = req.body;

    try {
      const user = await prisma.$transaction(async (tx) => {
        // 1. Create User with Frontend data
        const newUser = await tx.user.create({
          data: {
            name,
            phone,
            platform,
            city: workCity,
            incomeBracket,
          }
        });

        // 2. Initialize Wallet with the balance shown in your Flutter state
        await tx.wallet.create({
          data: {
            userId: newUser.id,
            balance: 12450.0 // Matches your frontend initial state
          }
        });

        return newUser;
      });

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ error: "Onboarding failed" });
    }
  }
}