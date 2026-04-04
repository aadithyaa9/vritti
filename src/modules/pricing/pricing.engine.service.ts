import axios from 'axios';
import { prisma } from '../../config/prisma.js';

// ============================================================
// Pricing Engine API Contract Types
// ============================================================

export interface PricingEngineRequest {
  rider_id: string;
  home_zone_id: string;
  delivery_platform: string;
  tier: string;
  primary_shift: string;
  avg_delivery_radius_km: number;
  avg_daily_active_hours: number;
  loyalty_weeks_active: number;
  avg_weekly_earnings_4wk: number;
  earnings_volatility_index: number;
  claim_history_score: number;
  zone_elevation_index: number;
  waterlogging_incidents_3yr: number;
  road_quality_score: number;
  zone_heat_island_index: number;
  rain_mm_7day_forecast: number;
  max_temp_forecast: number;
  wind_gust_kmh_forecast: number;
  aqi_forecast_avg: number;
  imd_alert_level_forecast: number;
  bandh_probability_score: number;
  platform_outage_7d_count: number;
  festival_calendar_flag: number;
  political_event_flag: number;
}

export interface PricingEngineResponse {
  rider_id: string;
  predicted_premium?: number;
  final_premium?: number;
  premium_final_inr?: number; // Mapped from Python Engine
  w_risk_score?: number;
  w_risk?: number;            // Mapped from Python Engine
  base_premium?: number;
  risk_tier?: string;
  [key: string]: unknown;
}

export interface PricingEngineBatchResponse {
  predictions: PricingEngineResponse[];
  [key: string]: unknown;
}

export interface RAlertResponse {
  zone_id: string;
  r_alert_multiplier?: number;
  r_alert?: number;           // Mapped from Python Engine
  imd_level: number;
  max_temp: number;
  [key: string]: unknown;
}

export interface PricingEngineHealth {
  status: string;
  model_trained_at: string;
  n_training_rows: number;
  drift_threshold: number;
  baseline_w_risk: number;
  ready: boolean;
}

// ============================================================
// City → zone_id mapping for the pricing engine
// ============================================================
const CITY_TO_ZONE_ID: Record<string, string> = {
  Chennai: 'chennai_central',
  Mumbai: 'mumbai_central',
  Bangalore: 'bangalore_central',
  Hyderabad: 'hyderabad_central',
  Delhi: 'delhi_central',
  Kolkata: 'kolkata_central',
  Pune: 'pune_central',
  Coimbatore: 'coimbatore_central',
};

export class PricingEngineService {
  private readonly BASE_URL: string;
  private readonly TIMEOUT_MS = 8000;
  private readonly BASE_PREMIUM = 150.0;

  constructor() {
    // Strip trailing slashes to prevent malformed URLs during interpolation
    this.BASE_URL = (
      process.env.PRICING_ENGINE_URL ??
      'https://devtrails-submission.onrender.com'
    ).replace(/\/$/, '');
  }

  // ----------------------------------------------------------
  // Helper for logging detailed Axios errors
  // ----------------------------------------------------------
  private logError(context: string, err: unknown) {
    if (axios.isAxiosError(err)) {
      const details = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.warn(`${context} ${details}`);
    } else {
      console.warn(`${context} ${(err as Error).message}`);
    }
  }

  // ----------------------------------------------------------
  // GET /health
  // ----------------------------------------------------------
  public async checkHealth(): Promise<PricingEngineHealth | null> {
    try {
      const res = await axios.get<PricingEngineHealth>(`${this.BASE_URL}/health`, {
        timeout: this.TIMEOUT_MS,
      });
      return res.data;
    } catch (err) {
      this.logError('[PRICING ENGINE] Health check failed:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // GET /r_alert/{zone_id}
  // ----------------------------------------------------------
  public async getRAlert(
    cityOrZoneId: string,
    imdLevel = 0,
    maxTemp = 30
  ): Promise<RAlertResponse | null> {
    const zoneId =
      CITY_TO_ZONE_ID[cityOrZoneId] ??
      (cityOrZoneId.includes('_') ? cityOrZoneId : `${cityOrZoneId.toLowerCase()}_central`);

    try {
      const res = await axios.get<RAlertResponse>(`${this.BASE_URL}/r_alert/${zoneId}`, {
        params: { imd_level: imdLevel, max_temp: maxTemp },
        timeout: this.TIMEOUT_MS,
      });
      
      const multiplier = res.data.r_alert ?? res.data.r_alert_multiplier ?? 1.0;
      console.log(`[PRICING ENGINE] R-Alert for zone ${zoneId}: multiplier=${multiplier}`);
      return res.data;
    } catch (err) {
      this.logError(`[PRICING ENGINE] R-Alert failed for zone ${zoneId}:`, err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // POST /predict — single rider
  // ----------------------------------------------------------
  public async predictSingle(
    payload: PricingEngineRequest
  ): Promise<PricingEngineResponse | null> {
    try {
      const res = await axios.post<PricingEngineResponse>(`${this.BASE_URL}/predict`, payload, {
        timeout: this.TIMEOUT_MS,
      });
      
      const loggedPremium = res.data.premium_final_inr ?? res.data.final_premium ?? res.data.predicted_premium;
      console.log(`[PRICING ENGINE] /predict → rider=${payload.rider_id} | premium=${loggedPremium}`);
      return res.data;
    } catch (err) {
      this.logError('[PRICING ENGINE] /predict failed:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // POST /predict/batch — multiple riders
  // ----------------------------------------------------------
  public async predictBatch(
    riders: PricingEngineRequest[]
  ): Promise<PricingEngineBatchResponse | null> {
    try {
      const res = await axios.post<PricingEngineBatchResponse>(
        `${this.BASE_URL}/predict/batch`,
        { riders },
        { timeout: this.TIMEOUT_MS }
      );
      console.log(`[PRICING ENGINE] /predict/batch → ${riders.length} riders processed`);
      return res.data;
    } catch (err) {
      this.logError('[PRICING ENGINE] /predict/batch failed:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Build the 24-field payload from a Prisma user + DB data
  // ----------------------------------------------------------
  public async buildPayloadForUser(
    userId: string,
    weatherOverride?: {
      rain_mm?: number;
      max_temp?: number;
      wind_gust_kmh?: number;
      aqi?: number;
      imd_level?: number;
    },
    cityOverride?: string
  ): Promise<PricingEngineRequest | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          policies: { orderBy: { createdAt: 'desc' }, take: 10 },
          payouts: { where: { status: 'success' } },
          activityLogs: { orderBy: { date: 'desc' }, take: 28 },
        },
      });

      if (!user) return null;

      const city = cityOverride ?? user.city ?? 'Chennai';
      const zoneId = CITY_TO_ZONE_ID[city] ?? `${city.toLowerCase()}_central`;

      const loyaltyWeeks = user.policies.length;

      const recentLogs = user.activityLogs;
      const totalEarnings = recentLogs.reduce((sum, log) => sum + Number(log.earnings ?? 0), 0);
      const avgWeeklyEarnings4wk = recentLogs.length > 0 ? (totalEarnings / recentLogs.length) * 7 : 3500;

      const earningsArr = recentLogs.map((l) => Number(l.earnings ?? 0));
      const mean = earningsArr.length ? earningsArr.reduce((a, b) => a + b, 0) / earningsArr.length : 500;
      const maxE = Math.max(...(earningsArr.length > 0 ? earningsArr : [mean]), mean);
      const minE = Math.min(...(earningsArr.length > 0 ? earningsArr : [mean]), mean);
      const earningsVolatilityIndex = mean > 0 ? (maxE - minE) / mean : 0.3;

      const claimHistoryScore = Math.min(user.payouts.length / 10, 1.0);

      const latestWeather = await prisma.weatherMetric.findFirst({
        where: { city },
        orderBy: { recordedAt: 'desc' },
      });

      const rainMm = weatherOverride?.rain_mm ?? Number(latestWeather?.precipitationMm ?? 0);
      const maxTemp = weatherOverride?.max_temp ?? Number(latestWeather?.temperatureCelsius ?? 30);
      const windGust = weatherOverride?.wind_gust_kmh ?? Number(latestWeather?.windGustKmh ?? 0);
      const aqi = weatherOverride?.aqi ?? Number(latestWeather?.aqiLevel ?? 50);
      const imdLevel = weatherOverride?.imd_level ?? 0;

      let tier = 'silver';
      if (String(user.incomeBracket || '').includes('15k')) tier = 'gold';

      const platform = user.platform ? user.platform.toLowerCase() : 'swiggy';
      const payload: PricingEngineRequest = {
        rider_id: userId,
        home_zone_id: zoneId,
        delivery_platform: platform,
        tier,
        primary_shift: 'evening',
        avg_delivery_radius_km: 8.0,
        avg_daily_active_hours: 8.0,
        loyalty_weeks_active: loyaltyWeeks,
        avg_weekly_earnings_4wk: avgWeeklyEarnings4wk,
        earnings_volatility_index: earningsVolatilityIndex,
        claim_history_score: claimHistoryScore,
        zone_elevation_index: 0.3,
        waterlogging_incidents_3yr: 2,
        road_quality_score: 0.6,
        zone_heat_island_index: 0.4,
        rain_mm_7day_forecast: rainMm,
        max_temp_forecast: maxTemp,
        wind_gust_kmh_forecast: windGust,
        aqi_forecast_avg: aqi,
        imd_alert_level_forecast: imdLevel,
        bandh_probability_score: 0.1,
        platform_outage_7d_count: 0,
        festival_calendar_flag: 0,
        political_event_flag: 0,
      };

      return payload;
    } catch (err) {
      console.error('[PRICING ENGINE] buildPayloadForUser error:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // High-level: get dynamic premium for one user
  // ----------------------------------------------------------
  public async getDynamicPremium(
    userId: string,
    city?: string
  ): Promise<{
    finalPremium: number;
    wRiskScore: number;
    rAlertMultiplier: number;
    source: 'engine' | 'fallback';
    engineResponse: PricingEngineResponse | null;
  }> {
    const FALLBACK = {
      finalPremium: this.BASE_PREMIUM,
      wRiskScore: 0.83,
      rAlertMultiplier: 1.0,
      source: 'fallback' as const,
      engineResponse: null,
    };

    try {
      const payload = await this.buildPayloadForUser(userId, undefined, city);
      if (!payload) return FALLBACK;

      const rAlert = await this.getRAlert(
        payload.home_zone_id,
        payload.imd_alert_level_forecast,
        payload.max_temp_forecast
      );
      
      const rAlertMultiplier = rAlert?.r_alert ?? rAlert?.r_alert_multiplier ?? 1.0;

      const prediction = await this.predictSingle(payload);
      if (!prediction) return FALLBACK;

      const rawPremium = prediction.premium_final_inr ?? prediction.final_premium ?? prediction.predicted_premium ?? this.BASE_PREMIUM;
      const wRisk = prediction.w_risk ?? prediction.w_risk_score ?? 0.83;

      return {
        finalPremium: parseFloat((rawPremium * rAlertMultiplier).toFixed(2)),
        wRiskScore: wRisk,
        rAlertMultiplier,
        source: 'engine',
        engineResponse: prediction,
      };
    } catch (err) {
      console.error('[PRICING ENGINE] getDynamicPremium error:', err);
      return FALLBACK;
    }
  }

  // ----------------------------------------------------------
  // Batch: all users in a city
  // ----------------------------------------------------------
  public async getDynamicPremiumsBatch(
    userIds: string[],
    city: string
  ): Promise<Map<string, { finalPremium: number; wRiskScore: number; rAlertMultiplier: number }>> {
    const resultMap = new Map<
      string,
      { finalPremium: number; wRiskScore: number; rAlertMultiplier: number }
    >();

    userIds.forEach((id) =>
      resultMap.set(id, {
        finalPremium: this.BASE_PREMIUM,
        wRiskScore: 0.83,
        rAlertMultiplier: 1.0,
      })
    );

    try {
      const payloads = (
        await Promise.all(userIds.map((id) => this.buildPayloadForUser(id, undefined, city)))
      ).filter((p): p is PricingEngineRequest => p !== null);

      if (payloads.length === 0) return resultMap;

      const firstPayload = payloads[0]!;
      const rAlert = await this.getRAlert(
        city,
        firstPayload.imd_alert_level_forecast,
        firstPayload.max_temp_forecast
      );
      const rAlertMultiplier = rAlert?.r_alert ?? rAlert?.r_alert_multiplier ?? 1.0;

      const batchResult = await this.predictBatch(payloads);
      if (!batchResult) return resultMap;

      const predictions: PricingEngineResponse[] =
        batchResult.predictions && Array.isArray(batchResult.predictions)
          ? batchResult.predictions
          : (Object.values(batchResult) as PricingEngineResponse[]);

      for (const pred of predictions) {
        if (!pred.rider_id) continue;
        
        const rawPremium = pred.premium_final_inr ?? pred.final_premium ?? pred.predicted_premium ?? this.BASE_PREMIUM;
        const wRisk = pred.w_risk ?? pred.w_risk_score ?? 0.83;
        
        resultMap.set(pred.rider_id, {
          finalPremium: parseFloat((rawPremium * rAlertMultiplier).toFixed(2)),
          wRiskScore: wRisk,
          rAlertMultiplier,
        });
      }

      console.log(`[PRICING ENGINE] Batch done — ${predictions.length}/${userIds.length} riders priced via ML engine`);
    } catch (err) {
      console.error('[PRICING ENGINE] getDynamicPremiumsBatch error:', err);
    }

    return resultMap;
  }
}