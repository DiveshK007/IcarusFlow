#!/usr/bin/env node

/**
 * IcarusFlow CLI
 * 
 * Command-line interface for testing and executing workflows locally.
 * 
 * Usage:
 *   npx icarus-flow execute "your natural language request"
 *   npx icarus-flow execute-plan ./workflow.json
 *   npx icarus-flow verify <flowId>
 *   npx icarus-flow demo
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { IcarusFlow } from './index.js';
import type { WorkflowPlan } from './types/index.js';
import type { PolicyContext } from './core/policy-validator.js';

interface ExecuteOptions {
  user: string;
  roles: string;
  department: string;
  region: string;
  verbose?: boolean;
}

interface ExecutePlanOptions {
  user: string;
  roles: string;
  verbose?: boolean;
}

interface VerifyOptions {
  hash?: string;
}

interface DemoOptions {
  nl?: boolean;
}

const program = new Command();

// Default policy context for CLI usage
const defaultPolicyContext: PolicyContext = {
  userId: 'cli-user',
  roles: ['analyst', 'developer'],
  department: 'engineering',
  dataClassifications: ['internal', 'public'],
  timestamp: new Date(),
  region: 'us',
};

// Banner
function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                      IcarusFlow CLI                        ║
║      Multi-Step Agentic Workflows on Icarus Blockchain     ║
╚═══════════════════════════════════════════════════════════╝
`);
}

// Initialize IcarusFlow instance
function createIcarusInstance(): IcarusFlow {
  return new IcarusFlow({
    config: {
      llm: {
        provider: 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4',
        temperature: 0.1,
        maxTokens: 4096,
        apiKey: process.env.OPENAI_API_KEY || '',
      },
    },
  });
}

// Execute command - process natural language
program
  .command('execute <prompt>')
  .description('Execute a workflow from natural language description')
  .option('-u, --user <userId>', 'User ID for policy context', 'cli-user')
  .option('-r, --roles <roles>', 'Comma-separated roles', 'analyst')
  .option('-d, --department <dept>', 'Department', 'engineering')
  .option('--region <region>', 'Geographic region', 'us')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (prompt: string, options: ExecuteOptions) => {
    printBanner();
    console.log('📝 Processing request:', prompt);
    console.log('');

    const icarus = createIcarusInstance();
    
    const policyContext: PolicyContext = {
      ...defaultPolicyContext,
      userId: options.user,
      roles: options.roles.split(',').map((r: string) => r.trim()),
      department: options.department,
      region: options.region,
    };

    try {
      const startTime = Date.now();
      const result = await icarus.processRequest(prompt, policyContext);
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log('✅ Workflow completed successfully!');
        console.log('');
        console.log(`📦 Flow ID: ${result.flow?.id}`);
        console.log(`⛓️  Chain Commit: ${result.chainCommitHash}`);
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log('');
        
        if (result.flow?.tasks) {
          console.log('📋 Tasks:');
          for (const task of result.flow.tasks) {
            const icon = task.status === 'SUCCESS' ? '✓' : task.status === 'FAILED' ? '✗' : '○';
            console.log(`   ${icon} ${task.name} (${task.type}) - ${task.status}`);
            if (options.verbose && task.result) {
              console.log(`      Time: ${task.result.executionTimeMs}ms`);
              console.log(`      Hash: ${task.result.outputHash?.substring(0, 16)}...`);
            }
          }
        }
      } else {
        console.log('❌ Workflow failed:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Execute-plan command - run predefined workflow
program
  .command('execute-plan <file>')
  .description('Execute a workflow from a JSON plan file')
  .option('-u, --user <userId>', 'User ID for policy context', 'cli-user')
  .option('-r, --roles <roles>', 'Comma-separated roles', 'analyst')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (file: string, options: ExecutePlanOptions) => {
    printBanner();
    console.log('📄 Loading workflow plan from:', file);
    console.log('');

    try {
      const planJson = await readFile(file, 'utf-8');
      const plan: WorkflowPlan = JSON.parse(planJson);

      console.log(`📋 Plan: ${plan.intent?.parsedIntent || 'Unnamed workflow'}`);
      console.log(`   Tasks: ${plan.tasks.length}`);
      console.log(`   Risk: ${plan.riskAssessment?.overallRisk || 'Unknown'}`);
      console.log('');

      const icarus = createIcarusInstance();
      
      const policyContext: PolicyContext = {
        ...defaultPolicyContext,
        userId: options.user,
        roles: options.roles.split(',').map((r: string) => r.trim()),
      };

      const startTime = Date.now();
      const result = await icarus.executePlan(plan, policyContext);
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log('✅ Workflow completed successfully!');
        console.log(`📦 Flow ID: ${result.flow?.id}`);
        console.log(`⛓️  Chain Commit: ${result.chainCommitHash}`);
        console.log(`⏱️  Duration: ${duration}ms`);
        
        if (options.verbose && result.flow?.tasks) {
          console.log('');
          console.log('📋 Task Results:');
          for (const task of result.flow.tasks) {
            console.log(`   • ${task.name}: ${task.status}`);
          }
        }
      } else {
        console.log('❌ Workflow failed:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Verify command - verify workflow on chain
program
  .command('verify <flowId>')
  .description('Verify a workflow execution against on-chain records')
  .option('-h, --hash <hash>', 'Expected workflow hash')
  .action(async (flowId: string, options: VerifyOptions) => {
    printBanner();
    console.log('🔍 Verifying workflow:', flowId);
    console.log('');

    const icarus = createIcarusInstance();
    
    try {
      const result = await icarus.verifyWorkflow(flowId, options.hash || '');

      if (result.valid) {
        console.log('✅ Workflow verified successfully!');
        if (result.commit) {
          console.log('');
          console.log('📜 On-Chain Record:');
          console.log(`   TX Hash: ${result.commit.transactionHash}`);
          console.log(`   Block: ${result.commit.blockNumber}`);
          console.log(`   Timestamp: ${result.commit.timestamp}`);
          console.log(`   State Root: ${result.commit.stateRoot}`);
        }
        if (result.auditLog?.length) {
          console.log('');
          console.log(`📋 Audit Log (${result.auditLog.length} entries)`);
        }
      } else {
        console.log('❌ Verification failed');
        console.log('   Workflow not found or hash mismatch');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Demo command - run example workflow
program
  .command('demo')
  .description('Run a demo workflow to see IcarusFlow in action')
  .option('--nl', 'Use natural language (requires OpenAI API key)')
  .action(async (options: DemoOptions) => {
    printBanner();
    console.log('🚀 Running IcarusFlow Demo');
    console.log('');

    const icarus = createIcarusInstance();

    if (options.nl && process.env.OPENAI_API_KEY) {
      console.log('Mode: Natural Language Processing');
      console.log('');
      
      const prompt = `
        Get this quarter's sales metrics from the data warehouse,
        transform the data to highlight top products,
        and send a summary report to the analytics team.
      `;
      
      console.log('📝 Request:', prompt.trim());
      console.log('');
      
      const result = await icarus.processRequest(prompt, defaultPolicyContext);
      printResult(result);
    } else {
      console.log('Mode: Predefined Workflow (no OpenAI key needed)');
      console.log('');
      
      const demoPlan: WorkflowPlan = {
        id: 'demo-' + Date.now(),
        intent: {
          rawInput: 'Demo workflow',
          parsedIntent: 'Execute demo data pipeline',
          confidence: 1.0,
          entities: [],
        },
        tasks: [
          {
            taskType: 'SNOWFLAKE_QUERY',
            description: 'Query sales metrics',
            params: { query: 'SELECT * FROM sales_metrics LIMIT 10' },
            dependencies: [],
            estimatedDurationMs: 2000,
          },
          {
            taskType: 'DATA_TRANSFORM',
            description: 'Transform data',
            params: { operation: 'aggregate', groupBy: 'product' },
            dependencies: ['task_0'],
            estimatedDurationMs: 1000,
          },
          {
            taskType: 'IMFS_STORE',
            description: 'Store results',
            params: { key: 'demo-results' },
            dependencies: ['task_1'],
            estimatedDurationMs: 500,
          },
        ],
        estimatedDurationMs: 3500,
        requiredConnectors: ['SNOWFLAKE_QUERY', 'DATA_TRANSFORM', 'IMFS_STORE'],
        riskAssessment: {
          overallRisk: 'LOW',
          dataAccessRisks: [],
          complianceFlags: [],
          recommendations: [],
        },
      };

      const result = await icarus.executePlan(demoPlan, defaultPolicyContext);
      printResult(result);
    }
  });

function printResult(result: {
  success: boolean;
  flow?: { id: string; tasks: Array<{ name: string; type: string; status: string }> };
  error?: string;
  chainCommitHash?: string;
}) {
  if (result.success) {
    console.log('✅ Demo completed successfully!');
    console.log('');
    console.log(`📦 Flow ID: ${result.flow?.id}`);
    console.log(`⛓️  Chain Commit: ${result.chainCommitHash}`);
    console.log('');
    console.log('📋 Tasks:');
    for (const task of result.flow?.tasks || []) {
      const icon = task.status === 'SUCCESS' ? '✓' : '✗';
      console.log(`   ${icon} ${task.name} (${task.type})`);
    }
  } else {
    console.log('❌ Demo failed:', result.error);
  }
}

// Version and help
program
  .name('icarus-flow')
  .description('IcarusFlow - Multi-Step Agentic Workflows on Blockchain')
  .version('1.0.0');

program.parse();
