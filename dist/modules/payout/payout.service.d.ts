export declare class PayoutService {
    private readonly DAILY_PAYOUT_AMOUNT;
    /**
     * Execute atomic payouts for all affected users in a city.
     * Finds all active policies for the event period and pays out simultaneously.
     * Uses prisma.$transaction for financial safety.
     */
    executeEventPayouts(eventId: string, city: string): Promise<void>;
    /**
     * Optional: Get payout history for a user
     */
    getUserPayoutHistory(userId: string): Promise<any[]>;
    /**
     * Optional: Get aggregate payout stats for an event
     */
    getEventPayoutStats(eventId: string): Promise<any>;
}
//# sourceMappingURL=payout.service.d.ts.map