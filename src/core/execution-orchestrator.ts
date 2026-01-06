/**
 * Execution Orchestrator
 * 
 * Implements the Finite State Machine (FSM) for workflow execution.
 * 
 * States: PENDING → RUNNING → COMMITTED → FAILED
 * 
 * Each state transition:
 * - Emits an on-chain event
 * - Includes hash of inputs/outputs
 * 
 * Why FSM?
 * - Predictable recovery
 * - Replayability
 * - Clear failure semantics
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Flow,
  Task,
  TaskStatus,
  WorkflowStatus,
  ExecutionContext,
  ExecutorResult,
  AuditEntry,
  AuditEventType,
  TaskResult,
} from '../types/index.js';
import { WorkflowCompiler } from './workflow-compiler.js';
import { PolicyValidator, type PolicyContext } from './policy-validator.js';
import { ChainAuditLogger } from '../chain/audit-logger.js';
import { createHash } from 'crypto';

export interface ExecutorRegistry {
  [taskType: string]: TaskExecutor;
}

export interface TaskExecutor {
  execute(task: Task, context: ExecutionContext): Promise<ExecutorResult>;
  validate?(task: Task): boolean;
  cleanup?(task: Task, context: ExecutionContext): Promise<void>;
}

export interface OrchestratorConfig {
  maxRetries: number;
  defaultTimeoutMs: number;
  enablePolicyCheck: boolean;
  enableAuditLog: boolean;
  checkpointInterval: number;
}

export interface ExecutionResult {
  success: boolean;
  flow: Flow;
  completedTasks: string[];
  failedTask?: string;
  error?: string;
  chainCommitHash?: string;
}

export class ExecutionOrchestrator {
  private compiler: WorkflowCompiler;
  private policyValidator: PolicyValidator;
  private auditLogger: ChainAuditLogger;
  private executors: ExecutorRegistry;
  private config: OrchestratorConfig;

  constructor(
    compiler: WorkflowCompiler,
    policyValidator: PolicyValidator,
    auditLogger: ChainAuditLogger,
    config: Partial<OrchestratorConfig> = {}
  ) {
    this.compiler = compiler;
    this.policyValidator = policyValidator;
    this.auditLogger = auditLogger;
    this.executors = {};
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
      enablePolicyCheck: config.enablePolicyCheck ?? true,
      enableAuditLog: config.enableAuditLog ?? true,
      checkpointInterval: config.checkpointInterval ?? 1,
    };
  }

  /**
   * Register a task executor
   */
  registerExecutor(taskType: string, executor: TaskExecutor): void {
    this.executors[taskType] = executor;
  }

  /**
   * Execute a compiled flow
   */
  async executeFlow(
    flow: Flow,
    policyContext: PolicyContext
  ): Promise<ExecutionResult> {
    const completedTasks: string[] = [];
    const context = this.createExecutionContext(flow);

    try {
      // Phase 1: Policy validation
      if (this.config.enablePolicyCheck) {
        const policyResult = await this.policyValidator.validateFlow(flow, policyContext);
        flow.policyCheckResults = policyResult.results;

        if (!policyResult.valid) {
          await this.logAuditEvent(flow, 'WORKFLOW_FAILED', {
            reason: 'Policy validation failed',
            blockedTasks: policyResult.blockedTasks,
          });

          flow.status = 'FAILED';
          return {
            success: false,
            flow,
            completedTasks,
            error: `Policy validation failed: ${policyResult.blockedTasks.join(', ')} blocked`,
          };
        }

        // Handle tasks requiring approval
        if (policyResult.requiresApproval.length > 0) {
          // In production, this would trigger a human-in-the-loop flow
          console.warn(`Tasks requiring approval: ${policyResult.requiresApproval.join(', ')}`);
        }
      }

      // Phase 2: Start workflow
      flow.status = 'RUNNING';
      await this.logAuditEvent(flow, 'WORKFLOW_STARTED', {
        taskCount: flow.tasks.length,
        policyContext: { userId: policyContext.userId, roles: policyContext.roles },
      });

      // Phase 3: Execute tasks in topological order
      const executionOrder = this.compiler.getExecutionOrder(flow);

      for (const task of executionOrder) {
        // Check if dependencies are satisfied
        const dependenciesMet = this.checkDependencies(task, flow);
        if (!dependenciesMet) {
          task.status = 'SKIPPED';
          continue;
        }

        // Execute task with retries
        const result = await this.executeTaskWithRetry(task, context, flow);

        if (result.success) {
          task.status = 'SUCCESS';
          task.result = this.createTaskResult(result);
          completedTasks.push(task.id);

          // Store result in context for downstream tasks
          context.variables.set(task.id, result.data);
        } else {
          task.status = 'FAILED';
          task.result = this.createTaskResult(result);

          // Handle failure - rollback or continue based on config
          await this.handleTaskFailure(task, flow, context);

          flow.status = 'FAILED';
          return {
            success: false,
            flow,
            completedTasks,
            failedTask: task.id,
            error: result.error?.message || 'Task execution failed',
          };
        }

        // Checkpoint progress
        if (completedTasks.length % this.config.checkpointInterval === 0) {
          await this.checkpoint(flow, context);
        }
      }

      // Phase 4: Commit to chain
      flow.status = 'COMMITTED';
      const commitHash = await this.commitToChain(flow);
      flow.chainCommitHash = commitHash;

      await this.logAuditEvent(flow, 'WORKFLOW_COMPLETED', {
        completedTasks: completedTasks.length,
        chainCommitHash: commitHash,
      });

      return {
        success: true,
        flow,
        completedTasks,
        chainCommitHash: commitHash,
      };
    } catch (error) {
      flow.status = 'FAILED';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logAuditEvent(flow, 'WORKFLOW_FAILED', {
        error: errorMessage,
        completedTasks,
      });

      return {
        success: false,
        flow,
        completedTasks,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a single task with retry logic
   */
  private async executeTaskWithRetry(
    task: Task,
    context: ExecutionContext,
    flow: Flow
  ): Promise<ExecutorResult> {
    const executor = this.executors[task.type];
    
    if (!executor) {
      return {
        success: false,
        error: {
          code: 'EXECUTOR_NOT_FOUND',
          message: `No executor registered for task type: ${task.type}`,
          recoverable: false,
        },
        metrics: { durationMs: 0, retryCount: 0, bytesProcessed: 0, apiCallsCount: 0 },
      };
    }

    task.status = 'RUNNING';
    await this.logAuditEvent(flow, 'TASK_STARTED', { taskId: task.id, taskType: task.type });

    let lastError: ExecutorResult['error'];
    const maxRetries = task.maxRetries || this.config.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      task.retryCount = attempt;

      try {
        const result = await this.executeWithTimeout(
          executor.execute(task, context),
          task.timeoutMs || this.config.defaultTimeoutMs
        );

        if (result.success) {
          await this.logAuditEvent(flow, 'TASK_COMPLETED', {
            taskId: task.id,
            duration: result.metrics.durationMs,
            attempt,
          });
          return result;
        }

        lastError = result.error;

        // If error is not recoverable, don't retry
        if (result.error && !result.error.recoverable) {
          break;
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      } catch (error) {
        lastError = {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: true,
        };
      }
    }

    await this.logAuditEvent(flow, 'TASK_FAILED', {
      taskId: task.id,
      error: lastError?.message,
      attempts: task.retryCount + 1,
    });

    return {
      success: false,
      error: lastError,
      metrics: { durationMs: 0, retryCount: task.retryCount, bytesProcessed: 0, apiCallsCount: 0 },
    };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeout]);
  }

  /**
   * Check if all task dependencies are satisfied
   */
  private checkDependencies(task: Task, flow: Flow): boolean {
    for (const depId of task.dependencies) {
      const depTask = flow.tasks.find((t) => t.id === depId);
      if (!depTask || depTask.status !== 'SUCCESS') {
        return false;
      }
    }
    return true;
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(
    task: Task,
    flow: Flow,
    context: ExecutionContext
  ): Promise<void> {
    // Cleanup any resources
    const executor = this.executors[task.type];
    if (executor?.cleanup) {
      await executor.cleanup(task, context);
    }

    // Clear IMFS entries if needed
    if (context.imfsFiles.size > 0) {
      console.warn(`Rolling back ${context.imfsFiles.size} IMFS entries`);
      // In production, this would call the IMFS cleanup API
    }
  }

  /**
   * Create execution context
   */
  private createExecutionContext(flow: Flow): ExecutionContext {
    return {
      flowId: flow.id,
      currentTaskId: '',
      variables: new Map(),
      imfsFiles: new Map(),
      startTime: new Date(),
      timeout: this.config.defaultTimeoutMs,
    };
  }

  /**
   * Create task result from executor result
   */
  private createTaskResult(result: ExecutorResult): TaskResult {
    const dataString = JSON.stringify(result.data || {});
    const outputHash = createHash('sha256').update(dataString).digest('hex');

    return {
      success: result.success,
      data: result.data,
      error: result.error?.message,
      executionTimeMs: result.metrics.durationMs,
      outputHash,
    };
  }

  /**
   * Checkpoint workflow progress
   */
  private async checkpoint(flow: Flow, context: ExecutionContext): Promise<void> {
    // Store checkpoint for recovery
    const checkpointData = {
      flowId: flow.id,
      status: flow.status,
      completedTasks: flow.tasks.filter((t) => t.status === 'SUCCESS').map((t) => t.id),
      variables: Object.fromEntries(context.variables),
      timestamp: new Date(),
    };

    // In production, this would be stored on-chain or in a durable store
    console.log(`Checkpoint: ${JSON.stringify(checkpointData)}`);
  }

  /**
   * Commit workflow result to chain
   */
  private async commitToChain(flow: Flow): Promise<string> {
    const workflowHash = this.computeWorkflowHash(flow);
    return await this.auditLogger.commitWorkflow(flow, workflowHash);
  }

  /**
   * Compute workflow hash for chain commit
   */
  private computeWorkflowHash(flow: Flow): string {
    const data = {
      id: flow.id,
      workflowId: flow.workflowId,
      tasks: flow.tasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        outputHash: t.result?.outputHash,
      })),
      metadata: flow.metadata,
    };

    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    flow: Flow,
    eventType: AuditEventType,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.enableAuditLog) return;

    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      eventType,
      flowId: flow.id,
      actor: flow.metadata.createdBy,
      action: eventType,
      inputHash: createHash('sha256').update(JSON.stringify(metadata)).digest('hex'),
      metadata,
    };

    flow.auditTrail.push(entry);
    await this.auditLogger.logEvent(entry);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Recover workflow from checkpoint
   */
  async recoverFromCheckpoint(
    flow: Flow,
    checkpointData: unknown,
    policyContext: PolicyContext
  ): Promise<ExecutionResult> {
    // Restore context from checkpoint
    console.log('Recovering workflow from checkpoint...');
    
    // Mark already completed tasks
    const checkpoint = checkpointData as {
      completedTasks: string[];
      variables: Record<string, unknown>;
    };

    for (const taskId of checkpoint.completedTasks) {
      const task = flow.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'SUCCESS';
      }
    }

    // Continue execution
    return this.executeFlow(flow, policyContext);
  }
}
