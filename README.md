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

## 🌟 Key Features

### Built-in Auditability & Integrity
Every action, input, and output is logged on-chain with cryptographic proofs. Full compliance for regulated industries.

### Data and Compute Sovereignty
All compute happens on WeilChain under your control. No external servers, no black boxes.

### Modular Multi-Step Workflows
Discrete Tasks and Flows rather than fragile prompt chains. Each step is executed, checked, and logged independently.

### Enterprise-Grade Integrations
Ready-to-use MCP connectors for Snowflake, S3, Email, Confluence, and more.

### Policy Enforcement
Every task is validated against role permissions, rate limits, data classifications, and compliance rules **before** execution.

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/DiveshK007/IcarusFlow.git
cd IcarusFlow

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Build the project
npm run build
```

### Basic Usage

```typescript
import { IcarusFlow } from 'icarus-flow';

// Initialize IcarusFlow
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
  console.log('Chain commit:', result.chainCommitHash);
}
```

### Run the Demo

```bash
npm run demo
```

## 📋 System Components

### 1. LLM Planner (Probabilistic Layer)

Translates ambiguous human intent into structured execution plans.

**Output Format:**
```json
{
  "workflow": [
    { "task": "SNOWFLAKE_QUERY", "params": {...} },
    { "task": "DATA_TRANSFORM", "params": {...} },
    { "task": "EMAIL_SEND", "params": {...} }
  ]
}
```

**Important:** The LLM does NOT execute actions. It only proposes plans that are validated and executed by the system.

### 2. Workflow Compiler (Deterministic Layer)

Converts LLM plans into typed DAGs (Directed Acyclic Graphs).

**Guarantees:**
- Valid step ordering
- No infinite loops (cycle detection)
- Explicit dependencies
- Type-checked inputs/outputs

### 3. Policy Validator (Control Layer)

The **killer feature** of IcarusFlow.

Before execution, each task is checked against:
- Role permissions
- Data access scope
- Rate limits
- Time windows
- Compliance rules

If a step violates policy: ❌ workflow halts, ✔ rejection logged on-chain.

### 4. Execution Orchestrator (State Machine)

**States:** `PENDING → RUNNING → COMMITTED → FAILED`

Each state transition:
- Emits an on-chain event
- Includes hash of inputs/outputs

### 5. Agent Executors (Bounded Compute)

Executors cannot invent actions. They can only:
- Execute predefined MCP connectors
- Within strict parameter bounds

**Available Executors:**
| Executor | Description |
|----------|-------------|
| `SNOWFLAKE_QUERY` | Query Snowflake data warehouse |
| `S3_UPLOAD` | Upload files to AWS S3 |
| `EMAIL_SEND` | Send email notifications |
| `DATA_TRANSFORM` | Transform data formats |
| `IMFS_STORE` | Store in In-Memory File System |
| `CONFLUENCE_PUBLISH` | Publish to Confluence |

### 6. On-Chain Audit Layer

**What goes on-chain:**
- Workflow hash
- Task sequence
- Input/output hashes
- Policy decisions
- Timestamps

**What stays off-chain:**
- Raw data blobs
- Large files
- Private payloads

Linked via content-addressed hashes for privacy + auditability.

## 🔐 Security Model

- **No secrets exposed to LLM** - credentials never touch the AI
- **Capability-based execution** - signed tokens for each operation
- **Signed policy approvals** - governance on-chain
- **Chain-verified state** - tamper-evident audit trail

## 📁 Project Structure

```
IcarusFlow/
├── src/
│   ├── index.ts              # Main entry point
│   ├── types/                # TypeScript type definitions
│   │   └── index.ts
│   ├── core/                 # Core workflow engine
│   │   ├── workflow-compiler.ts
│   │   ├── policy-validator.ts
│   │   └── execution-orchestrator.ts
│   ├── planner/              # LLM planning module
│   │   └── llm-planner.ts
│   ├── connectors/           # MCP connectors
│   │   ├── base-executor.ts
│   │   ├── snowflake-executor.ts
│   │   ├── s3-executor.ts
│   │   ├── email-executor.ts
│   │   ├── data-transform-executor.ts
│   │   └── imfs-executor.ts
│   ├── chain/                # Blockchain integration
│   │   └── audit-logger.ts
│   ├── utils/                # Utilities
│   │   ├── config.ts
│   │   └── logger.ts
│   └── demo/                 # Demo workflows
│       └── run-workflow.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 🆚 Why This Beats Existing Solutions

| Feature | LangChain/AutoGPT | Zapier/n8n | Cloud LLM Assistants | **IcarusFlow** |
|---------|-------------------|------------|---------------------|----------------|
| Audit Trail | ❌ No | ⚠️ Limited | ❌ No | ✅ Full on-chain |
| Policy Enforcement | ❌ No | ⚠️ Basic | ❌ No | ✅ Pre-execution |
| Direct API Access | ⚠️ Dangerous | ✅ Yes | ⚠️ Opaque | ✅ Bounded |
| Reproducibility | ❌ No | ✅ Yes | ❌ No | ✅ Deterministic |
| Compliance Ready | ❌ No | ⚠️ Partial | ❌ No | ✅ Enterprise |

**IcarusFlow uniquely offers:** Probabilistic planning + deterministic execution + immutable audit

## 🛣️ Roadmap

### Short Term
- [ ] Human-in-the-loop approvals
- [ ] Retry semantics
- [ ] Workflow versioning

### Medium Term
- [ ] Agent marketplace
- [ ] Verified skill modules
- [ ] Cross-chain execution

### Long Term
- [ ] Formal verification of workflows
- [ ] Compliance-as-code
- [ ] Autonomous DAO-governed agents

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Weilliptic team for the Icarus platform
- Weil SDK documentation
- WeilChain infrastructure

---

**Built with ❤️ for the Weilliptic Hackathon**

*IcarusFlow: Where enterprise AI meets blockchain trust.*
