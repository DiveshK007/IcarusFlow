import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Task type enum
const TaskTypeSchema = z.enum([
  'SNOWFLAKE_QUERY', 'S3_UPLOAD', 'S3_DOWNLOAD', 'EMAIL_SEND',
  'CONFLUENCE_PUBLISH', 'IMFS_STORE', 'IMFS_RETRIEVE',
  'QUIVER_INDEX', 'QUIVER_SEARCH', 'DATA_TRANSFORM',
  'CONDITIONAL_BRANCH', 'HUMAN_APPROVAL', 'CUSTOM',
]);

// Request validation schema
const ExecutePlanRequestSchema = z.object({
  plan: z.object({
    id: z.string().optional(),
    intent: z.object({
      rawInput: z.string(),
      parsedIntent: z.string(),
      confidence: z.number().min(0).max(1),
      entities: z.array(z.any()).optional().default([]),
    }).optional(),
    tasks: z.array(z.object({
      taskType: TaskTypeSchema,
      description: z.string(),
      params: z.record(z.unknown()).optional().default({}),
      dependencies: z.array(z.string()).optional().default([]),
      estimatedDurationMs: z.number().optional().default(5000),
    })).min(1, 'At least one task is required'),
    estimatedDurationMs: z.number().optional(),
    riskAssessment: z.object({
      overallRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      dataAccessRisks: z.array(z.string()).optional().default([]),
      complianceFlags: z.array(z.string()).optional().default([]),
      recommendations: z.array(z.string()).optional().default([]),
    }).optional(),
  }),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  department: z.string().optional(),
  region: z.string().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const executionId = uuidv4();
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
      executionId,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST method to execute workflow plans',
        recovery: 'Send a POST request with a valid workflow plan in the body.',
      },
      executionTimeMs: Date.now() - startTime,
    });
  }

  // Validate request body
  const validation = ExecutePlanRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      executionId,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        recovery: 'Check the request body format and ensure all required fields are present.',
      },
      executionTimeMs: Date.now() - startTime,
    });
  }

  const { plan: inputPlan, userId, roles, department, region } = validation.data;

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

    // Build complete WorkflowPlan with defaults
    const totalDuration = inputPlan.tasks.reduce((sum, t) => sum + (t.estimatedDurationMs || 5000), 0);
    const requiredConnectors = [...new Set(inputPlan.tasks.map(t => t.taskType))];

    const workflowPlan = {
      id: inputPlan.id || uuidv4(),
      intent: inputPlan.intent || {
        rawInput: 'API workflow execution',
        parsedIntent: 'Execute predefined workflow plan',
        confidence: 1.0,
        entities: [],
      },
      tasks: inputPlan.tasks,
      estimatedDurationMs: inputPlan.estimatedDurationMs || totalDuration,
      requiredConnectors,
      riskAssessment: inputPlan.riskAssessment || {
        overallRisk: 'LOW' as const,
        dataAccessRisks: [],
        complianceFlags: [],
        recommendations: [],
      },
    };

    const result = await icarus.executePlan(workflowPlan, policyContext);
    const executionTimeMs = Date.now() - startTime;

    return res.status(200).json({
      success: result.success,
      executionId,
      flowId: result.flow?.id,
      status: result.flow?.status,
      chainCommitHash: result.chainCommitHash,
      executionTimeMs,
      tasks: result.flow?.tasks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        outputHash: t.result?.outputHash,
        executionTimeMs: t.result?.executionTimeMs,
      })),
      ...(result.error && {
        error: {
          code: 'TASK_EXECUTION_ERROR',
          message: result.error,
          recovery: 'Check task parameters and connector availability.',
        },
      }),
    });
  } catch (error) {
    console.error('Workflow execution failed:', error);
    return res.status(500).json({
      success: false,
      executionId,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during workflow execution',
        recovery: 'Please try again or contact support if the issue persists.',
      },
      executionTimeMs: Date.now() - startTime,
    });
  }
}
