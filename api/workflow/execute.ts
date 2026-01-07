import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// Request validation schema
const ExecuteRequestSchema = z.object({
  input: z.string().min(10, 'Input must be at least 10 characters').optional(),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').optional(),
  context: z.object({
    userId: z.string().optional(),
    role: z.string().optional(),
    department: z.string().optional(),
  }).optional(),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  department: z.string().optional(),
  region: z.string().optional(),
}).refine(data => data.input || data.prompt, {
  message: 'Either input or prompt must be provided',
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST method to execute workflows',
        recovery: 'Send a POST request with a JSON body containing the prompt.',
      },
      executionId,
    });
  }

  // Validate request body
  const validation = ExecuteRequestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        recovery: 'Check your request body matches the required schema.',
      },
      executionId,
    });
  }


  const { input, prompt, context, userId, roles, department, region } = validation.data;
  const workflowInput = input || prompt || '';
  const startTime = Date.now();

  try {
    // Dynamic import to avoid build issues
    const { IcarusFlow, buildExecutionTrace, formatTraceForApi } = await import('../../src/index.js');

    const icarus = new IcarusFlow({
      config: {
        execution: {
          maxWorkflowSteps: 50,
          defaultTimeoutMs: 30000,
          enablePolicyEnforcement: false, // Disabled for demo
          enableAuditLog: true,
          maxRetries: 3,
        },
      },
      autoRegisterExecutors: true,
    });

    const policyContext = {
      userId: context?.userId || userId || 'api-user',
      roles: context?.role ? [context.role, 'analyst', 'data_admin'] : (roles || ['analyst', 'data_admin', 'compliance_officer', 'admin']),
      department: context?.department || department || 'operations',
      dataClassifications: ['internal', 'public', 'confidential', 'pii'],
      timestamp: new Date(),
      region: region || 'us',
    };

    const result = await icarus.processRequest(workflowInput, policyContext);
    const executionTimeMs = Date.now() - startTime;

    // Build execution trace for response
    const trace = result.flow ? formatTraceForApi(buildExecutionTrace(result.flow)) : null;

    if (result.success) {
      return res.status(200).json({
        success: true,
        executionId,
        flowId: result.flow?.id,
        status: result.flow?.status,
        tasks: result.flow?.tasks.map(t => ({
          id: t.id,
          type: t.type,
          name: t.name || t.type,
          status: t.status,
          result: t.result,
        })),
        chainCommitHash: result.chainCommitHash,
        chainCommit: result.chainCommitHash ? {
          transactionHash: result.chainCommitHash,
        } : null,
        executionTimeMs,
        trace,
      });
    } else {
      // Find failed step if any
      const failedTask = result.flow?.tasks.find(t => t.status === 'FAILED');
      const failedStepIndex = failedTask
        ? result.flow?.tasks.indexOf(failedTask)
        : undefined;

      return res.status(400).json({
        success: false,
        executionId,
        flowId: result.flow?.id,
        error: {
          code: 'EXECUTION_ERROR',
          message: result.error || 'Workflow execution failed',
          ...(failedTask && {
            failedStep: {
              stepNumber: (failedStepIndex ?? 0) + 1,
              taskId: failedTask.id,
              taskName: failedTask.name,
              taskType: failedTask.type,
            },
          }),
          recovery: 'Check task parameters and retry, or use a predefined workflow.',
        },
        executionTimeMs,
        trace,
      });
    }
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    console.error(`[${executionId}] Workflow execution error:`, error);

    return res.status(500).json({
      success: false,
      executionId,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during workflow execution',
        recovery: 'Please try again or contact support if the issue persists.',
      },
      executionTimeMs,
    });
  }
}
