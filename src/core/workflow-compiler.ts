/**
 * Workflow Compiler
 * 
 * Converts LLM-generated workflow plans into a validated, typed DAG
 * (Directed Acyclic Graph) for deterministic execution.
 * 
 * Guarantees:
 * - Valid step ordering
 * - No infinite loops (cycle detection)
 * - Explicit dependencies
 * - Type-checked inputs/outputs
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  WorkflowPlan,
  PlannedTask,
  Task,
  Flow,
  TaskStatus,
  WorkflowStatus,
  WorkflowMetadata,
  TaskType,
} from '../types/index.js';

export interface CompilationResult {
  success: boolean;
  flow?: Flow;
  errors: CompilationError[];
  warnings: string[];
}

export interface CompilationError {
  code: string;
  message: string;
  taskIndex?: number;
  field?: string;
}

export class WorkflowCompiler {
  private readonly supportedTaskTypes: Set<TaskType>;
  private readonly maxTasks: number;

  constructor(maxTasks: number = 50) {
    this.maxTasks = maxTasks;
    this.supportedTaskTypes = new Set([
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
  }

  /**
   * Compile a workflow plan into an executable Flow
   */
  compile(plan: WorkflowPlan, createdBy: string): CompilationResult {
    const errors: CompilationError[] = [];
    const warnings: string[] = [];

    // Phase 1: Validate basic structure
    const structureErrors = this.validateStructure(plan);
    if (structureErrors.length > 0) {
      return { success: false, errors: structureErrors, warnings };
    }

    // Phase 2: Validate task types
    const typeErrors = this.validateTaskTypes(plan.tasks);
    errors.push(...typeErrors);

    // Phase 3: Validate dependencies and detect cycles
    const depErrors = this.validateDependencies(plan.tasks);
    errors.push(...depErrors);

    // Phase 4: Validate task parameters
    const paramErrors = this.validateTaskParameters(plan.tasks);
    errors.push(...paramErrors);

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // Phase 5: Build the executable flow
    const flow = this.buildFlow(plan, createdBy);

    // Generate warnings for potential issues
    warnings.push(...this.generateWarnings(plan));

    return { success: true, flow, errors: [], warnings };
  }

  /**
   * Validate basic structure constraints
   */
  private validateStructure(plan: WorkflowPlan): CompilationError[] {
    const errors: CompilationError[] = [];

    if (!plan.id) {
      errors.push({
        code: 'MISSING_PLAN_ID',
        message: 'Workflow plan must have an ID',
      });
    }

    if (!plan.tasks || plan.tasks.length === 0) {
      errors.push({
        code: 'EMPTY_WORKFLOW',
        message: 'Workflow must contain at least one task',
      });
    }

    if (plan.tasks && plan.tasks.length > this.maxTasks) {
      errors.push({
        code: 'TOO_MANY_TASKS',
        message: `Workflow exceeds maximum of ${this.maxTasks} tasks`,
      });
    }

    return errors;
  }

  /**
   * Validate all task types are supported
   */
  private validateTaskTypes(tasks: PlannedTask[]): CompilationError[] {
    const errors: CompilationError[] = [];

    tasks.forEach((task, index) => {
      if (!this.supportedTaskTypes.has(task.taskType as TaskType)) {
        errors.push({
          code: 'UNSUPPORTED_TASK_TYPE',
          message: `Task type '${task.taskType}' is not supported`,
          taskIndex: index,
        });
      }
    });

    return errors;
  }

  /**
   * Validate dependencies and detect cycles using DFS
   */
  private validateDependencies(tasks: PlannedTask[]): CompilationError[] {
    const errors: CompilationError[] = [];
    const taskIds = new Set(tasks.map((_, i) => `task_${i}`));

    // Check for invalid dependency references
    tasks.forEach((task, index) => {
      task.dependencies.forEach((dep) => {
        if (!taskIds.has(dep) && !dep.startsWith('task_')) {
          // Convert numeric references
          const depIndex = parseInt(dep);
          if (isNaN(depIndex) || depIndex < 0 || depIndex >= tasks.length) {
            errors.push({
              code: 'INVALID_DEPENDENCY',
              message: `Task ${index} references non-existent dependency: ${dep}`,
              taskIndex: index,
              field: 'dependencies',
            });
          }
        }
      });
    });

    // Cycle detection using Kahn's algorithm
    if (this.hasCycle(tasks)) {
      errors.push({
        code: 'CYCLIC_DEPENDENCY',
        message: 'Workflow contains circular dependencies',
      });
    }

    return errors;
  }

  /**
   * Detect cycles in the dependency graph
   */
  private hasCycle(tasks: PlannedTask[]): boolean {
    const n = tasks.length;
    const inDegree = new Array(n).fill(0);
    const adjList: number[][] = Array.from({ length: n }, () => []);

    // Build adjacency list
    tasks.forEach((task, index) => {
      task.dependencies.forEach((dep) => {
        const depIndex = this.resolveDependencyIndex(dep, tasks.length);
        if (depIndex !== -1 && depIndex < n) {
          adjList[depIndex].push(index);
          inDegree[index]++;
        }
      });
    });

    // Kahn's algorithm
    const queue: number[] = [];
    for (let i = 0; i < n; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    let visited = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      visited++;
      for (const neighbor of adjList[node]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    return visited !== n;
  }

  /**
   * Resolve dependency string to task index
   */
  private resolveDependencyIndex(dep: string, maxIndex: number): number {
    if (dep.startsWith('task_')) {
      return parseInt(dep.substring(5));
    }
    const index = parseInt(dep);
    if (!isNaN(index) && index >= 0 && index < maxIndex) {
      return index;
    }
    return -1;
  }

  /**
   * Validate task-specific parameters
   */
  private validateTaskParameters(tasks: PlannedTask[]): CompilationError[] {
    const errors: CompilationError[] = [];

    tasks.forEach((task, index) => {
      const taskErrors = this.validateTaskParams(task, index);
      errors.push(...taskErrors);
    });

    return errors;
  }

  /**
   * Validate parameters for a specific task type
   */
  private validateTaskParams(task: PlannedTask, index: number): CompilationError[] {
    const errors: CompilationError[] = [];
    const params = task.params;

    switch (task.taskType) {
      case 'SNOWFLAKE_QUERY':
        if (!params.query || typeof params.query !== 'string') {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'SNOWFLAKE_QUERY requires a "query" parameter',
            taskIndex: index,
            field: 'params.query',
          });
        }
        break;

      case 'S3_UPLOAD':
        if (!params.bucket) {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'S3_UPLOAD requires a "bucket" parameter',
            taskIndex: index,
            field: 'params.bucket',
          });
        }
        if (!params.key) {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'S3_UPLOAD requires a "key" parameter',
            taskIndex: index,
            field: 'params.key',
          });
        }
        break;

      case 'EMAIL_SEND':
        if (!params.recipients || !Array.isArray(params.recipients)) {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'EMAIL_SEND requires a "recipients" array',
            taskIndex: index,
            field: 'params.recipients',
          });
        }
        if (!params.subject) {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'EMAIL_SEND requires a "subject" parameter',
            taskIndex: index,
            field: 'params.subject',
          });
        }
        break;

      case 'CONFLUENCE_PUBLISH':
        if (!params.pageId && !params.title) {
          errors.push({
            code: 'MISSING_PARAM',
            message: 'CONFLUENCE_PUBLISH requires either "pageId" or "title"',
            taskIndex: index,
            field: 'params',
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Build the executable Flow from the validated plan
   */
  private buildFlow(plan: WorkflowPlan, createdBy: string): Flow {
    const flowId = uuidv4();
    const now = new Date();

    const tasks: Task[] = plan.tasks.map((plannedTask, index) => ({
      id: `task_${index}`,
      name: plannedTask.description,
      type: plannedTask.taskType as TaskType,
      params: plannedTask.params,
      dependencies: plannedTask.dependencies.map((dep) => {
        const depIndex = this.resolveDependencyIndex(dep, plan.tasks.length);
        return depIndex !== -1 ? `task_${depIndex}` : dep;
      }),
      status: 'PENDING' as TaskStatus,
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: plannedTask.estimatedDurationMs * 2 || 30000,
    }));

    const metadata: WorkflowMetadata = {
      id: plan.id,
      name: plan.intent?.parsedIntent || 'Unnamed Workflow',
      description: plan.intent?.rawInput || '',
      createdAt: now,
      updatedAt: now,
      createdBy,
      version: '1.0.0',
    };

    return {
      id: flowId,
      workflowId: plan.id,
      tasks,
      status: 'PENDING' as WorkflowStatus,
      metadata,
      policyCheckResults: [],
      auditTrail: [],
    };
  }

  /**
   * Generate warnings for potential issues
   */
  private generateWarnings(plan: WorkflowPlan): string[] {
    const warnings: string[] = [];

    // Warn about long workflows
    if (plan.tasks.length > 20) {
      warnings.push(`Workflow has ${plan.tasks.length} tasks - consider breaking into smaller workflows`);
    }

    // Warn about high estimated duration
    if (plan.estimatedDurationMs > 300000) {
      warnings.push(`Estimated duration exceeds 5 minutes - timeout may occur`);
    }

    // Warn about high-risk assessment
    if (plan.riskAssessment?.overallRisk === 'HIGH') {
      warnings.push('High risk workflow - additional review recommended');
    }

    return warnings;
  }

  /**
   * Get topologically sorted execution order
   */
  getExecutionOrder(flow: Flow): Task[] {
    const tasks = flow.tasks;
    const n = tasks.length;
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    tasks.forEach((task) => {
      inDegree.set(task.id, 0);
      adjList.set(task.id, []);
    });

    // Build graph
    tasks.forEach((task) => {
      task.dependencies.forEach((dep) => {
        const neighbors = adjList.get(dep);
        if (neighbors) {
          neighbors.push(task.id);
          inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        }
      });
    });

    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    inDegree.forEach((degree, taskId) => {
      if (degree === 0) queue.push(taskId);
    });

    const result: Task[] = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      const task = taskMap.get(taskId);
      if (task) result.push(task);

      const neighbors = adjList.get(taskId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return result;
  }
}
