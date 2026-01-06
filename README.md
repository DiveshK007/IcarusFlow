# IcarusFlow

**Multi-Step Agentic Workflows on Icarus**

A deterministic, auditable, policy-aware execution layer that binds probabilistic LLM reasoning to verifiable on-chain state transitions.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WeilChain](https://img.shields.io/badge/WeilChain-Native-green.svg)](https://weilchain.io)

## 🎯 What is IcarusFlow?

IcarusFlow is **NOT** just another AI chatbot or autonomous agent. It is a **controlled execution system** where:

- 🧠 **The LLM proposes plans** - translates natural language to structured workflows
- ✅ **The system validates them** - policy checks, compilation, security verification
- ⛓️ **The blockchain commits state** - immutable audit trail for every action
- ⚙️ **Executors perform bounded actions** - deterministic, sandboxed task execution

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IcarusFlow Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User ──▶ Intent Interface ──▶ LLM Planner ──▶ Workflow Compiler   │
│                                                          │           │
│                                                          ▼           │
│   On-Chain State ◀── Agent Executors ◀── Execution ◀── Policy       │
│      Commit              │              Orchestrator   Validator    │
│                          │                                          │
│                    ┌─────┴─────┐                                    │
│                    │ Snowflake │                                    │
│                    │    S3     │  ◀── MCP Connectors                │
│                    │   Email   │                                    │
│                    │   IMFS    │                                    │
│                    └───────────┘                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- OpenAI API key (for natural language processing)

### Installation

```bash
# Clone the repository
git clone https://github.com/DiveshK007/IcarusFlow.git
cd IcarusFlow

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Add your OpenAI API key to .env
echo "OPENAI_API_KEY=your-key-here" >> .env

# Build the project
npm run build
```

### Run the Demo

```bash
# Run with predefined workflow (no API key needed)
npm run demo

# Or use the CLI
npm run cli demo

# With natural language (requires OpenAI API key)
npm run cli demo --nl
```

### API Server (Vercel)

The project is deployed at: **https://icarus-flow.vercel.app**

**Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and service info |
| `/api/workflow/execute` | POST | Execute workflow from natural language |
| `/api/workflow/execute-plan` | POST | Execute predefined workflow plan |
| `/api/workflow/verify` | POST | Verify workflow on chain |

**Example API Request:**
```bash
curl -X POST https://icarus-flow.vercel.app/api/workflow/execute-plan \
  -H "Content-Type: application/json" \
  -d '{
    "plan": {
      "tasks": [
        {
          "taskType": "DATA_TRANSFORM",
          "description": "Transform data",
          "params": { "operation": "aggregate" }
        }
      ]
    }
  }'
```

## 💻 Usage

### Programmatic Usage

```typescript
import { IcarusFlow } from 'icarus-flow';

const icarus = new IcarusFlow({
  config: {
    llm: {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY,
    },
  },
});

// Define policy context
const policyContext = {
  userId: 'user-001',
  roles: ['analyst', 'data_admin'],
  department: 'Engineering',
  dataClassifications: ['internal'],
  timestamp: new Date(),
  region: 'us',
};

// Process a natural language request
const result = await icarus.processRequest(
  "Get this quarter's churn rate by product, save to S3, and email the team",
  policyContext
);

if (result.success) {
  console.log('Workflow completed!');
  console.log('Flow ID:', result.flow?.id);
  console.log('Chain commit:', result.chainCommitHash);
}
```

### CLI Usage

```bash
# Execute from natural language
npm run cli execute "Get sales data and send report to team"

# Execute from JSON plan file
npm run cli execute-plan ./my-workflow.json

# Verify workflow on chain
npm run cli verify <flowId>

# Run demo
npm run cli demo
```

### Pre-defined Workflow Example

```typescript
const workflowPlan = {
  id: 'my-workflow',
  intent: {
    rawInput: 'Data pipeline',
    parsedIntent: 'Execute data pipeline',
    confidence: 1.0,
    entities: [],
  },
  tasks: [
    {
      taskType: 'SNOWFLAKE_QUERY',
      description: 'Query sales data',
      params: { query: 'SELECT * FROM sales LIMIT 100' },
      dependencies: [],
      estimatedDurationMs: 2000,
    },
    {
      taskType: 'DATA_TRANSFORM',
      description: 'Transform results',
      params: { operation: 'aggregate', groupBy: 'region' },
      dependencies: ['task_0'],
      estimatedDurationMs: 1000,
    },
    {
      taskType: 'EMAIL_SEND',
      description: 'Send report',
      params: { to: 'team@example.com', subject: 'Sales Report' },
      dependencies: ['task_1'],
      estimatedDurationMs: 500,
    },
  ],
  estimatedDurationMs: 3500,
  requiredConnectors: ['SNOWFLAKE_QUERY', 'DATA_TRANSFORM', 'EMAIL_SEND'],
  riskAssessment: {
    overallRisk: 'LOW',
    dataAccessRisks: [],
    complianceFlags: [],
    recommendations: [],
  },
};

const result = await icarus.executePlan(workflowPlan, policyContext);
```

## 🏗️ Architecture

### Core Components

| Component | Purpose |
|-----------|---------|
| **LLM Planner** | Translates natural language → structured workflow plans |
| **Workflow Compiler** | Validates plans, builds DAGs, detects cycles |
| **Policy Validator** | Enforces RBAC, rate limits, data classification |
| **Execution Orchestrator** | FSM-based execution with checkpointing |
| **Chain Audit Logger** | On-chain commits with cryptographic verification |
| **MCP Connectors** | Snowflake, S3, Email, IMFS executors |

### Workflow States (FSM)

```
PENDING → RUNNING → COMMITTED
                 ↘ FAILED → ROLLED_BACK
```

### Icarus SDK Integration

IcarusFlow uses an **adapter pattern** for chain integration:

```typescript
// Mock adapter for development/testing
import { MockIcarusAdapter } from './chain/icarus-adapter';

// Production adapter (when SDK available)
import { WeilChainIcarusAdapter } from './chain/icarus-adapter';

const adapter = createIcarusAdapter('mock'); // or 'weilchain'
```

## 📁 Project Structure

```
IcarusFlow/
├── src/
│   ├── index.ts                    # Main IcarusFlow class
│   ├── cli.ts                      # Command-line interface
│   ├── types/                      # TypeScript definitions
│   ├── core/                       # Core engine
│   │   ├── workflow-compiler.ts    # DAG compilation
│   │   ├── policy-validator.ts     # Policy enforcement
│   │   └── execution-orchestrator.ts # FSM execution
│   ├── planner/                    # LLM integration
│   │   └── llm-planner.ts          # OpenAI planning
│   ├── connectors/                 # Task executors
│   │   ├── snowflake-executor.ts
│   │   ├── s3-executor.ts
│   │   ├── email-executor.ts
│   │   └── ...
│   ├── chain/                      # Blockchain layer
│   │   ├── audit-logger.ts         # Audit logging
│   │   └── icarus-adapter.ts       # SDK adapter
│   ├── store/                      # State persistence
│   │   └── workflow-store.ts
│   ├── api/                        # API schemas
│   │   └── schemas.ts
│   └── __tests__/                  # Integration tests
├── api/                            # Vercel API routes
│   ├── health.ts
│   └── workflow/
│       ├── execute.ts
│       ├── execute-plan.ts
│       └── verify.ts
├── docs/
│   ├── ARCHITECTURE.md
│   └── API.md
├── package.json
├── tsconfig.json
├── vercel.json
└── .env.example
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
# Required for natural language processing
OPENAI_API_KEY=sk-...

# Optional: Override default model
OPENAI_MODEL=gpt-4

# Optional: Chain configuration
WEILCHAIN_RPC_URL=https://rpc.weilchain.io
WEILCHAIN_NETWORK=testnet
WEILCHAIN_PRIVATE_KEY=your-private-key

# Optional: Connector credentials
SNOWFLAKE_ACCOUNT=...
SNOWFLAKE_USER=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### Policy Configuration

```typescript
const policies = [
  {
    id: 'data-access',
    name: 'Data Access Control',
    rules: [
      {
        type: 'ROLE_PERMISSION',
        condition: "task.type === 'SNOWFLAKE_QUERY' && !user.roles.includes('analyst')",
        action: 'DENY',
        message: 'Snowflake access requires analyst role',
      },
    ],
    enforcementLevel: 'STRICT',
  },
];
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/__tests__/integration.test.ts
```

## 🚢 Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Set environment variables in Vercel dashboard:
   - `OPENAI_API_KEY`
3. Deploy automatically on push

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Self-hosted

```bash
# Build
npm run build

# Start
NODE_ENV=production node dist/index.js
```

## 🔐 Security Model

- **No secrets exposed to LLM** - credentials never touch the AI
- **Capability-based execution** - signed tokens for each operation
- **Policy enforcement** - RBAC, rate limits, data classification
- **Chain-verified state** - tamper-evident audit trail

## 📊 Available Task Types

| Task Type | Description |
|-----------|-------------|
| `SNOWFLAKE_QUERY` | Query Snowflake data warehouse |
| `S3_UPLOAD` | Upload files to AWS S3 |
| `S3_DOWNLOAD` | Download files from AWS S3 |
| `EMAIL_SEND` | Send email notifications |
| `CONFLUENCE_PUBLISH` | Publish to Confluence |
| `IMFS_STORE` | Store in In-Memory File System |
| `IMFS_RETRIEVE` | Retrieve from IMFS |
| `DATA_TRANSFORM` | Transform/aggregate data |
| `CUSTOM` | Custom executor (register your own) |

## 🆚 Why IcarusFlow?

| Feature | LangChain/AutoGPT | Zapier/n8n | **IcarusFlow** |
|---------|-------------------|------------|----------------|
| Audit Trail | ❌ No | ⚠️ Limited | ✅ Full on-chain |
| Policy Enforcement | ❌ No | ⚠️ Basic | ✅ Pre-execution |
| Direct API Access | ⚠️ Dangerous | ✅ Yes | ✅ Bounded |
| Reproducibility | ❌ No | ✅ Yes | ✅ Deterministic |
| Blockchain Native | ❌ No | ❌ No | ✅ Yes |

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines.

---

**Built for the Weilliptic Hackathon**

*IcarusFlow: Where enterprise AI meets blockchain trust.*
