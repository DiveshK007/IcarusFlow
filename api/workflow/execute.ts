import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// Request validation schema
const ExecuteRequestSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  department: z.string().optional(),
  region: z.string().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Use POST method',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  // Validate request body
  const validation = ExecuteRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Request body validation failed',
      details: validation.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      code: 'VALIDATION_ERROR',
    });
  }

  const { prompt, userId, roles, department, region } = validation.data;
  const startTime = Date.now();

  try {
    // Dynamic import to avoid build issues
    const { IcarusFlow } = await import('../../src/index.js');
    
    const icarus = new IcarusFlow();

    const policyContext = {
      userId: userId || 'api-user',
      roles: roles || ['analyst'],
      department: department || 'operations',
      dataClassifications: ['internal', 'public'],
      timestamp: new Date(),
      region: region || 'us',
    };

    const result = await icarus.processRequest(prompt, policyContext);
    const executionTimeMs = Date.now() - startTime;

    return res.status(200).json({
      success: result.success,
      flowId: result.flow?.id,
      status: result.flow?.status,
      chainCommitHash: result.chainCommitHash,
      error: result.error,
      executionTimeMs,
      tasks: result.flow?.tasks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        executionTimeMs: t.result?.executionTimeMs,
        error: t.result?.error,
      })),
    });
  } catch (error) {
    console.error('Workflow execution failed:', error);
    return res.status(500).json({ 
      error: 'Workflow execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'EXECUTION_ERROR',
    });
  }
}
