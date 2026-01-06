import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { prompt, userId, roles, department, region } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Dynamic import to avoid build issues
    const { IcarusFlow } = await import('../../src/index.js');
    
    const icarus = new IcarusFlow();

    const policyContext = {
      userId: userId || 'vercel-user',
      roles: roles || ['analyst'],
      department: department || 'operations',
      dataClassifications: ['internal', 'public'],
      timestamp: new Date(),
      region: region || 'us',
    };

    const result = await icarus.processRequest(prompt, policyContext);

    return res.status(200).json({
      success: result.success,
      flowId: result.flow?.id,
      status: result.flow?.status,
      chainCommitHash: result.chainCommitHash,
      error: result.error,
      tasks: result.flow?.tasks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status
      }))
    });
  } catch (error) {
    console.error('Workflow execution failed:', error);
    return res.status(500).json({ 
      error: 'Workflow execution failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
