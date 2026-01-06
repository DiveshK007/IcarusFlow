/**
 * Policy Validator
 * 
 * This is the KILLER FEATURE of IcarusFlow.
 * 
 * Before execution, each task is checked against:
 * - Role permissions
 * - Data access scope
 * - Time / frequency limits
 * - Compliance rules
 * 
 * Policies are encoded in smart contracts and enforced pre-execution.
 * If a step violates policy:
 *   ❌ workflow halts
 *   ✔ rejection is logged on-chain
 * 
 * This is non-negotiable for enterprise use.
 */

import type {
  Flow,
  Task,
  Policy,
  PolicyRule,
  PolicyCheckResult,
} from '../types/index.js';

export interface PolicyContext {
  userId: string;
  roles: string[];
  department: string;
  dataClassifications: string[];
  timestamp: Date;
  sourceIp?: string;
  region?: string;
}

export interface ValidationResult {
  valid: boolean;
  results: PolicyCheckResult[];
  blockedTasks: string[];
  requiresApproval: string[];
}

export class PolicyValidator {
  private policies: Policy[];

  constructor(policies: Policy[] = []) {
    this.policies = policies;
  }

  /**
   * Load policies (from chain or config)
   */
  loadPolicies(policies: Policy[]): void {
    this.policies = policies;
  }

  /**
   * Add a single policy
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
  }

  /**
   * Validate an entire flow against all policies
   */
  async validateFlow(flow: Flow, context: PolicyContext): Promise<ValidationResult> {
    const results: PolicyCheckResult[] = [];
    const blockedTasks: string[] = [];
    const requiresApproval: string[] = [];

    for (const task of flow.tasks) {
      const taskResults = await this.validateTask(task, context);
      results.push(...taskResults);

      // Check if any policy blocks this task
      const blocked = taskResults.find(
        (r) => !r.passed && r.action === 'DENY'
      );
      if (blocked) {
        blockedTasks.push(task.id);
      }

      // Check if any policy requires approval
      const needsApproval = taskResults.find(
        (r) => r.action === 'REQUIRE_APPROVAL'
      );
      if (needsApproval && !blocked) {
        requiresApproval.push(task.id);
      }
    }

    return {
      valid: blockedTasks.length === 0,
      results,
      blockedTasks,
      requiresApproval,
    };
  }

  /**
   * Validate a single task against all applicable policies
   */
  async validateTask(task: Task, context: PolicyContext): Promise<PolicyCheckResult[]> {
    const results: PolicyCheckResult[] = [];

    for (const policy of this.policies) {
      if (policy.enforcementLevel === 'AUDIT_ONLY') {
        // Log but don't enforce
        continue;
      }

      for (const rule of policy.rules) {
        const result = await this.evaluateRule(rule, task, context, policy.id);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Evaluate a single policy rule against a task
   */
  private async evaluateRule(
    rule: PolicyRule,
    task: Task,
    context: PolicyContext,
    policyId: string
  ): Promise<PolicyCheckResult> {
    const now = new Date();
    let passed = true;
    let action = rule.action;

    switch (rule.type) {
      case 'ROLE_PERMISSION':
        passed = this.checkRolePermission(rule, task, context);
        break;

      case 'DATA_ACCESS':
        passed = this.checkDataAccess(rule, task, context);
        break;

      case 'RATE_LIMIT':
        passed = await this.checkRateLimit(rule, task, context);
        break;

      case 'TIME_WINDOW':
        passed = this.checkTimeWindow(rule, context);
        break;

      case 'DATA_CLASSIFICATION':
        passed = this.checkDataClassification(rule, task, context);
        break;

      case 'GEOGRAPHIC_RESTRICTION':
        passed = this.checkGeographicRestriction(rule, context);
        break;

      default:
        // Unknown rule type - fail closed for security
        passed = false;
    }

    // If rule failed and action was ALLOW, convert to DENY
    if (!passed && action === 'ALLOW') {
      action = 'DENY';
    }

    return {
      policyId,
      ruleId: rule.id,
      taskId: task.id,
      passed,
      action,
      message: passed ? 'Policy check passed' : rule.message,
      checkedAt: now,
    };
  }

  /**
   * Check if user has required role for the task
   */
  private checkRolePermission(
    rule: PolicyRule,
    task: Task,
    context: PolicyContext
  ): boolean {
    // Parse condition like "role:admin,analyst" or "role:data_engineer"
    const match = rule.condition.match(/role:(.+)/);
    if (!match) return true;

    const requiredRoles = match[1].split(',').map((r) => r.trim());
    return requiredRoles.some((role) => context.roles.includes(role));
  }

  /**
   * Check data access permissions
   */
  private checkDataAccess(
    rule: PolicyRule,
    task: Task,
    context: PolicyContext
  ): boolean {
    // Parse condition like "database:sales,marketing"
    const match = rule.condition.match(/database:(.+)/);
    if (!match) return true;

    const allowedDatabases = match[1].split(',').map((d) => d.trim());
    
    // Check if task accesses restricted databases
    const taskParams = task.params as Record<string, unknown>;
    const query = (taskParams.query as string) || '';
    
    // Simple check - in production, use proper SQL parsing
    for (const db of allowedDatabases) {
      if (query.toLowerCase().includes(db.toLowerCase())) {
        return true;
      }
    }
    
    // If no specific database mentioned, allow
    return !rule.condition.includes('required:');
  }

  /**
   * Check rate limits (placeholder for actual implementation)
   */
  private async checkRateLimit(
    rule: PolicyRule,
    task: Task,
    context: PolicyContext
  ): Promise<boolean> {
    // Parse condition like "limit:10/hour" or "limit:100/day"
    const match = rule.condition.match(/limit:(\d+)\/(\w+)/);
    if (!match) return true;

    const limit = parseInt(match[1]);
    const period = match[2];

    // In production, this would query the audit log or a rate limit service
    // For now, we'll implement a simple in-memory counter
    const key = `${context.userId}:${task.type}:${period}`;
    
    // Placeholder - always pass for now
    // Real implementation would track usage in Redis/on-chain
    console.log(`Rate limit check: ${key} against limit ${limit}/${period}`);
    return true;
  }

  /**
   * Check if current time is within allowed window
   */
  private checkTimeWindow(rule: PolicyRule, context: PolicyContext): boolean {
    // Parse condition like "hours:9-17" or "days:mon-fri"
    const hoursMatch = rule.condition.match(/hours:(\d+)-(\d+)/);
    if (hoursMatch) {
      const startHour = parseInt(hoursMatch[1]);
      const endHour = parseInt(hoursMatch[2]);
      const currentHour = context.timestamp.getHours();
      return currentHour >= startHour && currentHour <= endHour;
    }

    const daysMatch = rule.condition.match(/days:(.+)/);
    if (daysMatch) {
      const allowedDays = daysMatch[1].toLowerCase().split('-');
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const currentDay = dayNames[context.timestamp.getDay()];
      
      if (allowedDays.length === 2) {
        const startIdx = dayNames.indexOf(allowedDays[0]);
        const endIdx = dayNames.indexOf(allowedDays[1]);
        const currentIdx = dayNames.indexOf(currentDay);
        return currentIdx >= startIdx && currentIdx <= endIdx;
      }
      return allowedDays.includes(currentDay);
    }

    return true;
  }

  /**
   * Check data classification level
   */
  private checkDataClassification(
    rule: PolicyRule,
    task: Task,
    context: PolicyContext
  ): boolean {
    // Parse condition like "classification:public,internal"
    const match = rule.condition.match(/classification:(.+)/);
    if (!match) return true;

    const allowedClassifications = match[1].split(',').map((c) => c.trim().toLowerCase());
    
    // Check if user can access the data classification required by the task
    return context.dataClassifications.some((c) =>
      allowedClassifications.includes(c.toLowerCase())
    );
  }

  /**
   * Check geographic restrictions
   */
  private checkGeographicRestriction(
    rule: PolicyRule,
    context: PolicyContext
  ): boolean {
    // Parse condition like "region:us,eu" or "region:!cn,ru"
    const match = rule.condition.match(/region:(!?)(.+)/);
    if (!match) return true;

    const isBlocklist = match[1] === '!';
    const regions = match[2].split(',').map((r) => r.trim().toLowerCase());
    const userRegion = (context.region || '').toLowerCase();

    if (isBlocklist) {
      return !regions.includes(userRegion);
    }
    return regions.includes(userRegion);
  }

  /**
   * Get all policies that apply to a specific task type
   */
  getPoliciesForTaskType(taskType: string): Policy[] {
    return this.policies.filter((policy) =>
      policy.rules.some((rule) => {
        // Check if rule applies to this task type
        const taskTypeMatch = rule.condition.match(/taskType:(.+)/);
        if (!taskTypeMatch) return true; // Applies to all types
        const types = taskTypeMatch[1].split(',').map((t) => t.trim());
        return types.includes(taskType) || types.includes('*');
      })
    );
  }
}

/**
 * Default enterprise policies
 */
export function getDefaultPolicies(): Policy[] {
  return [
    {
      id: 'policy_data_access',
      name: 'Data Access Control',
      description: 'Controls access to sensitive data sources',
      enforcementLevel: 'STRICT',
      rules: [
        {
          id: 'rule_pii_access',
          type: 'ROLE_PERMISSION',
          condition: 'role:data_admin,compliance_officer',
          action: 'ALLOW',
          message: 'Access to PII data requires data_admin or compliance_officer role',
        },
      ],
    },
    {
      id: 'policy_rate_limits',
      name: 'Rate Limiting',
      description: 'Prevents abuse through rate limiting',
      enforcementLevel: 'STRICT',
      rules: [
        {
          id: 'rule_query_limit',
          type: 'RATE_LIMIT',
          condition: 'limit:100/hour',
          action: 'DENY',
          message: 'Rate limit exceeded: maximum 100 queries per hour',
        },
      ],
    },
    {
      id: 'policy_business_hours',
      name: 'Business Hours Access',
      description: 'Restricts certain operations to business hours',
      enforcementLevel: 'WARN',
      rules: [
        {
          id: 'rule_business_hours',
          type: 'TIME_WINDOW',
          condition: 'hours:6-22',
          action: 'REQUIRE_APPROVAL',
          message: 'Operation outside business hours requires approval',
        },
      ],
    },
    {
      id: 'policy_geo_restrictions',
      name: 'Geographic Restrictions',
      description: 'Data sovereignty compliance',
      enforcementLevel: 'STRICT',
      rules: [
        {
          id: 'rule_geo_block',
          type: 'GEOGRAPHIC_RESTRICTION',
          condition: 'region:us,eu,uk,ca,au',
          action: 'ALLOW',
          message: 'Access restricted to approved regions only',
        },
      ],
    },
  ];
}
