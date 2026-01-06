/**
 * Base Executor Interface
 * 
 * All MCP connectors implement this interface.
 * 
 * Key constraint: Executors cannot invent actions.
 * They can only:
 * - Execute predefined MCP connectors
 * - Within strict parameter bounds
 * 
 * Each executor:
 * - Runs in WASM sandbox (simulated in this implementation)
 * - Has zero long-term memory
 * - Returns deterministic outputs
 */

import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  ExecutionError,
  ExecutionMetrics,
} from '../types/index.js';

export abstract class BaseExecutor {
  protected name: string;
  protected version: string;

  constructor(name: string, version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  /**
   * Execute the task - must be implemented by each connector
   */
  abstract execute(task: Task, context: ExecutionContext): Promise<ExecutorResult>;

  /**
   * Validate task parameters before execution
   */
  abstract validate(task: Task): boolean;

  /**
   * Cleanup any resources after execution
   */
  async cleanup(task: Task, context: ExecutionContext): Promise<void> {
    // Default: no cleanup needed
  }

  /**
   * Create a successful result
   */
  protected success(data: unknown, metrics: Partial<ExecutionMetrics> = {}): ExecutorResult {
    return {
      success: true,
      data,
      metrics: {
        durationMs: metrics.durationMs ?? 0,
        retryCount: metrics.retryCount ?? 0,
        bytesProcessed: metrics.bytesProcessed ?? 0,
        apiCallsCount: metrics.apiCallsCount ?? 1,
      },
    };
  }

  /**
   * Create a failure result
   */
  protected failure(
    error: Partial<ExecutionError>,
    metrics: Partial<ExecutionMetrics> = {}
  ): ExecutorResult {
    return {
      success: false,
      error: {
        code: error.code ?? 'EXECUTION_FAILED',
        message: error.message ?? 'Execution failed',
        recoverable: error.recoverable ?? true,
        details: error.details,
      },
      metrics: {
        durationMs: metrics.durationMs ?? 0,
        retryCount: metrics.retryCount ?? 0,
        bytesProcessed: metrics.bytesProcessed ?? 0,
        apiCallsCount: metrics.apiCallsCount ?? 0,
      },
    };
  }

  /**
   * Measure execution time
   */
  protected async timed<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await fn();
    return { result, durationMs: Date.now() - start };
  }

  /**
   * Get executor info
   */
  getInfo(): { name: string; version: string } {
    return { name: this.name, version: this.version };
  }
}
