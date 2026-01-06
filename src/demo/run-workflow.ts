/**
 * IcarusFlow Demo Workflow
 * 
 * This demo showcases the full workflow:
 * 1. Query Snowflake → Get sales data
 * 2. Transform data → Format as CSV
 * 3. Upload to S3 → Store results
 * 4. Send Email → Notify team
 * 
 * All steps are:
 * - Validated against policies
 * - Executed deterministically
 * - Logged immutably on-chain
 */

import { IcarusFlow } from '../index.js';
import type { WorkflowPlan, TaskType } from '../types/index.js';
import type { PolicyContext } from '../core/policy-validator.js';
import { v4 as uuidv4 } from 'uuid';

// Demo configuration
const DEMO_CONFIG = {
  llm: {
    provider: 'openai' as const,
    model: 'gpt-4',
    temperature: 0.1,
    maxTokens: 4096,
    apiKey: process.env.OPENAI_API_KEY || 'demo-mode',
  },
  chain: {
    rpcUrl: 'https://rpc.weilchain.io',
    network: 'testnet',
    privateKey: 'demo-private-key',
    contractAddress: '0x1234567890abcdef',
    gasLimit: 500000,
  },
  connectors: {
    snowflake: {
      account: 'demo-account',
      username: 'demo-user',
      password: 'demo-password',
      database: 'DEMO_DB',
      warehouse: 'DEMO_WH',
      schema: 'public',
    },
    s3: {
      accessKeyId: 'demo-access-key',
      secretAccessKey: 'demo-secret-key',
      region: 'us-east-1',
      bucketName: 'icarusflow-demo',
    },
    email: {
      host: 'smtp.demo.com',
      port: 587,
      user: 'demo@icarusflow.io',
      password: 'demo-password',
      from: 'noreply@icarusflow.io',
    },
  },
};

// Demo policy context
const demoPolicyContext: PolicyContext = {
  userId: 'demo-user-001',
  roles: ['analyst', 'data_admin'],
  department: 'Engineering',
  dataClassifications: ['internal', 'public'],
  timestamp: new Date(),
  region: 'us',
};

/**
 * Run the demo with natural language input
 */
async function runNaturalLanguageDemo() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 IcarusFlow Demo - Natural Language Workflow');
  console.log('='.repeat(60) + '\n');

  const icarus = new IcarusFlow({ config: DEMO_CONFIG });

  // Example user request
  const userRequest = `
    Get this quarter's churn rate by product from our data warehouse,
    save the results to S3, and send a summary email to the analytics team.
  `;

  console.log('📝 User Request:');
  console.log(userRequest.trim());
  console.log('\n' + '-'.repeat(60) + '\n');

  const result = await icarus.processRequest(userRequest, demoPolicyContext);

  if (result.success) {
    console.log('\n✅ Workflow completed successfully!');
    console.log(`📦 Chain Commit Hash: ${result.chainCommitHash}`);
    
    if (result.flow) {
      console.log('\n📋 Task Summary:');
      for (const task of result.flow.tasks) {
        const status = task.status === 'SUCCESS' ? '✓' : '✗';
        console.log(`  ${status} ${task.name} (${task.type})`);
      }

      // Show audit trail
      const auditTrail = icarus.getAuditTrail(result.flow.id);
      console.log('\n📜 Audit Trail:');
      for (const entry of auditTrail.slice(0, 5)) {
        console.log(`  [${entry.timestamp}] ${entry.eventType}`);
      }
    }
  } else {
    console.log('\n❌ Workflow failed:', result.error);
  }

  return result;
}

/**
 * Run the demo with a pre-defined workflow plan
 */
async function runPredefinedWorkflowDemo() {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 IcarusFlow Demo - Pre-defined Workflow');
  console.log('='.repeat(60) + '\n');

  const icarus = new IcarusFlow({ config: DEMO_CONFIG });

  // Pre-defined workflow plan
  const workflowPlan: WorkflowPlan = {
    id: uuidv4(),
    intent: {
      rawInput: 'Execute sales analytics workflow',
      parsedIntent: 'Query sales data, transform, upload, and notify',
      confidence: 1.0,
      entities: [],
    },
    tasks: [
      {
        taskType: 'SNOWFLAKE_QUERY' as TaskType,
        description: 'Query Q4 churn data by product',
        params: {
          query: `
            SELECT 
              product_name,
              COUNT(DISTINCT customer_id) as total_customers,
              COUNT(DISTINCT CASE WHEN status = 'churned' THEN customer_id END) as churned_customers,
              ROUND(churned_customers::FLOAT / total_customers * 100, 2) as churn_rate
            FROM customer_metrics
            WHERE quarter = 'Q4-2025'
            GROUP BY product_name
            ORDER BY churn_rate DESC
          `,
        },
        dependencies: [],
        estimatedDurationMs: 5000,
      },
      {
        taskType: 'DATA_TRANSFORM' as TaskType,
        description: 'Transform results to CSV format',
        params: {
          format: 'csv',
        },
        dependencies: ['task_0'],
        estimatedDurationMs: 1000,
      },
      {
        taskType: 'S3_UPLOAD' as TaskType,
        description: 'Upload CSV to S3',
        params: {
          bucket: 'analytics-reports',
          key: `churn-analysis/q4-2025-${Date.now()}.csv`,
        },
        dependencies: ['task_1'],
        estimatedDurationMs: 2000,
      },
      {
        taskType: 'EMAIL_SEND' as TaskType,
        description: 'Notify analytics team',
        params: {
          recipients: ['analytics@company.com', 'leadership@company.com'],
          subject: 'Q4 2025 Churn Analysis Report',
          body: `
            Hi Team,
            
            The Q4 2025 churn analysis is complete.
            
            Summary:
            {{data}}
            
            The full report has been uploaded to S3.
            
            Best,
            IcarusFlow
          `,
        },
        dependencies: ['task_2'],
        estimatedDurationMs: 2000,
      },
    ],
    estimatedDurationMs: 10000,
    requiredConnectors: ['SNOWFLAKE_QUERY', 'DATA_TRANSFORM', 'S3_UPLOAD', 'EMAIL_SEND'] as TaskType[],
    riskAssessment: {
      overallRisk: 'MEDIUM',
      dataAccessRisks: ['Accessing customer metrics data'],
      complianceFlags: [],
      recommendations: ['Verify recipients before sending'],
    },
  };

  console.log('📋 Workflow Plan:');
  console.log(`  ID: ${workflowPlan.id}`);
  console.log(`  Tasks: ${workflowPlan.tasks.length}`);
  console.log(`  Risk Level: ${workflowPlan.riskAssessment.overallRisk}`);
  console.log('\n  Task Sequence:');
  workflowPlan.tasks.forEach((task, i) => {
    console.log(`    ${i + 1}. ${task.description} (${task.taskType})`);
  });
  console.log('\n' + '-'.repeat(60) + '\n');

  const result = await icarus.executePlan(workflowPlan, demoPolicyContext);

  if (result.success) {
    console.log('\n✅ Workflow completed successfully!');
    console.log(`📦 Chain Commit Hash: ${result.chainCommitHash}`);
    
    if (result.flow) {
      console.log('\n📊 Execution Results:');
      for (const task of result.flow.tasks) {
        const status = task.status === 'SUCCESS' ? '✓' : '✗';
        const duration = task.result?.executionTimeMs || 0;
        console.log(`  ${status} ${task.name}`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Duration: ${duration}ms`);
        if (task.result?.outputHash) {
          console.log(`    Output Hash: ${task.result.outputHash.substring(0, 16)}...`);
        }
      }

      // Verify the workflow
      const verifyResult = await icarus.verifyWorkflow(
        result.flow.id,
        result.chainCommitHash || ''
      );
      console.log(`\n🔐 Verification: ${verifyResult.valid ? 'PASSED' : 'FAILED'}`);
    }
  } else {
    console.log('\n❌ Workflow failed:', result.error);
  }

  return result;
}

/**
 * Main demo entry point
 */
async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                                                          ║');
  console.log('║   🌟 IcarusFlow - Multi-Step Agentic Workflows 🌟       ║');
  console.log('║                                                          ║');
  console.log('║   Deterministic • Auditable • Policy-Aware              ║');
  console.log('║                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    // Run natural language demo
    await runNaturalLanguageDemo();

    // Run pre-defined workflow demo
    await runPredefinedWorkflowDemo();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Demo Complete!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Demo error:', error);
    process.exit(1);
  }
}

// Run the demo
main();
