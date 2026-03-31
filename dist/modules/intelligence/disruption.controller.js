import { DisruptionService } from './disruption.service.js';
export class DisruptionController {
    disruptionService;
    constructor() {
        this.disruptionService = new DisruptionService();
    }
    /**
     * Manually trigger disruption evaluation for a city
     * Used for hackathon demo and testing
     */
    async evaluateDisruption(req, res) {
        try {
            const { city } = req.body;
            if (!city) {
                res.status(400).json({ error: 'City is required' });
                return;
            }
            console.log(`[DISRUPTION CONTROLLER] Evaluating disruption for ${city}`);
            await this.disruptionService.evaluateCity(city);
            res.status(200).json({
                message: `Disruption evaluation completed for ${city}. Check logs for payout execution.`,
                city,
            });
        }
        catch (error) {
            console.error('[DISRUPTION CONTROLLER ERROR]', error);
            res.status(500).json({ error: 'Disruption evaluation failed' });
        }
    }
    /**
     * Get recent disruption checks for a city
     */
    async getDisruptionHistory(req, res) {
        try {
            const city = Array.isArray(req.params.city) ? req.params.city[0] : req.params.city;
            if (!city) {
                res.status(400).json({ error: 'City parameter is required' });
                return;
            }
            const disruptionChecks = await this.disruptionService.getRecentChecks(city);
            res.status(200).json({
                city,
                checks: disruptionChecks,
                count: disruptionChecks.length,
            });
        }
        catch (error) {
            console.error('[DISRUPTION CONTROLLER ERROR]', error);
            res.status(500).json({ error: 'Failed to retrieve disruption history' });
        }
    }
    /**
     * Health check for disruption service
     */
    async health(req, res) {
        res.status(200).json({
            status: 'healthy',
            service: 'DisruptionService',
            timestamp: new Date().toISOString(),
        });
    }
}
//# sourceMappingURL=disruption.controller.js.map