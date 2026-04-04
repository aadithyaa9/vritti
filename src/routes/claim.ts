import express from "express";
import { validateAndProcessClaim } from "../services/claimService";

const router = express.Router();

router.post("/claim", async (req, res) => {
  try {
    const { userId } = req.body;

    const logs: string[] = [];

    logs.push("Policy check ✓");
    logs.push("Weather ✓");
    logs.push("Edge Engine ✓");

    const result = await validateAndProcessClaim(userId);

    logs.push("Payout triggered ✓");

    return res.json({
      success: true,
      logs,
      amount: result.amount
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

export default router;
