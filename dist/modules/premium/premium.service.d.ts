export declare class PremiumService {
    private readonly BASE_PREMIUM;
    private readonly LOYALTY_DISCOUNT;
    /**
     * Process weekly premium renewals for all active users.
     * Calculates dynamic premiums based on risk multiplier and applies discount.
     * Uses atomic transactions for wallet deduction and policy creation.
     */
    processWeeklyRenewals(): Promise<void>;
    /**
     * Calculate the next Sunday at 00:00
     */
    private getNextSunday;
    /**
     * Optional: Get active policies for a user
     */
    getUserActivePolicies(userId: string): Promise<any[]>;
    /**
     * Optional: Calculate premium estimate for a user
     */
    calculatePremiumEstimate(): number;
}
//# sourceMappingURL=premium.service.d.ts.map