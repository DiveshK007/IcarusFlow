# IcarusFlow Architecture

## Overview

IcarusFlow is a multi-step agentic workflow system that combines the flexibility of LLM-based planning with the determinism and auditability of blockchain execution.

## Core Principles

### 1. Separation of Planning and Execution

The fundamental insight behind IcarusFlow is that LLMs are probabilistic, but enterprises require determinism. We solve this by:

- **Planning**: LLM proposes structured workflow plans
- **Compilation**: System validates and compiles plans to DAGs
- **Validation**: Policies are enforced before execution
- **Execution**: Deterministic executors perform bounded actions
- **Commit**: State transitions are recorded on-chain

### 2. Cognitive Sandboxing

The LLM is "cognitively sandboxed":
- No direct API access
- No credentials exposure
- No side effects
- Only structured output (JSON workflow plans)

### 3. Policy-First Design

Every task is validated against policies BEFORE execution:
- Role-based access control (RBAC)
- Data classification checks
- Rate limiting
- Geographic restrictions
- Time-based access windows

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
│                    "Get sales data and email team"               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM Planner                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • Parse natural language intent                         │    │
│  │  • Extract entities (tables, recipients, etc.)           │    │
│  │  • Generate structured workflow plan                     │    │
│  │  • Assess risk level                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: { tasks: [...], riskAssessment: {...} }                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Workflow Compiler                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • Validate task types                                   │    │
│  │  • Check dependencies (cycle detection)                  │    │
│  │  • Validate parameters                                   │    │
│  │  • Build executable DAG                                  │    │
│  │  • Topological sort for execution order                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: Flow (compiled, executable workflow)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Policy Validator                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  For each task:                                          │    │
│  │  • Check role permissions                                │    │
│  │  • Verify data access scope                              │    │
│  │  • Evaluate rate limits                                  │    │
│  │  • Check time windows                                    │    │
│  │  • Verify geographic restrictions                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: ValidationResult { valid, blockedTasks, ... }          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼ (if valid)                ▼ (if invalid)
┌─────────────────────────┐    ┌─────────────────────────┐
│  Execution Orchestrator │    │    REJECT & LOG         │
│  ┌───────────────────┐  │    │    (on-chain)           │
│  │  FSM States:      │  │    └─────────────────────────┘
│  │  PENDING          │  │
│  │  RUNNING          │  │
│  │  COMMITTED        │  │
│  │  FAILED           │  │
│  └───────────────────┘  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Task Executors                                │
│                                                                  │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│   │Snowflake │ │    S3    │ │  Email   │ │ Transform│          │
│   │ Query    │ │  Upload  │ │  Send    │ │   Data   │          │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │
│        │            │            │            │                  │
│        └────────────┴────────────┴────────────┘                  │
│                            │                                     │
│                    (bounded, deterministic)                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  On-Chain Audit Layer                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  On-chain:                  Off-chain:                   │    │
│  │  • Workflow hash            • Raw data blobs             │    │
│  │  • Task sequence            • Large files                │    │
│  │  • Input/output hashes      • Private payloads           │    │
│  │  • Policy decisions                                      │    │
│  │  • Timestamps               (linked via content hash)    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: ChainCommit { txHash, blockNumber, stateRoot }         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Input Processing

```
User Input (natural language)
    │
    ▼
Intent Parser
    │
    ├── Extract entities (databases, emails, files)
    ├── Identify action verbs (query, upload, send)
    └── Detect constraints (time ranges, filters)
    │
    ▼
LLM Planning Prompt
```

### 2. Plan Generation

```
LLM Response (JSON)
    │
    ▼
{
  "intent": "Query sales data and notify team",
  "tasks": [
    { "taskType": "SNOWFLAKE_QUERY", "params": {...} },
    { "taskType": "S3_UPLOAD", "params": {...} },
    { "taskType": "EMAIL_SEND", "params": {...} }
  ],
  "riskAssessment": { "overallRisk": "MEDIUM" }
}
```

### 3. Execution Context

```typescript
ExecutionContext {
  flowId: string;              // Unique flow identifier
  currentTaskId: string;       // Currently executing task
  variables: Map<string, any>; // Inter-task data passing
  imfsFiles: Map<string, string>; // IMFS file references
  startTime: Date;             // Execution start time
  timeout: number;             // Maximum execution time
}
```

### 4. Audit Trail

```typescript
AuditEntry {
  id: string;
  timestamp: Date;
  eventType: 'TASK_STARTED' | 'TASK_COMPLETED' | 'POLICY_CHECK' | ...;
  flowId: string;
  taskId?: string;
  actor: string;
  inputHash: string;
  outputHash?: string;
  metadata: Record<string, unknown>;
}
```

## Security Architecture

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Prompt injection | Policy validation, input sanitization |
| Key leakage | No credentials in LLM context |
| Unauthorized access | RBAC, policy enforcement |
| Data exfiltration | Data classification checks |
| Audit tampering | Immutable on-chain logs |

### Defense in Depth

1. **LLM Layer**: Input validation, output schema enforcement
2. **Compilation Layer**: Type checking, dependency validation
3. **Policy Layer**: Pre-execution authorization
4. **Execution Layer**: Sandboxed executors, timeout enforcement
5. **Audit Layer**: Immutable logs, cryptographic verification

## Scaling Considerations

### Horizontal Scaling

- Executors scale independently
- LLM planning is stateless
- DAG allows parallel task execution

### Cost Optimization

- LLM only invoked for planning (not execution)
- Execution is deterministic compute
- On-chain storage minimized via content hashing

### Throughput

- Workflows are parallelizable where dependencies allow
- Batch processing support for high-volume scenarios
- Checkpoint/recovery for long-running workflows

## Integration Points

### MCP Connectors

Each connector implements the `TaskExecutor` interface:

```typescript
interface TaskExecutor {
  execute(task: Task, context: ExecutionContext): Promise<ExecutorResult>;
  validate?(task: Task): boolean;
  cleanup?(task: Task, context: ExecutionContext): Promise<void>;
}
```

### WeilChain Integration

- State commits via smart contract calls
- Audit logs as chain events
- Workflow verification via Merkle proofs

### Enterprise Systems

- Snowflake (data warehouse)
- AWS S3 (file storage)
- SMTP/Email services
- Confluence/Atlassian
- ServiceNow
- Custom REST APIs
