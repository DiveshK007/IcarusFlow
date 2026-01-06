/**
 * IcarusFlow Core Type Definitions
 * 
 * These types define the structure of workflows, tasks, flows,
 * and the execution state machine.
 */

import { z } from 'zod';

// ===========================================
// Workflow & Task Types
// ===========================================

export type WorkflowStatus = 'PENDING' | 'RUNNING' | 'COMMITTED' | 'FAILED' | 'ROLLED_BACK';
export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  version: string;
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  params: Record<string, unknown>;
  dependencies: string[];  // IDs of tasks that must complete first
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
  outputHash: string;  // Hash of output for on-chain verification
}

export interface Flow {
  id: string;
  workflowId: string;
  tasks: Task[];
  status: WorkflowStatus;
  metadata: WorkflowMetadata;
  policyCheckResults: PolicyCheckResult[];
  auditTrail: AuditEntry[];
  chainCommitHash?: string;
}

// ===========================================
// Task Types (MCP Connectors)
// ===========================================

export type TaskType =
  | 'SNOWFLAKE_QUERY'
  | 'S3_UPLOAD'
  | 'S3_DOWNLOAD'
  | 'EMAIL_SEND'
  | 'CONFLUENCE_PUBLISH'
  | 'IMFS_STORE'
  | 'IMFS_RETRIEVE'
  | 'QUIVER_INDEX'
  | 'QUIVER_SEARCH'
  | 'DATA_TRANSFORM'
  | 'CONDITIONAL_BRANCH'
  | 'HUMAN_APPROVAL'
  | 'CUSTOM';

// ===========================================
// Policy & Security Types
// ===========================================

export interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enforcementLevel: 'STRICT' | 'WARN' | 'AUDIT_ONLY';
}

export interface PolicyRule {
  id: string;
  type: PolicyRuleType;
  condition: string;  // Expression to evaluate
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  message: string;
}

export type PolicyRuleType =
  | 'DATA_ACCESS'
  | 'RATE_LIMIT'
  | 'TIME_WINDOW'
  | 'ROLE_PERMISSION'
  | 'DATA_CLASSIFICATION'
  | 'GEOGRAPHIC_RESTRICTION';

export interface PolicyCheckResult {
  policyId: string;
  ruleId: string;
  taskId: string;
  passed: boolean;
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  message: string;
  checkedAt: Date;
}

// ===========================================
// Audit & Chain Types
// ===========================================

export interface AuditEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  taskId?: string;
  flowId: string;
  actor: string;
  action: string;
  inputHash: string;
  outputHash?: string;
  metadata: Record<string, unknown>;
}

export type AuditEventType =
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'POLICY_CHECK'
  | 'STATE_COMMIT'
  | 'ROLLBACK';

export interface ChainCommit {
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  workflowHash: string;
  stateRoot: string;
  auditLogHash: string;
  gasUsed: number;
}

// ===========================================
// LLM Planner Types
// ===========================================

export interface UserIntent {
  rawInput: string;
  parsedIntent: string;
  confidence: number;
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  type: string;
  value: string;
  startIndex: number;
  endIndex: number;
}

export interface WorkflowPlan {
  id: string;
  intent: UserIntent;
  tasks: PlannedTask[];
  estimatedDurationMs: number;
  requiredConnectors: TaskType[];
  riskAssessment: RiskAssessment;
}

export interface PlannedTask {
  taskType: TaskType;
  description: string;
  params: Record<string, unknown>;
  dependencies: string[];
  estimatedDurationMs: number;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  dataAccessRisks: string[];
  complianceFlags: string[];
  recommendations: string[];
}

// ===========================================
// Execution Types
// ===========================================

export interface ExecutionContext {
  flowId: string;
  currentTaskId: string;
  variables: Map<string, unknown>;
  imfsFiles: Map<string, string>;  // fileId -> content hash
  startTime: Date;
  timeout: number;
}

export interface ExecutorResult {
  success: boolean;
  data?: unknown;
  error?: ExecutionError;
  metrics: ExecutionMetrics;
}

export interface ExecutionError {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
}

export interface ExecutionMetrics {
  durationMs: number;
  retryCount: number;
  bytesProcessed: number;
  apiCallsCount: number;
}

// ===========================================
// Zod Schemas for Runtime Validation
// ===========================================

export const TaskParamsSchema = z.object({
  query: z.string().optional(),
  bucket: z.string().optional(),
  key: z.string().optional(),
  data: z.unknown().optional(),
  recipients: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  pageId: z.string().optional(),
  content: z.string().optional(),
});

export const WorkflowPlanSchema = z.object({
  id: z.string().uuid(),
  tasks: z.array(z.object({
    taskType: z.string(),
    description: z.string(),
    params: TaskParamsSchema,
    dependencies: z.array(z.string()),
  })),
});

// ===========================================
// Configuration Types
// ===========================================

export interface IcarusConfig {
  llm: LLMConfig;
  chain: ChainConfig;
  connectors: ConnectorConfigs;
  policies: Policy[];
  execution: ExecutionConfig;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
}

export interface ChainConfig {
  rpcUrl: string;
  network: string;
  privateKey: string;
  contractAddress: string;
  gasLimit: number;
}

export interface ConnectorConfigs {
  snowflake?: SnowflakeConfig;
  s3?: S3Config;
  email?: EmailConfig;
  confluence?: ConfluenceConfig;
}

export interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  database: string;
  warehouse: string;
  schema: string;
}

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export interface ConfluenceConfig {
  baseUrl: string;
  apiToken: string;
  spaceKey: string;
}

export interface ExecutionConfig {
  maxWorkflowSteps: number;
  defaultTimeoutMs: number;
  enablePolicyEnforcement: boolean;
  enableAuditLog: boolean;
  maxRetries: number;
}
