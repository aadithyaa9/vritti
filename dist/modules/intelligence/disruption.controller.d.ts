import type { Request, Response } from 'express';
export declare class DisruptionController {
    private disruptionService;
    constructor();
    /**
     * Manually trigger disruption evaluation for a city
     * Used for hackathon demo and testing
     */
    evaluateDisruption(req: Request, res: Response): Promise<void>;
    /**
     * Get recent disruption checks for a city
     */
    getDisruptionHistory(req: Request, res: Response): Promise<void>;
    /**
     * Health check for disruption service
     */
    health(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=disruption.controller.d.ts.map