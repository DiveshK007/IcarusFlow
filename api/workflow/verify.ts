import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { flowId, workflowHash } = req.body;

    if (!flowId || !workflowHash) {
      return res.status(400).json({ error: 'flowId and workflowHash are required' });
    }

    // Dynamic import to avoid build issues
    const { IcarusFlow } = await import('../../src/index.js');
    
    const icarus = new IcarusFlow();

    const result = await icarus.verifyWorkflow(flowId, workflowHash);

    return res.status(200).json({
      flowId,
      valid: result.valid,
      commit: result.commit,
      auditLogCount: result.auditLog.length,
      verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Verification failed:', error);
    return res.status(500).json({ 
      error: 'Verification failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
