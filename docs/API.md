# IcarusFlow API Reference

## Main Classes

### IcarusFlow

The main entry point for the workflow system.

```typescript
import { IcarusFlow } from 'icarus-flow';

const icarus = new IcarusFlow(options?: IcarusFlowOptions);
```

#### Constructor Options

```typescript
interface IcarusFlowOptions {
  config?: Partial<IcarusConfig>;
  autoRegisterExecutors?: boolean; // default: true
}
```

#### Methods

##### processRequest

Process a natural language request and execute the resulting workflow.

```typescript
async processRequest(
  userInput: string,
  policyContext: PolicyContext
): Promise<{
  success: boolean;
  flow?: Flow;
  error?: string;
  chainCommitHash?: string;
}>
```

**Parameters:**
- `userInput`: Natural language description of the workflow
- `policyContext`: User context for policy validation

**Example:**
```typescript
const result = await icarus.processRequest(
  "Get Q4 sales data and email the analytics team",
  {
    userId: 'user-001',
    roles: ['analyst'],
    department: 'Sales',
    dataClassifications: ['internal'],
    timestamp: new Date(),
    region: 'us',
  }
);
```

##### executePlan

Execute a pre-defined workflow plan.

```typescript
async executePlan(
  plan: WorkflowPlan,
  policyContext: PolicyContext
): Promise<{
  success: boolean;
  flow?: Flow;
  error?: string;
  chainCommitHash?: string;
}>
```

##### registerExecutor

Register a custom task executor.

```typescript
registerExecutor(taskType: string, executor: TaskExecutor): void
```

**Example:**
```typescript
icarus.registerExecutor('CUSTOM_TASK', {
  execute: async (task, context) => {
    // Custom execution logic
    return { success: true, data: result, metrics: {...} };
  },
  validate: (task) => true,
});
```

##### verifyWorkflow

Verify a workflow execution against on-chain records.

```typescript
async verifyWorkflow(
  flowId: string,
  workflowHash: string
): Promise<{
  valid: boolean;
  commit?: ChainCommit;
  auditLog: AuditLogEntry[];
}>
```

##### getAuditTrail

Get the audit trail for a workflow.

```typescript
getAuditTrail(flowId: string): AuditLogEntry[]
```

##### replayWorkflow

Replay workflow execution from audit log.

```typescript
async replayWorkflow(flowId: string): Promise<{
  events: AuditLogEntry[];
  timeline: Array<{ time: string; event: string; data: unknown }>;
}>
```

---

## Type Definitions

### PolicyContext

```typescript
interface PolicyContext {
  userId: string;
  roles: string[];
  department: string;
  dataClassifications: string[];
  timestamp: Date;
  sourceIp?: string;
  region?: string;
}
```

### WorkflowPlan

```typescript
interface WorkflowPlan {
  id: string;
  intent: UserIntent;
  tasks: PlannedTask[];
  estimatedDurationMs: number;
  requiredConnectors: TaskType[];
  riskAssessment: RiskAssessment;
}
```

### PlannedTask

```typescript
interface PlannedTask {
  taskType: TaskType;
  description: string;
  params: Record<string, unknown>;
  dependencies: string[];
  estimatedDurationMs: number;
}
```

### TaskType

```typescript
type TaskType =
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
```

### Flow

```typescript
interface Flow {
  id: string;
  workflowId: string;
  tasks: Task[];
  status: WorkflowStatus;
  metadata: WorkflowMetadata;
  policyCheckResults: PolicyCheckResult[];
  auditTrail: AuditEntry[];
  chainCommitHash?: string;
}
```

### Task

```typescript
interface Task {
  id: string;
  name: string;
  type: TaskType;
  params: Record<string, unknown>;
  dependencies: string[];
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  result?: TaskResult;
}
```

### TaskStatus

```typescript
type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
```

### WorkflowStatus

```typescript
type WorkflowStatus = 'PENDING' | 'RUNNING' | 'COMMITTED' | 'FAILED' | 'ROLLED_BACK';
```

---

## Task Executor Parameters

### SNOWFLAKE_QUERY

```typescript
interface SnowflakeQueryParams {
  query: string;        // SQL query to execute
  database?: string;    // Override default database
  schema?: string;      // Override default schema
  warehouse?: string;   // Override default warehouse
  timeout?: number;     // Query timeout in ms
  maxRows?: number;     // Maximum rows to return
}
```

### S3_UPLOAD

```typescript
interface S3UploadParams {
  bucket: string;                    // S3 bucket name
  key: string;                       // Object key/path
  data?: unknown;                    // Data to upload (or use previous task result)
  contentType?: string;              // MIME type
  metadata?: Record<string, string>; // S3 object metadata
}
```

### EMAIL_SEND

```typescript
interface EmailSendParams {
  recipients: string[];  // To addresses
  subject: string;       // Email subject
  body: string;          // Email body (supports {{data}} placeholder)
  cc?: string[];         // CC addresses
  bcc?: string[];        // BCC addresses
  attachments?: Array<{ name: string; content: string }>;
  isHtml?: boolean;      // HTML email flag
}
```

### DATA_TRANSFORM

```typescript
interface DataTransformParams {
  format?: 'json' | 'csv' | 'table' | 'summary';
  filter?: {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  };
  aggregate?: {
    column: string;
    operation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
  select?: string[];     // Columns to include
  limit?: number;        // Row limit
}
```

### IMFS_STORE

```typescript
interface IMFSStoreParams {
  key: string;           // Storage key
  data?: unknown;        // Data to store (or use previous task result)
  ttlSeconds?: number;   // Time-to-live
}
```

### IMFS_RETRIEVE

```typescript
interface IMFSRetrieveParams {
  key: string;           // Storage key to retrieve
}
```

---

## Policy Configuration

### Policy

```typescript
interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enforcementLevel: 'STRICT' | 'WARN' | 'AUDIT_ONLY';
}
```

### PolicyRule

```typescript
interface PolicyRule {
  id: string;
  type: PolicyRuleType;
  condition: string;
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  message: string;
}
```

### PolicyRuleType

```typescript
type PolicyRuleType =
  | 'DATA_ACCESS'           // e.g., "database:sales,marketing"
  | 'RATE_LIMIT'            // e.g., "limit:100/hour"
  | 'TIME_WINDOW'           // e.g., "hours:9-17"
  | 'ROLE_PERMISSION'       // e.g., "role:admin,analyst"
  | 'DATA_CLASSIFICATION'   // e.g., "classification:public,internal"
  | 'GEOGRAPHIC_RESTRICTION'; // e.g., "region:us,eu"
```

---

## Configuration

### IcarusConfig

```typescript
interface IcarusConfig {
  llm: LLMConfig;
  chain: ChainConfig;
  connectors: ConnectorConfigs;
  policies: Policy[];
  execution: ExecutionConfig;
}
```

### LLMConfig

```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
}
```

### ChainConfig

```typescript
interface ChainConfig {
  rpcUrl: string;
  network: string;
  privateKey: string;
  contractAddress: string;
  gasLimit: number;
}
```

### ExecutionConfig

```typescript
interface ExecutionConfig {
  maxWorkflowSteps: number;    // Maximum tasks per workflow
  defaultTimeoutMs: number;     // Default task timeout
  enablePolicyEnforcement: boolean;
  enableAuditLog: boolean;
  maxRetries: number;          // Retry attempts for failed tasks
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `LLM_MODEL` | LLM model name | `gpt-4` |
| `LLM_TEMPERATURE` | LLM temperature | `0.1` |
| `WEIL_CHAIN_RPC_URL` | WeilChain RPC endpoint | - |
| `WEIL_CHAIN_NETWORK` | Network (testnet/mainnet) | `testnet` |
| `WEIL_PRIVATE_KEY` | Wallet private key | - |
| `SNOWFLAKE_ACCOUNT` | Snowflake account | - |
| `SNOWFLAKE_USERNAME` | Snowflake username | - |
| `SNOWFLAKE_PASSWORD` | Snowflake password | - |
| `AWS_ACCESS_KEY_ID` | AWS access key | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | - |
| `S3_BUCKET_NAME` | Default S3 bucket | - |
| `SMTP_HOST` | SMTP server host | - |
| `SMTP_PORT` | SMTP server port | `587` |
| `LOG_LEVEL` | Logging level | `info` |
| `ENABLE_POLICY_ENFORCEMENT` | Enable policies | `true` |
| `MAX_WORKFLOW_STEPS` | Max tasks per workflow | `50` |
