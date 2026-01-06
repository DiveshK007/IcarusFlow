/**
 * API Request/Response Schemas
 * 
 * Zod schemas for validating API inputs and documenting response types.
 * These ensure type safety at runtime for all API endpoints.
 */

import { z } from 'zod';

// ============================================
// Common Types
// ============================================

export const PolicyContextSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  roles: z.array(z.string()).min(1, 'At least one role is required'),
  department: z.string().optional().default('default'),
  dataClassifications: z.array(z.string()).optional().default(['public']),
  region: z.string().optional().default('us'),
});

export type PolicyContextInput = z.infer<typeof PolicyContextSchema>;

export const TaskTypeSchema = z.enum([
  'SNOWFLAKE_QUERY',
  'S3_UPLOAD',
  'S3_DOWNLOAD',
  'EMAIL_SEND',
  'CONFLUENCE_PUBLISH',
  'IMFS_STORE',
  'IMFS_RETRIEVE',
  'QUIVER_INDEX',
  'QUIVER_SEARCH',
  'DATA_TRANSFORM',
  'CONDITIONAL_BRANCH',
  'HUMAN_APPROVAL',
  'CUSTOM',
]);

// ============================================
// POST /api/workflow/execute
// ============================================

export const ExecuteWorkflowRequestSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  department: z.string().optional(),
  region: z.string().optional(),
});

export type ExecuteWorkflowRequest = z.infer<typeof ExecuteWorkflowRequestSchema>;

export const TaskResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED']),
  executionTimeMs: z.number().optional(),
  error: z.string().optional(),
});

export const ExecuteWorkflowResponseSchema = z.object({
  success: z.boolean(),
  flowId: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMMITTED', 'FAILED', 'ROLLED_BACK']).optional(),
  chainCommitHash: z.string().optional(),
  error: z.string().optional(),
  tasks: z.array(TaskResultSchema).optional(),
  executionTimeMs: z.number().optional(),
});

export type ExecuteWorkflowResponse = z.infer<typeof ExecuteWorkflowResponseSchema>;

// ============================================
// POST /api/workflow/execute-plan
// ============================================

export const PlannedTaskSchema = z.object({
  taskType: TaskTypeSchema,
  description: z.string(),
  params: z.record(z.unknown()).optional().default({}),
  dependencies: z.array(z.string()).optional().default([]),
  estimatedDurationMs: z.number().optional().default(5000),
});

export const WorkflowPlanSchema = z.object({
  id: z.string().optional(),
  intent: z.object({
    rawInput: z.string(),
    parsedIntent: z.string(),
    confidence: z.number().min(0).max(1),
    entities: z.array(z.object({
      type: z.string(),
      value: z.string(),
    })).optional().default([]),
  }).optional(),
  tasks: z.array(PlannedTaskSchema).min(1, 'At least one task is required'),
  riskAssessment: z.object({
    overallRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    dataAccessRisks: z.array(z.string()).optional().default([]),
    complianceFlags: z.array(z.string()).optional().default([]),
    recommendations: z.array(z.string()).optional().default([]),
  }).optional(),
});

export const ExecutePlanRequestSchema = z.object({
  plan: WorkflowPlanSchema,
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  department: z.string().optional(),
  region: z.string().optional(),
});

export type ExecutePlanRequest = z.infer<typeof ExecutePlanRequestSchema>;

// Response is same as ExecuteWorkflowResponse

// ============================================
// POST /api/workflow/verify
// ============================================

export const VerifyWorkflowRequestSchema = z.object({
  flowId: z.string().uuid('Invalid flow ID format'),
  workflowHash: z.string().optional(),
});

export type VerifyWorkflowRequest = z.infer<typeof VerifyWorkflowRequestSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: z.string(),
  taskId: z.string().optional(),
  flowId: z.string(),
  actor: z.string(),
  action: z.string(),
  inputHash: z.string(),
  outputHash: z.string().optional(),
});

export const VerifyWorkflowResponseSchema = z.object({
  valid: z.boolean(),
  flowId: z.string(),
  commit: z.object({
    transactionHash: z.string(),
    blockNumber: z.number(),
    timestamp: z.string(),
    workflowHash: z.string(),
    stateRoot: z.string(),
  }).optional(),
  auditLog: z.array(AuditEntrySchema).optional(),
  error: z.string().optional(),
});

export type VerifyWorkflowResponse = z.infer<typeof VerifyWorkflowResponseSchema>;

// ============================================
// GET /api/workflow/:id
// ============================================

export const GetWorkflowResponseSchema = z.object({
  flow: z.object({
    id: z.string(),
    workflowId: z.string(),
    status: z.string(),
    tasks: z.array(TaskResultSchema),
    metadata: z.object({
      name: z.string(),
      description: z.string(),
      createdAt: z.string(),
      createdBy: z.string(),
    }),
    chainCommitHash: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type GetWorkflowResponse = z.infer<typeof GetWorkflowResponseSchema>;

// ============================================
// Error Response
// ============================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
  })).optional(),
  code: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================
// Validation Helper
// ============================================

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ErrorResponse } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  return {
    success: false,
    error: {
      error: 'Validation failed',
      message: 'Request body validation failed',
      details,
      code: 'VALIDATION_ERROR',
    },
  };
}
