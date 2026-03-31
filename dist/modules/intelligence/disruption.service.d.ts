export declare class DisruptionService {
    private payoutService;
    constructor();
    /**
     * Core evaluation logic: Query news signals, weather metrics, and platform activity.
     * If both signals are high AND activity dropped 70%, declare disruption and trigger payouts.
     */
    evaluateCity(city: string): Promise<void>;
    /**
     * Retrieve recent disruption checks for a city (last 24 hours)
     */
    getRecentChecks(city: string): Promise<any[]>;
}
//# sourceMappingURL=disruption.service.d.ts.map