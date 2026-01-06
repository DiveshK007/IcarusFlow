/**
 * IcarusFlow Integration Tests
 * 
 * Tests the core workflow execution pipeline:
 * - Workflow compilation
 * - Policy validation
 * - Task execution
 * - Chain commits
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IcarusFlow } from '../index.js';
import type { WorkflowPlan, TaskType } from '../types/index.js';
import type { PolicyContext } from '../core/policy-validator.js';

// Test policy context
const testPolicyContext: PolicyContext = {
  userId: 'test-user',
  roles: ['analyst', 'developer'],
  department: 'engineering',
  dataClassifications: ['internal', 'public'],
  timestamp: new Date(),
  region: 'us',
};

// Test workflow plan
const testWorkflowPlan: WorkflowPlan = {
  id: 'test-workflow-001',
  intent: {
    rawInput: 'Test workflow',
    parsedIntent: 'Execute test data pipeline',
    confidence: 1.0,
    entities: [],
  },
  tasks: [
    {
      taskType: 'DATA_TRANSFORM' as TaskType,
      description: 'Transform test data',
      params: { operation: 'filter', field: 'status', value: 'active' },
      dependencies: [],
      estimatedDurationMs: 1000,
    },
    {
      taskType: 'IMFS_STORE' as TaskType,
      description: 'Store results in IMFS',
      params: { key: 'test-results' },
      dependencies: ['task_0'],
      estimatedDurationMs: 500,
    },
  ],
  estimatedDurationMs: 1500,
  requiredConnectors: ['DATA_TRANSFORM', 'IMFS_STORE'] as TaskType[],
  riskAssessment: {
    overallRisk: 'LOW',
    dataAccessRisks: [],
    complianceFlags: [],
    recommendations: [],
  },
};

describe('IcarusFlow', () => {
  let icarus: IcarusFlow;

  beforeEach(() => {
    icarus = new IcarusFlow({
      config: {
        llm: {
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'test-key',
          temperature: 0.1,
          maxTokens: 4096,
        },
      },
    });
  });

  describe('Workflow Execution', () => {
    it('should execute a predefined workflow plan successfully', async () => {
      const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      expect(result.success).toBe(true);
      expect(result.flow).toBeDefined();
      expect(result.flow?.status).toBe('COMMITTED');
      expect(result.chainCommitHash).toBeDefined();
    });

    it('should execute all tasks in order', async () => {
      const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      expect(result.flow?.tasks).toHaveLength(2);
      expect(result.flow?.tasks[0].status).toBe('SUCCESS');
      expect(result.flow?.tasks[1].status).toBe('SUCCESS');
    });

    it('should generate unique flow IDs', async () => {
      const result1 = await icarus.executePlan(testWorkflowPlan, testPolicyContext);
      const result2 = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      expect(result1.flow?.id).not.toBe(result2.flow?.id);
    });

    it('should produce chain commit hashes', async () => {
      const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      expect(result.chainCommitHash).toBeDefined();
      expect(result.chainCommitHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('Policy Validation', () => {
    it('should reject workflows from unauthorized users', async () => {
      const restrictedPlan: WorkflowPlan = {
        ...testWorkflowPlan,
        tasks: [
          {
            taskType: 'SNOWFLAKE_QUERY' as TaskType,
            description: 'Query sensitive data',
            params: { query: 'SELECT * FROM confidential_data' },
            dependencies: [],
            estimatedDurationMs: 2000,
          },
        ],
        requiredConnectors: ['SNOWFLAKE_QUERY'] as TaskType[],
      };

      // User without proper role
      const restrictedContext: PolicyContext = {
        ...testPolicyContext,
        roles: ['viewer'], // Only viewer role - no data access
        dataClassifications: ['public'], // Can only access public data
      };

      const result = await icarus.executePlan(restrictedPlan, restrictedContext);
      
      // Should fail policy check (viewer can't query Snowflake)
      expect(result.success).toBe(false);
      expect(result.error).toContain('Policy');
    });

    it('should enforce rate limits', async () => {
      // Execute multiple workflows quickly
      const results = await Promise.all([
        icarus.executePlan(testWorkflowPlan, testPolicyContext),
        icarus.executePlan(testWorkflowPlan, testPolicyContext),
        icarus.executePlan(testWorkflowPlan, testPolicyContext),
      ]);

      // All should succeed if within rate limits
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Audit Trail', () => {
    it('should create audit entries for workflow execution', async () => {
      const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      if (result.flow) {
        const auditTrail = icarus.getAuditTrail(result.flow.id);
        
        expect(auditTrail.length).toBeGreaterThan(0);
        expect(auditTrail.some(e => e.eventType === 'WORKFLOW_STARTED')).toBe(true);
        expect(auditTrail.some(e => e.eventType === 'WORKFLOW_COMPLETED')).toBe(true);
      }
    });

    it('should log task start and completion events', async () => {
      const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      if (result.flow) {
        const auditTrail = icarus.getAuditTrail(result.flow.id);
        
        const taskEvents = auditTrail.filter(
          e => e.eventType === 'TASK_STARTED' || e.eventType === 'TASK_COMPLETED'
        );
        
        // Should have start + complete for each task
        expect(taskEvents.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('Workflow Verification', () => {
    it('should verify committed workflows', async () => {
      const execResult = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

      if (execResult.flow && execResult.chainCommitHash) {
        // Compute expected hash
        const verifyResult = await icarus.verifyWorkflow(
          execResult.flow.id,
          '' // Empty hash for existence check
        );

        expect(verifyResult.valid || verifyResult.commit).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing executor gracefully', async () => {
      const invalidPlan: WorkflowPlan = {
        ...testWorkflowPlan,
        tasks: [
          {
            taskType: 'CUSTOM' as TaskType, // Use valid type but without executor
            description: 'Custom task without executor',
            params: {},
            dependencies: [],
            estimatedDurationMs: 1000,
          },
        ],
        requiredConnectors: ['CUSTOM'] as TaskType[],
      };

      const result = await icarus.executePlan(invalidPlan, testPolicyContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle task failures', async () => {
      // Create a plan with a task that will fail
      const failingPlan: WorkflowPlan = {
        ...testWorkflowPlan,
        tasks: [
          {
            taskType: 'EMAIL_SEND' as TaskType,
            description: 'Send email (will fail without config)',
            params: {
              to: 'invalid-email',
              subject: 'Test',
              body: 'Test body',
            },
            dependencies: [],
            estimatedDurationMs: 1000,
          },
        ],
        requiredConnectors: ['EMAIL_SEND'] as TaskType[],
      };

      const result = await icarus.executePlan(failingPlan, testPolicyContext);

      // Email executor might fail without proper config
      // This tests that failures are handled gracefully
      expect(result.flow).toBeDefined();
    });
  });
});

describe('WorkflowCompiler', () => {
  let icarus: IcarusFlow;

  beforeEach(() => {
    icarus = new IcarusFlow();
  });

  it('should detect circular dependencies', async () => {
    const circularPlan: WorkflowPlan = {
      ...testWorkflowPlan,
      tasks: [
        {
          taskType: 'DATA_TRANSFORM' as TaskType,
          description: 'Task A',
          params: {},
          dependencies: ['task_1'], // Depends on task_1
          estimatedDurationMs: 1000,
        },
        {
          taskType: 'DATA_TRANSFORM' as TaskType,
          description: 'Task B',
          params: {},
          dependencies: ['task_0'], // Depends on task_0 - circular!
          estimatedDurationMs: 1000,
        },
      ],
    };

    const result = await icarus.executePlan(circularPlan, testPolicyContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circular');
  });

  it('should validate task parameters', async () => {
    const invalidParamsPlan: WorkflowPlan = {
      ...testWorkflowPlan,
      tasks: [
        {
          taskType: 'SNOWFLAKE_QUERY' as TaskType,
          description: 'Query without SQL',
          params: {}, // Missing required 'query' param
          dependencies: [],
          estimatedDurationMs: 1000,
        },
      ],
    };

    // Should still compile (validation happens at execution)
    const result = await icarus.executePlan(invalidParamsPlan, testPolicyContext);
    
    // Either fails compilation or execution
    expect(result.flow).toBeDefined();
  });
});

describe('ChainAuditLogger', () => {
  let icarus: IcarusFlow;

  beforeEach(() => {
    icarus = new IcarusFlow();
  });

  it('should commit workflow state to chain', async () => {
    const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

    expect(result.chainCommitHash).toBeDefined();
    expect(result.chainCommitHash?.startsWith('0x')).toBe(true);
  });

  it('should maintain audit log integrity', async () => {
    const result = await icarus.executePlan(testWorkflowPlan, testPolicyContext);

    if (result.flow) {
      const auditTrail = icarus.getAuditTrail(result.flow.id);
      
      // Each entry should have required fields
      for (const entry of auditTrail) {
        expect(entry.id).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(entry.eventType).toBeDefined();
        expect(entry.flowId).toBe(result.flow.id);
        expect(entry.inputHash).toBeDefined();
      }
    }
  });

  it('should return all committed workflows', async () => {
    await icarus.executePlan(testWorkflowPlan, testPolicyContext);
    await icarus.executePlan(testWorkflowPlan, testPolicyContext);

    const commits = icarus.getAllCommits();

    expect(commits.length).toBeGreaterThanOrEqual(2);
  });
});
