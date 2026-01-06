/**
 * IcarusFlow - Multi-Step Agentic Workflows on Icarus
 * 
 * A deterministic, auditable, policy-aware execution layer
 * that binds probabilistic LLM reasoning to verifiable on-chain state transitions.
 * 
 * @module icarusflow
 */

// Re-export all modules
export * from './types/index.js';
export * from './core/index.js';
export * from './planner/index.js';
export * from './connectors/index.js';
export * from './chain/index.js';
export * from './utils/index.js';

// Main IcarusFlow class
import { WorkflowCompiler } from './core/workflow-compiler.js';
import { PolicyValidator, getDefaultPolicies, type PolicyContext } from './core/policy-validator.js';
import { ExecutionOrchestrator, type TaskExecutor } from './core/execution-orchestrator.js';
import { LLMPlanner } from './planner/llm-planner.js';
import { ChainAuditLogger } from './chain/audit-logger.js';
import { SnowflakeExecutor } from './connectors/snowflake-executor.js';
import { S3UploadExecutor } from './connectors/s3-executor.js';
import { EmailSendExecutor } from './connectors/email-executor.js';
import { DataTransformExecutor } from './connectors/data-transform-executor.js';
import { IMFSStoreExecutor, IMFSRetrieveExecutor } from './connectors/imfs-executor.js';
import { loadConfig, validateConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import type { IcarusConfig, Flow, WorkflowPlan } from './types/index.js';

export interface IcarusFlowOptions {
  config?: Partial<IcarusConfig>;
  autoRegisterExecutors?: boolean;
}

export class IcarusFlow {
  private config: IcarusConfig;
  private compiler: WorkflowCompiler;
  private policyValidator: PolicyValidator;
  private orchestrator: ExecutionOrchestrator;
  private planner: LLMPlanner;
  private auditLogger: ChainAuditLogger;

  constructor(options: IcarusFlowOptions = {}) {
    // Load and merge configuration
    const baseConfig = loadConfig();
    this.config = {
      ...baseConfig,
      ...options.config,
      llm: { ...baseConfig.llm, ...options.config?.llm },
      chain: { ...baseConfig.chain, ...options.config?.chain },
      connectors: { ...baseConfig.connectors, ...options.config?.connectors },
      execution: { ...baseConfig.execution, ...options.config?.execution },
    };

    // Initialize components
    this.compiler = new WorkflowCompiler(this.config.execution.maxWorkflowSteps);
    this.policyValidator = new PolicyValidator(this.config.policies || getDefaultPolicies());
    this.auditLogger = new ChainAuditLogger(this.config.chain);
    this.orchestrator = new ExecutionOrchestrator(
      this.compiler,
      this.policyValidator,
      this.auditLogger,
      {
        maxRetries: this.config.execution.maxRetries,
        defaultTimeoutMs: this.config.execution.defaultTimeoutMs,
        enablePolicyCheck: this.config.execution.enablePolicyEnforcement,
        enableAuditLog: this.config.execution.enableAuditLog,
      }
    );
    this.planner = new LLMPlanner({
      ...this.config.llm,
      maxPlanningAttempts: 3,
      enableRiskAssessment: true,
    });

    // Auto-register default executors
    if (options.autoRegisterExecutors !== false) {
      this.registerDefaultExecutors();
    }

    logger.info('IcarusFlow initialized', {
      network: this.config.chain.network,
      llmModel: this.config.llm.model,
    });
  }

  /**
   * Register default task executors
   */
  private registerDefaultExecutors(): void {
    const { connectors } = this.config;

    if (connectors.snowflake) {
      this.registerExecutor('SNOWFLAKE_QUERY', new SnowflakeExecutor(connectors.snowflake));
    }

    if (connectors.s3) {
      this.registerExecutor('S3_UPLOAD', new S3UploadExecutor(connectors.s3));
    }

    if (connectors.email) {
      this.registerExecutor('EMAIL_SEND', new EmailSendExecutor(connectors.email));
    }

    this.registerExecutor('DATA_TRANSFORM', new DataTransformExecutor());
    this.registerExecutor('IMFS_STORE', new IMFSStoreExecutor());
    this.registerExecutor('IMFS_RETRIEVE', new IMFSRetrieveExecutor());

    logger.debug('Default executors registered');
  }

  /**
   * Register a custom task executor
   */
  registerExecutor(taskType: string, executor: TaskExecutor): void {
    this.orchestrator.registerExecutor(taskType, executor);
    logger.debug(`Executor registered: ${taskType}`);
  }

  /**
   * Process a natural language request
   * This is the main entry point for user interactions
   */
  async processRequest(
    userInput: string,
    policyContext: PolicyContext
  ): Promise<{
    success: boolean;
    flow?: Flow;
    error?: string;
    chainCommitHash?: string;
  }> {
    logger.info('Processing request', { input: userInput.substring(0, 100) });

    // Step 1: Plan the workflow using LLM
    const planResult = await this.planner.planWorkflow(userInput);
    
    if (!planResult.success || !planResult.plan) {
      return {
        success: false,
        error: planResult.error || 'Failed to plan workflow',
      };
    }

    logger.info('Workflow planned', {
      taskCount: planResult.plan.tasks.length,
      risk: planResult.plan.riskAssessment.overallRisk,
    });

    // Step 2: Compile the plan into an executable flow
    const compileResult = this.compiler.compile(planResult.plan, policyContext.userId);
    
    if (!compileResult.success || !compileResult.flow) {
      return {
        success: false,
        error: `Compilation failed: ${compileResult.errors.map((e) => e.message).join(', ')}`,
      };
    }

    logger.info('Workflow compiled', { flowId: compileResult.flow.id });

    // Step 3: Execute the workflow
    const execResult = await this.orchestrator.executeFlow(compileResult.flow, policyContext);

    if (execResult.success) {
      logger.info('Workflow completed successfully', {
        flowId: execResult.flow.id,
        chainCommitHash: execResult.chainCommitHash,
      });
    } else {
      logger.error('Workflow failed', {
        flowId: execResult.flow.id,
        failedTask: execResult.failedTask,
        error: execResult.error,
      });
    }

    return {
      success: execResult.success,
      flow: execResult.flow,
      error: execResult.error,
      chainCommitHash: execResult.chainCommitHash,
    };
  }

  /**
   * Execute a pre-defined workflow plan
   */
  async executePlan(
    plan: WorkflowPlan,
    policyContext: PolicyContext
  ): Promise<{
    success: boolean;
    flow?: Flow;
    error?: string;
    chainCommitHash?: string;
  }> {
    const compileResult = this.compiler.compile(plan, policyContext.userId);
    
    if (!compileResult.success || !compileResult.flow) {
      return {
        success: false,
        error: `Compilation failed: ${compileResult.errors.map((e) => e.message).join(', ')}`,
      };
    }

    const execResult = await this.orchestrator.executeFlow(compileResult.flow, policyContext);

    return {
      success: execResult.success,
      flow: execResult.flow,
      error: execResult.error,
      chainCommitHash: execResult.chainCommitHash,
    };
  }

  /**
   * Verify a workflow execution
   */
  async verifyWorkflow(flowId: string, workflowHash: string) {
    return this.auditLogger.verifyWorkflow(flowId, workflowHash);
  }

  /**
   * Get audit trail for a workflow
   */
  getAuditTrail(flowId: string) {
    return this.auditLogger.getAuditTrail(flowId);
  }

  /**
   * Replay a workflow from audit log
   */
  async replayWorkflow(flowId: string) {
    return this.auditLogger.replayWorkflow(flowId);
  }

  /**
   * Get all committed workflows
   */
  getAllCommits() {
    return this.auditLogger.getAllCommits();
  }

  /**
   * Validate configuration
   */
  validateConfiguration() {
    return validateConfig(this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): IcarusConfig {
    return { ...this.config };
  }
}

// Default export
export default IcarusFlow;
