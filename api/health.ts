import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse): VercelResponse {
  return res.status(200).json({
    status: 'healthy',
    service: 'IcarusFlow',
    description: 'Multi-Step Agentic Workflows on Icarus - Deterministic AI Workflow Execution on Blockchain',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: [
      'LLM-powered natural language workflow planning',
      'Deterministic DAG-based execution',
      'Policy enforcement (RBAC, rate limits, data classification)',
      'On-chain audit logging with cryptographic verification',
      'MCP connector architecture (Snowflake, S3, Email, etc.)'
    ],
    endpoints: {
      health: 'GET /api/health',
      execute: 'POST /api/workflow/execute - Execute workflow from natural language',
      executePlan: 'POST /api/workflow/execute-plan - Execute predefined workflow plan',
      verify: 'POST /api/workflow/verify - Verify workflow on chain'
    },
    github: 'https://github.com/DiveshK007/IcarusFlow'
  });
}
