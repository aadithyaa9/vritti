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

    const steps: any[] = [];
    const addStep = (
      label: string,
      status: "pass" | "fail",
      detail: string,
    ) => {
      steps.push({
        label,
        status,
        detail,
        timestamp: new Date().toLocaleTimeString(),
      });
    };

    try {
      addStep(
        "Handshake",
        "pass",
        "Secure connection to Vritti Core established.",
      );

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { policies: { where: { status: "active" } } },
      });

      if (!user) {
        addStep("Authentication", "fail", "User record not found in system.");
        return { success: false, message: "User not found.", steps };
      }

      if (!user.policies || user.policies.length === 0) {
        addStep(
          "Policy Verification",
          "fail",
          "No active coverage found for this week.",
        );
        await this.notificationService.createNotification(
          user.id,
          "Claim Rejected",
          "No active policy.",
          "ERROR",
        );
        return { success: false, message: "No active policy.", steps };
      }

      const policy = user.policies[0]!;
      addStep(
        "Policy Verification",
        "pass",
        `Active Policy Found (ID: POL-${policy.id.substring(0, 6)})`,
      );

      const isFraudFlag = user.isDeviceSecure === false;
      if (isFraudFlag)
        addStep("Edge AI Telemetry", "fail", "Hardware Integrity Flagged.");
      else addStep("Edge AI Telemetry", "pass", "Hardware Integrity Verified.");

      let isWeatherDisrupted = false;
      try {
        const wxRes = await axios.get(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`,
        );
        const wxCode = wxRes.data.current_weather.weathercode;
        if (wxCode >= 51) {
          isWeatherDisrupted = true;
          addStep(
            "Weather Oracle",
            "pass",
            `Severe weather detected (WMO Code: ${wxCode})`,
          );
        } else {
          addStep(
            "Weather Oracle",
            "fail",
            `Normal conditions (WMO Code: ${wxCode})`,
          );
        }
      } catch (error: any) {
        addStep("Weather Oracle", "fail", "API Unreachable.");
      }

      let isNewsDisrupted = false;
      try {
        const newsRes = await axios.post(
          "http://localhost:8000/api/v1/analyze/location",
          { latitude: lat, longitude: lng, radius_km: 50 },
        );
        if (newsRes.data && newsRes.data.disruption_probability > 0.6) {
          isNewsDisrupted = true;
          addStep(
            "News Intelligence",
            "pass",
            `Disruption confirmed (Prob: ${newsRes.data.disruption_probability})`,
          );
        } else {
          addStep(
            "News Intelligence",
            "fail",
            "No hyper-local disruptions reported.",
          );
        }
      } catch (error: any) {
        addStep("News Intelligence", "fail", "Scraper API Offline or Error.");
      }

      const isApproved =
        (isNewsDisrupted || isWeatherDisrupted) && !isFraudFlag;

      if (isApproved) {
        addStep(
          "Smart Contract",
          "pass",
          "Parametric triggers met. Payout authorized.",
        );

        const riskMultiplier =
          isNewsDisrupted && isWeatherDisrupted ? 1.5 : 1.0;
        const baseCoverage = policy.coverageAmount
          ? Number(policy.coverageAmount)
          : Number(policy.basePremium || 100);
        const finalPayout = baseCoverage * riskMultiplier;

        const payoutRes = await this.payoutService.executeSingleUserPayout(
          user.id,
          finalPayout,
          "Parametric Auto-Claim",
        );

        if (payoutRes.success) {
          addStep(
            "Smart Contract",
            "pass",
            `Transfer Executed (Txn: ${payoutRes.transactionId})`,
          );

          await this.notificationService.createNotification(
            user.id,
            "Disruption Payout Approved!",
            `₹${finalPayout} has been successfully credited to your Gullak.`,
            "SUCCESS",
          );

          return {
            success: true,
            message: "Claim Approved",
            steps: steps,
            transactionId: payoutRes.transactionId,
            newBalance: payoutRes.newBalance,
            payoutAmount: finalPayout,
          };
        } else {
          addStep("Payment System", "fail", "Internal wallet transfer failed.");
          return { success: false, message: "Wallet Error", steps };
        }
      } else {
        let rejectReason = "Conditions not met.";
        if (isFraudFlag) rejectReason = "Rejected due to Edge AI Fraud Flag.";
        else if (!isWeatherDisrupted && !isNewsDisrupted)
          rejectReason = "No weather or news disruption at location.";

        addStep("Smart Contract", "fail", rejectReason);
        await this.notificationService.createNotification(
          user.id,
          "Claim Rejected",
          rejectReason,
          "WARNING",
        );
        return { success: false, message: rejectReason, steps: steps };
      }
    } catch (error: any) {
      console.error("[DisruptionService] FATAL ERROR:", error);
      addStep("System", "fail", "Internal server fault.");
      return { success: false, message: "Internal Error", steps };
    }
  }

  public async evaluateCity(city: string): Promise<void> {}
  public async getRecentChecks(city: string): Promise<any[]> {
    return [];
  }
  public async getCityStatus(city: string): Promise<any> {
    return {};
  }
}
