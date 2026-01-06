# 🦅 IcarusFlow

<div align="center">

**Multi-Step Agentic Workflows on Icarus**

*A deterministic, auditable, policy-aware execution layer that binds probabilistic LLM reasoning to verifiable on-chain state transitions.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WeilChain](https://img.shields.io/badge/WeilChain-Native-green.svg)](https://weilchain.io)
[![Vercel](https://img.shields.io/badge/Vercel-Live-black.svg)](https://icarus-flow.vercel.app)

**[Live Demo](https://icarus-flow.vercel.app) · [API Docs](#-api-reference) · [Architecture](#-how-it-works)**

</div>

---

## 🎯 The Problem We Solve

**AI agents are powerful, but they're a compliance nightmare.**

| Problem | Real-World Impact |
|---------|-------------------|
| 🎲 **Non-deterministic outputs** | Same query → different results → audit failures |
| 👻 **No audit trail** | "The AI did it" isn't acceptable for regulators |
| 🔓 **Unbounded actions** | Agents can execute anything without approval |
| 📊 **Data access chaos** | No policy enforcement on sensitive data |

### Our Solution: **Constrained Autonomy**

IcarusFlow creates a **trust boundary** between what AI proposes and what actually executes:

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────┐
│   LLM Proposes  │ ──▶  │ System Validates │ ──▶  │ Chain Commits  │
│   (Fuzzy)       │      │ (Deterministic)  │      │ (Immutable)    │
└─────────────────┘      └──────────────────┘      └────────────────┘
```

---

## ⚡ How It Works (60 Seconds)

**Step 1: User provides natural language intent**
```
"Query last month's sales from Snowflake, 
 upload the results to S3, 
 and email the summary to the finance team"
```

**Step 2: LLM Planner decomposes into structured workflow**
```json
{
  "tasks": [
    { "type": "SNOWFLAKE_QUERY", "description": "Query sales data" },
    { "type": "S3_UPLOAD", "description": "Store results" },
    { "type": "EMAIL_SEND", "description": "Notify finance team" }
  ]
}
```

**Step 3: Policy Validator enforces rules**
- ✅ User has `analyst` role for Snowflake access
- ✅ Data classification allows email distribution
- ❌ Would block if compliance rules violated

**Step 4: Execution Orchestrator runs tasks**
- Deterministic, bounded execution
- Each task produces verifiable output hash

**Step 5: Chain Audit Logger commits state**
```
Flow Commit: 0x7a8b9c...
├── Task 1: SNOWFLAKE_QUERY → 0xabc123...
├── Task 2: S3_UPLOAD → 0xdef456...
└── Task 3: EMAIL_SEND → 0x789abc...
```

---

## 🏗️ Architecture

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
│                    │  Quiver   │                                    │
│                    └───────────┘                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Purpose | Key Feature |
|-----------|---------|-------------|
| **LLM Planner** | Convert natural language → workflow | Structured JSON output with confidence scores |
| **Workflow Compiler** | Validate & optimize task graph | Dependency resolution, parallelization |
| **Policy Validator** | Enforce security rules | RBAC, data classification, region compliance |
| **Execution Orchestrator** | Run tasks in order | Deterministic execution, retry logic |
| **Chain Audit Logger** | Commit to blockchain | Immutable audit trail, verification proofs |

---

## 🚀 Quick Start

### Option 1: Try the Live API

```bash
# Health check
curl https://icarus-flow.vercel.app/api/health

# Execute a workflow (demo mode - no API key required)
curl -X POST https://icarus-flow.vercel.app/api/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "naturalLanguageInput": "Query sales data from Snowflake and upload to S3"
  }'
```

### Option 2: Run Locally

```bash
# Clone and install
git clone https://github.com/DiveshK007/IcarusFlow.git
cd IcarusFlow
npm install

# Build
npm run build

# Run demo (deterministic, no API key needed)
npm run demo

# Or with your OpenAI key for real LLM planning
export OPENAI_API_KEY=your-key-here
npm run demo
```

### Option 3: Use the CLI

```bash
# Build first
npm run build

# Plan a workflow
npx icarus plan "Extract data from Snowflake and email report"

# Execute a plan
npx icarus execute plan.json

# Verify a workflow on-chain
npx icarus verify --flow-id abc123 --hash 0x7a8b9c...
```

---

## 📡 API Reference

### `POST /api/workflow/execute`

Execute a workflow from natural language.

**Request:**
```json
{
  "naturalLanguageInput": "Query sales data and send report",
  "userId": "analyst-1",
  "roles": ["analyst", "data-viewer"],
  "department": "finance"
}
```

**Response:**
```json
{
  "success": true,
  "executionId": "exec-uuid",
  "flowId": "flow-uuid",
  "status": "COMPLETED",
  "chainCommitHash": "0x7a8b9c...",
  "executionTimeMs": 1234,
  "tasks": [
    {
      "id": "task-1",
      "name": "Query Sales Data",
      "type": "SNOWFLAKE_QUERY",
      "status": "COMPLETED",
      "outputHash": "0xabc123..."
    }
  ]
}
```

### `POST /api/workflow/execute-plan`

Execute a pre-defined workflow plan.

### `POST /api/workflow/verify`

Verify a workflow execution against the chain.

### `GET /api/health`

System health and version info.

---

## 🔗 Icarus SDK Integration

IcarusFlow integrates with the Weilliptic Icarus SDK for blockchain commitments:

```typescript
// Automatic adapter selection based on config
const adapter = process.env.ICARUS_ADAPTER_MODE === 'sdk' 
  ? new WeilChainIcarusAdapter()  // Real SDK
  : new MockIcarusAdapter();       // Demo mode

// All audit logs go through unified interface
await adapter.commitWorkflowState(flow, auditLog);
const verification = await adapter.verifyCommit(flowId, hash);
```

---

## 📦 Project Structure

```
IcarusFlow/
├── api/                    # Vercel serverless functions
│   ├── health.ts
│   └── workflow/
│       ├── execute.ts      # Natural language → execution
│       ├── execute-plan.ts # Plan → execution
│       └── verify.ts       # On-chain verification
├── src/
│   ├── core/               # Core system components
│   │   ├── workflow-compiler.ts
│   │   ├── policy-validator.ts
│   │   └── execution-orchestrator.ts
│   ├── planner/            # LLM integration
│   │   └── llm-planner.ts
│   ├── chain/              # Blockchain integration
│   │   ├── audit-logger.ts
│   │   └── icarus-adapter.ts
│   ├── connectors/         # MCP connectors
│   │   ├── snowflake.ts
│   │   ├── s3.ts
│   │   ├── email.ts
│   │   └── ...
│   ├── store/              # Workflow persistence
│   ├── utils/              # Demo mode, tracing, errors
│   └── cli.ts              # Command-line interface
└── examples/               # Usage examples
```

---

## 🎪 Demo Mode

For hackathon demonstrations, IcarusFlow includes a deterministic demo mode:

```bash
# Enable demo mode (default when no OPENAI_API_KEY)
export ICARUS_DEMO_MODE=true
npm run demo
```

Demo mode features:
- ✅ **Deterministic outputs** - Same input → same output, every time
- ✅ **No API keys required** - Works offline
- ✅ **Visual execution traces** - ASCII art workflow visualization
- ✅ **Predictable timing** - Consistent demo experience

---

## 🔒 Security Model

IcarusFlow implements defense-in-depth:

| Layer | Protection |
|-------|------------|
| **Input** | Zod schema validation, sanitization |
| **Policy** | RBAC, data classification, region rules |
| **Execution** | Sandboxed connectors, timeout limits |
| **Output** | Hash verification, no PII in logs |
| **Audit** | Immutable blockchain commits |

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build (TypeScript → JavaScript)
npm run build

# Run tests
npm test

# Type check
npm run type-check

# Lint
npm run lint

# Local development server
npm run dev
```

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Lines of Code | ~3,500 |
| Test Coverage | Core components |
| API Latency | <2s (demo mode) |
| Supported Connectors | 10 |

---

## 🏆 Hackathon Highlights

### Why IcarusFlow Matters

1. **For Enterprises**: Adopt AI agents without compliance risk
2. **For Developers**: Build multi-step AI workflows with guardrails
3. **For Auditors**: Complete, immutable execution history
4. **For WeilChain**: Showcase practical blockchain utility

### Technical Innovations

- **Workflow Compilation**: LLM proposals → validated, optimized task graphs
- **Policy-Aware Execution**: Every action checked against RBAC rules
- **Chain Audit Trail**: Cryptographic proof of every state transition
- **Icarus SDK Integration**: Native WeilChain commitment layer

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for the Icarus Hackathon**

[GitHub](https://github.com/DiveshK007/IcarusFlow) · [Live Demo](https://icarus-flow.vercel.app) · [API Health](https://icarus-flow.vercel.app/api/health)

</div>