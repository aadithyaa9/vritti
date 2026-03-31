import type { Request, Response } from 'express';
export declare class PremiumController {
    private premiumService;
    constructor();
    /**
     * Manually trigger weekly premium renewals
     * Used for hackathon demo and testing
     */
    triggerWeeklyRenewals(req: Request, res: Response): Promise<void>;
    /**
     * Get active policies for a user
     */
    getUserPolicies(req: Request, res: Response): Promise<void>;
    /**
     * Get premium estimate
     */
    getPremiumEstimate(req: Request, res: Response): Promise<void>;
    /**
     * Health check for premium service
     */
    health(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=premium.controller.d.ts.map