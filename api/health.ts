import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'healthy',
    service: 'IcarusFlow',
    description: 'Multi-Step Agentic Workflows on Icarus',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      execute: 'POST /api/workflow/execute',
      executePlan: 'POST /api/workflow/execute-plan',
      verify: 'POST /api/workflow/verify'
    }
  });
}
