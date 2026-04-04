import axios from "axios";
import { prisma } from "../../config/prisma.js";
import { PayoutService } from "../payout/payout.service.js";

const payoutService = new PayoutService();

export class DisruptionService {
  public async processOneTouchClaim(userId: string, lat: number, lng: number) {
    console.log(`\n--- [DisruptionService] Processing Claim ---`);
    console.log(`User: ${userId} | Lat: ${lat}, Lng: ${lng}`);

    try {
      // 1. Fetch User and their Active Policy
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { policies: { where: { status: "ACTIVE" } } },
      });

      if (!user) {
        console.log("[Action] Claim REJECTED: User not found.");
        return {
          claimId: null,
          status: "REJECTED",
          payoutAmount: 0,
          reason: "User not found.",
        };
      }

      if (!user.policies || user.policies.length === 0) {
        console.log("[Action] Claim REJECTED: No active policy found.");
        return {
          claimId: null,
          status: "REJECTED",
          payoutAmount: 0,
          reason: "No active policy found for this user.",
        };
      }

      const policy = user.policies[0];

      // 2. CHECK FRAUD FLAG (Edge Telemetry)
      const isFraudFlag = user.isDeviceSecure === false;
      console.log(`[Check 1] Fraud Flag Detected: ${isFraudFlag}`);

      // 3. CHECK WEATHER (Using Free Open-Meteo API)
      let isWeatherDisrupted = false;
      let weatherDetail = "Clear weather / No disruption";
      try {
        const wxRes = await axios.get(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`,
        );
        const wxCode = wxRes.data.current_weather.weathercode;

        // WMO Weather interpretation codes: >= 51 means drizzle, heavy rain, snow, thunderstorms, etc.
        if (wxCode >= 51) {
          isWeatherDisrupted = true;
          weatherDetail = `Severe weather detected (WMO Code: ${wxCode})`;
        }
      } catch (error: any) {
        console.error("[Check 2] Weather check failed:", error.message);
      }
      console.log(
        `[Check 2] Weather Disrupted: ${isWeatherDisrupted} (${weatherDetail})`,
      );

      // 4. CHECK NEWS SCRAPER
      let isNewsDisrupted = false;
      let newsDetail = "No news of disruption";
      try {
        const newsRes = await axios.post(
          "http://localhost:8000/api/v1/analyze/location",
          {
            latitude: lat,
            longitude: lng,
            radius_km: 50,
          },
        );

        if (newsRes.data && newsRes.data.disruption_probability > 0.6) {
          isNewsDisrupted = true;
          newsDetail = `News indicates local disruption (Prob: ${newsRes.data.disruption_probability})`;
        }
      } catch (error: any) {
        console.error(
          "[Check 3] News Scraper check failed or offline:",
          error.message,
        );
      }
      console.log(`[Check 3] News Disrupted: ${isNewsDisrupted}`);

      // -------------------------------------------------------------
      // 5. THE CORE LOGIC: (News OR Weather) AND NOT Fraud
      // -------------------------------------------------------------
      const isApproved =
        (isNewsDisrupted || isWeatherDisrupted) && !isFraudFlag;

      let finalPayout = 0;
      let status = "REJECTED";
      let rejectReason = "";

      if (isApproved) {
        status = "APPROVED";

        // Calculate Dynamic Payout based on intensity
        const riskMultiplier =
          isNewsDisrupted && isWeatherDisrupted ? 1.5 : 1.0;
        finalPayout = (policy.coverageAmount || 100) * riskMultiplier;

        console.log(
          `[Action] Claim APPROVED. Dynamic Multiplier: ${riskMultiplier}x | Payout: ${finalPayout}`,
        );

        // Trigger actual blockchain/wallet payout
        await payoutService.processPayout(user.id, finalPayout);
      } else {
        if (isFraudFlag) {
          rejectReason =
            "Rejected due to Fraud Flag (Inconsistent Edge Telemetry).";
        } else if (!isWeatherDisrupted && !isNewsDisrupted) {
          rejectReason =
            "Rejected: No weather or news disruption detected in your exact location.";
        } else {
          rejectReason = "Rejected due to unmet parametric criteria.";
        }
        console.log(`[Action] Claim REJECTED. Reason: ${rejectReason}`);
      }

      // 6. Save Claim Record
      const claim = await prisma.claim.create({
        data: {
          userId: user.id,
          policyId: policy.id,
          amount: finalPayout,
          status: status,
          claimType: "PARAMETRIC",
        },
      });

      console.log(`--- [DisruptionService] Finished ---\n`);

      // 7. Return comprehensive payload
      return {
        claimId: claim.id,
        status,
        payoutAmount: finalPayout,
        reason: isApproved
          ? "Disruption verified and device telemetry is secure."
          : rejectReason,
        telemetry: {
          weatherDisrupted: isWeatherDisrupted,
          newsDisrupted: isNewsDisrupted,
          fraudDetected: isFraudFlag,
        },
      };
    } catch (error: any) {
      console.error("[DisruptionService] FATAL ERROR:", error);
      throw error; // Let controller handle catastrophic DB errors
    }
  }
}

