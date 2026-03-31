import { prisma } from '../../config/prisma.js';
import { PayoutService } from '../payout/payout.service.js';
export class DisruptionService {
    payoutService;
    constructor() {
        this.payoutService = new PayoutService();
    }
    async evaluateCity(city) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // 1. Evaluate News & Weather Hazards
        const newsSignalsCount = await prisma.newsSignal.count({
            where: { city, isStrongMatch: true, createdAt: { gte: today } }
        });
        const extremeWeather = await prisma.weatherMetric.findFirst({
            where: { city, isExtremeThreshold: true, recordedAt: { gte: today } }
        });
        // 2. Evaluate Ground Truth (Platform Activity)
        const todayActivity = await prisma.activityLog.aggregate({
            where: { city, date: today },
            _sum: { ordersCompleted: true }
        });
        const todayOrders = todayActivity._sum.ordersCompleted || 0;
        const HISTORICAL_AVG_ORDERS = 1000; // Mock baseline for the hackathon
        const activityDropRatio = todayOrders / HISTORICAL_AVG_ORDERS;
        // 3. Decision Matrix
        const isCrisis = newsSignalsCount > 2 || extremeWeather !== null;
        const isPlatformDead = activityDropRatio < 0.3; // 70% drop in orders
        const isDisrupted = isCrisis && isPlatformDead;
        const reason = isDisrupted
            ? `Disruption Verified: Signals(${newsSignalsCount}), WeatherAlert(${!!extremeWeather}), PlatformDrop(${(1 - activityDropRatio) * 100}%)`
            : 'Normal Operations';
        // 4. Log the Check
        const check = await prisma.disruptionCheck.create({
            data: {
                city,
                validNewsCount: newsSignalsCount,
                newsStatus: newsSignalsCount > 2,
                avgOrders: HISTORICAL_AVG_ORDERS,
                todayOrders,
                activityScore: activityDropRatio,
                disruption: isDisrupted,
                reason
            }
        });
        // 5. Trigger Event & Payouts
        if (isDisrupted) {
            const event = await prisma.event.create({
                data: {
                    city,
                    type: extremeWeather ? 'weather' : 'civic_strike',
                    status: 'active',
                    triggeredBy: 'Automated Intelligence Pipeline',
                    disruptionCheckId: check.id,
                    startTime: new Date()
                }
            });
            console.log(`🚨 CRISIS EVENT DECLARED IN ${city}: Triggering Payouts...`);
            await this.payoutService.executeEventPayouts(event.id, city);
        }
    }
}
//# sourceMappingURL=disruption.service.js.map