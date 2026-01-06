import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = uuidv4();
  const startTime = Date.now();

  // CORS headers for demo accessibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      requestId,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST method to verify workflows',
        recovery: 'Send a POST request with flowId and workflowHash in the body.',
      },
      executionTimeMs: Date.now() - startTime,
    });
  }

  try {
    const { flowId, workflowHash } = req.body;

    if (!flowId || !workflowHash) {
      return res.status(400).json({
        success: false,
        requestId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'flowId and workflowHash are required',
          recovery: 'Provide both flowId and workflowHash from a previous workflow execution.',
        },
        executionTimeMs: Date.now() - startTime,
      });
    }

    // Dynamic import to avoid build issues
    const { IcarusFlow } = await import('../../src/index.js');
    
    const icarus = new IcarusFlow();

    const result = await icarus.verifyWorkflow(flowId, workflowHash);

    return res.status(200).json({
      success: true,
      requestId,
      flowId,
      valid: result.valid,
      commit: result.commit,
      auditLogCount: result.auditLog.length,
      verifiedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Verification failed:', error);
    return res.status(500).json({
      success: false,
      requestId,
      error: {
        code: 'VERIFICATION_ERROR',
        message: 'Failed to verify workflow',
        recovery: 'Ensure the flowId and workflowHash are valid and try again.',
      },
      executionTimeMs: Date.now() - startTime,
    });
  }
}
