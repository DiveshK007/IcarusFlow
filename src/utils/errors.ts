/**
 * Structured Error Handling
 * 
 * All errors in IcarusFlow follow a consistent structure:
 * - Clear error type/code
 * - Human-readable message
 * - Failed step identification (if applicable)
 * - Recovery suggestions
 * 
 * NO stack traces are ever exposed in API responses.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'PLANNING_ERROR'
  | 'COMPILATION_ERROR'
  | 'POLICY_VIOLATION'
  | 'EXECUTION_ERROR'
  | 'TASK_TIMEOUT'
  | 'TASK_FAILED'
  | 'CHAIN_ERROR'
  | 'CONNECTOR_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

export interface IcarusError {
  code: ErrorCode;
  message: string;
  failedStep?: {
    stepNumber: number;
    taskId: string;
    taskName: string;
    taskType: string;
  };
  recovery?: string;
  details?: Record<string, unknown>;
  // Internal only - never exposed in API
  _internal?: {
    stack?: string;
    originalError?: Error;
  };
}

/**
 * Create a structured error
 */
export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    failedStep?: IcarusError['failedStep'];
    recovery?: string;
    details?: Record<string, unknown>;
    originalError?: Error;
  }
): IcarusError {
  return {
    code,
    message,
    failedStep: options?.failedStep,
    recovery: options?.recovery || getDefaultRecovery(code),
    details: options?.details,
    _internal: options?.originalError ? {
      stack: options.originalError.stack,
      originalError: options.originalError,
    } : undefined,
  };
}

/**
 * Format error for API response (safe, no internal details)
 */
export function formatErrorForApi(error: IcarusError): object {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.failedStep && { failedStep: error.failedStep }),
      ...(error.recovery && { recovery: error.recovery }),
      ...(error.details && { details: error.details }),
    },
  };
}

/**
 * Format error for logs (includes internal details)
 */
export function formatErrorForLog(error: IcarusError): object {
  return {
    code: error.code,
    message: error.message,
    failedStep: error.failedStep,
    details: error.details,
    stack: error._internal?.stack,
  };
}

/**
 * Get default recovery suggestion for error code
 */
function getDefaultRecovery(code: ErrorCode): string {
  const recoveries: Record<ErrorCode, string> = {
    VALIDATION_ERROR: 'Check your request parameters and try again.',
    PLANNING_ERROR: 'Try rephrasing your request or use a predefined workflow.',
    COMPILATION_ERROR: 'Check workflow task dependencies and types.',
    POLICY_VIOLATION: 'Contact your administrator for access permissions.',
    EXECUTION_ERROR: 'The workflow can be retried. Check connector configurations.',
    TASK_TIMEOUT: 'Increase timeout or simplify the task parameters.',
    TASK_FAILED: 'Check task parameters and external service availability.',
    CHAIN_ERROR: 'Retry the workflow. Chain commits are atomic and safe to retry.',
    CONNECTOR_ERROR: 'Verify connector credentials and service availability.',
    CONFIGURATION_ERROR: 'Check environment variables and configuration files.',
    INTERNAL_ERROR: 'Contact support with the error details.',
  };
  return recoveries[code];
}

/**
 * Wrap unknown errors into structured format
 */
export function wrapError(err: unknown, context?: string): IcarusError {
  if (isIcarusError(err)) {
    return err;
  }

  const originalError = err instanceof Error ? err : new Error(String(err));
  const message = context 
    ? `${context}: ${originalError.message}`
    : originalError.message;

  return createError('INTERNAL_ERROR', message, {
    originalError,
  });
}

/**
 * Type guard for IcarusError
 */
export function isIcarusError(err: unknown): err is IcarusError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    typeof (err as IcarusError).code === 'string'
  );
}

/**
 * Error factory functions for common cases
 */
export const Errors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    createError('VALIDATION_ERROR', message, { details }),

  planning: (message: string, recovery?: string) =>
    createError('PLANNING_ERROR', message, { recovery }),

  policyViolation: (message: string, policy: string, taskId?: string) =>
    createError('POLICY_VIOLATION', message, {
      details: { violatedPolicy: policy },
      failedStep: taskId ? { stepNumber: 0, taskId, taskName: '', taskType: '' } : undefined,
    }),

  taskFailed: (
    message: string,
    step: { stepNumber: number; taskId: string; taskName: string; taskType: string },
    originalError?: Error
  ) =>
    createError('TASK_FAILED', message, {
      failedStep: step,
      originalError,
    }),

  timeout: (taskId: string, taskName: string, timeoutMs: number) =>
    createError('TASK_TIMEOUT', `Task "${taskName}" timed out after ${timeoutMs}ms`, {
      failedStep: { stepNumber: 0, taskId, taskName, taskType: '' },
      recovery: `Increase timeout or optimize the task. Current limit: ${timeoutMs}ms`,
    }),

  chain: (message: string, originalError?: Error) =>
    createError('CHAIN_ERROR', message, { originalError }),

  connector: (connectorType: string, message: string, originalError?: Error) =>
    createError('CONNECTOR_ERROR', `${connectorType}: ${message}`, {
      details: { connector: connectorType },
      originalError,
    }),
};
