import axios from "axios";
import { prisma } from "../../config/prisma.js";
import { PayoutService } from "../payout/payout.service.js";
import { NotificationService } from "../notification/notification.service.js";

export class DisruptionService {
  private payoutService: PayoutService;
  private notificationService: NotificationService;

  constructor() {
    this.payoutService = new PayoutService();
    this.notificationService = new NotificationService();
  }

  public async processOneTouchClaim(userId: string, lat: number, lng: number) {
    console.log(`\n--- [DisruptionService] Processing Claim ---`);
    console.log(`User: ${userId} | Lat: ${lat}, Lng: ${lng}`);

    try {
      // 1. Fetch User and their Active Policy
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { policies: { where: { status: "active" } } },
      });

      if (!user) {
        console.log("[Action] Claim REJECTED: User not found.");
        return { claimId: null, status: "REJECTED", payoutAmount: 0, reason: "User not found.", success: false };
      }

      if (!user.policies || user.policies.length === 0) {
        const reason = "No active policy found for this user.";
        console.log(`[Action] Claim REJECTED: ${reason}`);
        await this.notificationService.createNotification(user.id, "Claim Rejected", reason, "ERROR");
        return { claimId: null, status: "REJECTED", payoutAmount: 0, reason, success: false };
      }

      const policy = user.policies[0]!;

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

        if (wxCode >= 51) {
          isWeatherDisrupted = true;
          weatherDetail = `Severe weather detected (WMO Code: ${wxCode})`;
        }
      } catch (error: any) {
        console.error("[Check 2] Weather check failed:", error.message);
      }
      console.log(`[Check 2] Weather Disrupted: ${isWeatherDisrupted} (${weatherDetail})`);

      // 4. CHECK NEWS SCRAPER
      let isNewsDisrupted = false;
      let newsDetail = "No news of disruption";
      try {
        const newsRes = await axios.post(
          "http://localhost:8000/api/v1/analyze/location",
          { latitude: lat, longitude: lng, radius_km: 50 },
        );

        if (newsRes.data && newsRes.data.disruption_probability > 0.6) {
          isNewsDisrupted = true;
          newsDetail = `News indicates local disruption (Prob: ${newsRes.data.disruption_probability})`;
        }
      } catch (error: any) {
        console.error("[Check 3] News Scraper check failed or offline:", error.message);
      }
      console.log(`[Check 3] News Disrupted: ${isNewsDisrupted}`);

      // -------------------------------------------------------------
      // 5. THE CORE LOGIC: (News OR Weather) AND NOT Fraud
      // -------------------------------------------------------------
      const isApproved = (isNewsDisrupted || isWeatherDisrupted) && !isFraudFlag;

      let finalPayout = 0;
      let status = "REJECTED";
      let rejectReason = "";

      if (isApproved) {
        status = "APPROVED";

        // Calculate Dynamic Payout based on intensity
        const riskMultiplier = isNewsDisrupted && isWeatherDisrupted ? 1.5 : 1.0;
        const baseCoverage = policy.coverageAmount ? Number(policy.coverageAmount) : Number(policy.basePremium || 100);
        finalPayout = baseCoverage * riskMultiplier;

        console.log(`[Action] Claim APPROVED. Dynamic Multiplier: ${riskMultiplier}x | Payout: ${finalPayout}`);

        // Trigger actual blockchain/wallet payout
        await this.payoutService.executeSingleUserPayout(user.id, finalPayout, "Parametric Auto-Claim");
        
        // 🔔 SEND SUCCESS NOTIFICATION
        await this.notificationService.createNotification(
          user.id, 
          "Disruption Payout Approved!", 
          `₹${finalPayout} has been successfully credited to your wallet due to verified local disruptions.`, 
          "SUCCESS"
        );

      } else {
        if (isFraudFlag) {
          rejectReason = "Rejected due to Fraud Flag (Inconsistent Edge Telemetry).";
        } else if (!isWeatherDisrupted && !isNewsDisrupted) {
          rejectReason = "Rejected: No weather or news disruption detected in your exact location.";
        } else {
          rejectReason = "Rejected due to unmet parametric criteria.";
        }
        console.log(`[Action] Claim REJECTED. Reason: ${rejectReason}`);

        // 🔔 SEND REJECTION NOTIFICATION
        await this.notificationService.createNotification(
          user.id, 
          "Claim Update", 
          rejectReason, 
          "WARNING"
        );
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
        success: isApproved,
        claimId: claim.id,
        status,
        payoutAmount: finalPayout,
        reason: isApproved ? "Disruption verified and device telemetry is secure." : rejectReason,
        telemetry: {
          weatherDisrupted: isWeatherDisrupted,
          newsDisrupted: isNewsDisrupted,
          fraudDetected: isFraudFlag,
        },
      };
    } catch (error: any) {
      console.error("[DisruptionService] FATAL ERROR:", error);
      throw error; 
    }
  }

  // ====================================================================
  // RESTORED METHODS FOR DEMO & DASHBOARD CONTROLLERS
  // ====================================================================

  public async evaluateCity(city: string): Promise<void> {
    console.log(`[DisruptionService] Fallback evaluateCity triggered for ${city}`);
  }

  public async getRecentChecks(city: string): Promise<any[]> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return await prisma.disruptionCheck.findMany({ 
      where: { city, createdAt: { gte: last24Hours } }, 
      orderBy: { createdAt: 'desc' }, 
      take: 10 
    });
  }

  public async getCityStatus(city: string): Promise<any> {
    const lastCheck = await prisma.disruptionCheck.findFirst({ where: { city }, orderBy: { createdAt: 'desc' } });
    const activeEvent = await prisma.event.findFirst({ where: { city, status: 'active' }, orderBy: { createdAt: 'desc' } });
    return { city, isDisrupted: lastCheck?.disruption ?? false, lastCheck, activeEvent };
  }
}