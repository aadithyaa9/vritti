import { PremiumService } from './premium.service.js';
export class PremiumController {
    premiumService;
    constructor() {
        this.premiumService = new PremiumService();
    }
    /**
     * Manually trigger weekly premium renewals
     * Used for hackathon demo and testing
     */
    async triggerWeeklyRenewals(req, res) {
        try {
            console.log('[PREMIUM CONTROLLER] Manual weekly renewal triggered');
            await this.premiumService.processWeeklyRenewals();
            res.status(200).json({
                message: 'Weekly policy renewals completed successfully.',
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error('[PREMIUM CONTROLLER ERROR]', error);
            res.status(500).json({ error: 'Weekly renewal process failed' });
        }
    }
    /**
     * Get active policies for a user
     */
    async getUserPolicies(req, res) {
        try {
            const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
            if (!userId) {
                res.status(400).json({ error: 'User ID is required' });
                return;
            }
            const policies = await this.premiumService.getUserActivePolicies(userId);
            res.status(200).json({
                userId,
                policies,
                count: policies.length,
            });
        }
        catch (error) {
            console.error('[PREMIUM CONTROLLER ERROR]', error);
            res.status(500).json({ error: 'Failed to retrieve policies' });
        }
    }
    /**
     * Get premium estimate
     */
    async getPremiumEstimate(req, res) {
        try {
            const estimate = this.premiumService.calculatePremiumEstimate();
            res.status(200).json({
                basePremium: 150.0,
                estimatedFinalPremium: estimate,
                currency: 'INR',
                description: 'Average premium after risk multiplier and loyalty discount',
            });
        }
        catch (error) {
            console.error('[PREMIUM CONTROLLER ERROR]', error);
            res.status(500).json({ error: 'Failed to calculate premium estimate' });
        }
    }
    /**
     * Health check for premium service
     */
    async health(req, res) {
        res.status(200).json({
            status: 'healthy',
            service: 'PremiumService',
            timestamp: new Date().toISOString(),
        });
    }
}
//# sourceMappingURL=premium.controller.js.map