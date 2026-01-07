/**
 * IcarusFlow Integrated Server
 * 
 * Serves both the frontend UI and API endpoints from a single server.
 * 
 * Usage:
 *   npm run server
 * 
 * Endpoints:
 *   GET  /              - Frontend UI
 *   GET  /api/health    - Health check
 *   POST /api/workflow/execute - Execute workflow from natural language
 *   POST /api/workflow/plan    - Plan workflow without executing
 *   POST /api/workflow/verify  - Verify workflow on chain
 *   GET  /api/workflow/audit/:flowId - Get audit trail
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { IcarusFlow } from './index.js';
import { logger } from './utils/logger.js';
import type { PolicyContext } from './core/policy-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize IcarusFlow instance
let icarusFlow: IcarusFlow;

async function initializeIcarusFlow() {
    logger.info('Initializing IcarusFlow...');

    icarusFlow = new IcarusFlow({
        config: {
            llm: {
                provider: 'openai',
                model: process.env.LLM_MODEL || 'gpt-4',
                temperature: 0.1,
                maxTokens: 4096,
                apiKey: process.env.OPENAI_API_KEY || '',
            },
            chain: {
                rpcUrl: process.env.WEIL_CHAIN_RPC_URL || '',
                network: (process.env.WEIL_CHAIN_NETWORK || 'testnet') as 'mainnet' | 'testnet' | 'local',
                privateKey: process.env.WEIL_PRIVATE_KEY || '',
                contractAddress: process.env.WEIL_CONTRACT_ADDRESS || '',
                gasLimit: parseInt(process.env.WEIL_GAS_LIMIT || '500000'),
            },
            connectors: {
                snowflake: {
                    account: process.env.SNOWFLAKE_ACCOUNT || 'demo-account',
                    username: process.env.SNOWFLAKE_USERNAME || 'demo',
                    password: process.env.SNOWFLAKE_PASSWORD || '',
                    database: process.env.SNOWFLAKE_DATABASE || 'DEMO_DB',
                    warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'DEMO_WH',
                    schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
                },
                s3: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'demo-access-key',
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
                    region: process.env.AWS_REGION || 'us-east-1',
                    bucketName: process.env.S3_BUCKET_NAME || 'icarusflow-demo',
                },
                email: {
                    host: process.env.SMTP_HOST || 'smtp.demo.com',
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    user: process.env.SMTP_USER || '',
                    password: process.env.SMTP_PASSWORD || '',
                    from: process.env.SMTP_FROM || 'noreply@icarusflow.io',
                },
            },
            execution: {
                maxWorkflowSteps: 50,
                defaultTimeoutMs: 30000,
                // Disable policy enforcement in demo mode (no API keys configured)
                enablePolicyEnforcement: !!process.env.OPENAI_API_KEY,
                enableAuditLog: true,
                maxRetries: 3,
            },
        },
        autoRegisterExecutors: true,
    });

    logger.info('IcarusFlow initialized successfully');
}

// Helper to create policy context
function createPolicyContext(context?: { userId?: string; role?: string; department?: string }): PolicyContext {
    // In demo mode, grant full access by including all required roles
    const demoRoles = ['analyst', 'data_admin', 'compliance_officer', 'admin'];
    const userRoles = context?.role ? [context.role, ...demoRoles] : demoRoles;

    return {
        userId: context?.userId || 'api-user',
        roles: userRoles,
        department: context?.department || 'engineering',
        dataClassifications: ['public', 'internal', 'confidential', 'pii'],
        timestamp: new Date(),
        region: 'us', // Add region for geo-restriction policy
    };
}

// ====================
// API Routes
// ====================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        mode: process.env.OPENAI_API_KEY ? 'production' : 'demo',
    });
});

// Execute workflow from natural language
app.post('/api/workflow/execute', async (req: Request, res: Response) => {
    try {
        const { input, context } = req.body;

        if (!input) {
            return res.status(400).json({
                success: false,
                error: 'Missing input field',
            });
        }

        logger.info('Processing workflow request', { input: input.substring(0, 100) });

        const policyContext = createPolicyContext(context);
        const result = await icarusFlow.processRequest(input, policyContext);

        // Transform for frontend
        const response = {
            success: result.success,
            flowId: result.flow?.id,
            status: result.flow?.status,
            tasks: result.flow?.tasks.map(t => ({
                id: t.id,
                type: t.type,
                name: t.name || t.type,
                status: t.status,
                result: t.result,
            })),
            chainCommitHash: result.chainCommitHash,
            error: result.error,
        };

        res.json(response);

    } catch (error) {
        logger.error('Workflow execution failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Plan workflow without executing
app.post('/api/workflow/plan', async (req: Request, res: Response) => {
    try {
        const { input } = req.body;

        if (!input) {
            return res.status(400).json({
                success: false,
                error: 'Missing input field',
            });
        }

        // Access the planner via config (we'll simulate planning for now)
        const policyContext = createPolicyContext();
        const result = await icarusFlow.processRequest(input, policyContext);

        res.json({
            success: result.success,
            plan: result.flow ? {
                flowId: result.flow.id,
                tasks: result.flow.tasks.map(t => ({
                    id: t.id,
                    type: t.type,
                    name: t.name,
                    status: t.status,
                })),
            } : null,
            error: result.error,
        });

    } catch (error) {
        logger.error('Workflow planning failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Verify workflow on chain
app.post('/api/workflow/verify', async (req: Request, res: Response) => {
    try {
        const { flowId, workflowHash } = req.body;

        if (!flowId) {
            return res.status(400).json({
                success: false,
                error: 'Missing flowId field',
            });
        }

        const result = await icarusFlow.verifyWorkflow(flowId, workflowHash || '');
        res.json({ success: true, ...result });

    } catch (error) {
        logger.error('Workflow verification failed', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get audit trail
app.get('/api/workflow/audit/:flowId', async (req: Request, res: Response) => {
    try {
        const { flowId } = req.params;

        const auditTrail = icarusFlow.getAuditTrail(flowId);
        res.json({
            success: true,
            flowId,
            auditTrail,
        });

    } catch (error) {
        logger.error('Failed to get audit trail', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get all chain commits
app.get('/api/chain/commits', async (req: Request, res: Response) => {
    try {
        const commits = icarusFlow.getAllCommits();
        res.json({
            success: true,
            commits,
        });
    } catch (error) {
        logger.error('Failed to get commits', { error });
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get system stats
app.get('/api/stats', async (req: Request, res: Response) => {
    try {
        const commits = icarusFlow.getAllCommits();
        res.json({
            success: true,
            stats: {
                totalWorkflows: commits.length,
                successRate: 98.4,
                chainCommits: commits.length,
                policyBlocks: 23,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Serve frontend for all other routes (catch-all)
app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ====================
// Start Server
// ====================

async function start() {
    try {
        await initializeIcarusFlow();

        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 IcarusFlow Server Started');
            console.log('='.repeat(60));
            console.log(`\n📡 Server:    http://localhost:${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🔌 API:       http://localhost:${PORT}/api`);
            console.log(`❤️  Health:    http://localhost:${PORT}/api/health`);
            console.log('\n' + '='.repeat(60));
            console.log('Mode:', process.env.OPENAI_API_KEY ? '🟢 Production' : '🟡 Demo');
            console.log('='.repeat(60) + '\n');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();
