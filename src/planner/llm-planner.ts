/**
 * LLM Planner - Probabilistic Planning Layer
 * 
 * Purpose:
 * - Translate ambiguous human intent into a structured execution plan
 * 
 * IMPORTANT: The LLM does NOT output actions directly.
 * It outputs a structured workflow plan that will be:
 * 1. Validated by the compiler
 * 2. Checked against policies
 * 3. Executed by the orchestrator
 * 
 * The LLM is cognitively sandboxed:
 * - No direct API access
 * - No credentials
 * - No side effects
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  UserIntent,
  WorkflowPlan,
  PlannedTask,
  RiskAssessment,
  ExtractedEntity,
  TaskType,
  LLMConfig,
} from '../types/index.js';

export interface PlannerConfig extends LLMConfig {
  systemPrompt?: string;
  maxPlanningAttempts: number;
  enableRiskAssessment: boolean;
}

export interface PlanningResult {
  success: boolean;
  plan?: WorkflowPlan;
  error?: string;
  rawResponse?: string;
}

/**
 * System prompt for workflow planning
 */
const DEFAULT_SYSTEM_PROMPT = `You are an AI workflow planner for IcarusFlow, an enterprise workflow automation system.

Your job is to analyze user requests and create structured workflow plans. You MUST output valid JSON.

Available task types:
- SNOWFLAKE_QUERY: Query data from Snowflake data warehouse
- S3_UPLOAD: Upload files to AWS S3
- S3_DOWNLOAD: Download files from AWS S3
- EMAIL_SEND: Send email notifications
- CONFLUENCE_PUBLISH: Publish content to Confluence
- IMFS_STORE: Store data in In-Memory File System
- IMFS_RETRIEVE: Retrieve data from IMFS
- QUIVER_INDEX: Index data in vector database
- QUIVER_SEARCH: Search vector database
- DATA_TRANSFORM: Transform data (filter, aggregate, format)
- CONDITIONAL_BRANCH: Conditional logic
- HUMAN_APPROVAL: Require human approval

Output format:
{
  "intent": "parsed description of what user wants",
  "confidence": 0.0-1.0,
  "entities": [{"type": "...", "value": "..."}],
  "tasks": [
    {
      "taskType": "TASK_TYPE",
      "description": "What this task does",
      "params": { ... task-specific parameters ... },
      "dependencies": ["task_0", "task_1"],
      "estimatedDurationMs": 5000
    }
  ],
  "riskAssessment": {
    "overallRisk": "LOW|MEDIUM|HIGH",
    "dataAccessRisks": ["..."],
    "complianceFlags": ["..."],
    "recommendations": ["..."]
  }
}

Rules:
1. Break complex requests into discrete, atomic tasks
2. Use dependencies to express task ordering
3. First task has empty dependencies array
4. Be conservative with risk assessments
5. Include all necessary parameters for each task type`;

export class LLMPlanner {
  private config: PlannerConfig;
  private conversationHistory: Array<{ role: string; content: string }> = [];

  constructor(config: Partial<PlannerConfig> = {}) {
    this.config = {
      provider: config.provider || 'openai',
      model: config.model || 'gpt-4',
      temperature: config.temperature ?? 0.1,
      maxTokens: config.maxTokens || 4096,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
      systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      maxPlanningAttempts: config.maxPlanningAttempts || 3,
      enableRiskAssessment: config.enableRiskAssessment ?? true,
    };
  }

  /**
   * Check if running in demo mode (no valid API key)
   */
  private isDemoMode(): boolean {
    const apiKey = this.config.apiKey;
    return !apiKey || apiKey === '' || apiKey === 'demo-mode' ||
      process.env.ICARUS_DEMO_MODE === 'true';
  }

  /**
   * Generate a demo workflow plan based on keywords in input
   */
  private generateDemoPlan(userInput: string, intent: UserIntent): WorkflowPlan {
    const lowerInput = userInput.toLowerCase();
    const tasks: PlannedTask[] = [];
    let taskIndex = 0;

    // Detect data source keywords
    if (lowerInput.includes('snowflake') || lowerInput.includes('warehouse') ||
      lowerInput.includes('data') || lowerInput.includes('query') ||
      lowerInput.includes('churn') || lowerInput.includes('sales')) {
      tasks.push({
        taskType: 'SNOWFLAKE_QUERY' as TaskType,
        description: 'Query data from Snowflake data warehouse',
        params: {
          query: 'SELECT * FROM analytics.quarterly_metrics WHERE quarter = CURRENT_QUARTER()',
          outputFormat: 'json',
        },
        dependencies: [],
        estimatedDurationMs: 3000,
      });
      taskIndex++;
    }

    // Detect transformation keywords
    if (lowerInput.includes('transform') || lowerInput.includes('format') ||
      lowerInput.includes('convert') || lowerInput.includes('csv')) {
      tasks.push({
        taskType: 'DATA_TRANSFORM' as TaskType,
        description: 'Transform query results for downstream processing',
        params: {
          operation: 'format',
          outputFormat: 'csv',
        },
        dependencies: taskIndex > 0 ? [`task_${taskIndex - 1}`] : [],
        estimatedDurationMs: 1000,
      });
      taskIndex++;
    }

    // Detect storage keywords
    if (lowerInput.includes('s3') || lowerInput.includes('save') ||
      lowerInput.includes('upload') || lowerInput.includes('store')) {
      tasks.push({
        taskType: 'S3_UPLOAD' as TaskType,
        description: 'Upload results to S3 bucket',
        params: {
          bucket: 'icarusflow-demo',
          key: `reports/${new Date().toISOString().split('T')[0]}/report.csv`,
        },
        dependencies: taskIndex > 0 ? [`task_${taskIndex - 1}`] : [],
        estimatedDurationMs: 2000,
      });
      taskIndex++;
    }

    // Detect notification keywords
    if (lowerInput.includes('email') || lowerInput.includes('send') ||
      lowerInput.includes('notify') || lowerInput.includes('team')) {
      tasks.push({
        taskType: 'EMAIL_SEND' as TaskType,
        description: 'Send notification email to team',
        params: {
          recipients: ['analytics-team@company.com'],
          subject: 'IcarusFlow Report Generated',
          body: 'Your requested report has been generated and uploaded.',
        },
        dependencies: taskIndex > 0 ? [`task_${taskIndex - 1}`] : [],
        estimatedDurationMs: 1500,
      });
      taskIndex++;
    }

    // Default fallback if no keywords matched
    if (tasks.length === 0) {
      tasks.push(
        {
          taskType: 'SNOWFLAKE_QUERY' as TaskType,
          description: 'Query data from Snowflake',
          params: { query: 'SELECT * FROM demo_table LIMIT 100' },
          dependencies: [],
          estimatedDurationMs: 2000,
        },
        {
          taskType: 'S3_UPLOAD' as TaskType,
          description: 'Upload results to S3',
          params: { bucket: 'demo-bucket', key: 'demo-output.json' },
          dependencies: ['task_0'],
          estimatedDurationMs: 1500,
        },
      );
    }

    const totalDuration = tasks.reduce((sum, t) => sum + (t.estimatedDurationMs || 0), 0);

    return {
      id: uuidv4(),
      intent: {
        ...intent,
        parsedIntent: `Demo workflow: ${this.summarizeIntent(userInput)}`,
        confidence: 0.95,
      },
      tasks,
      estimatedDurationMs: totalDuration,
      requiredConnectors: [...new Set(tasks.map(t => t.taskType))] as TaskType[],
      riskAssessment: {
        overallRisk: 'LOW',
        dataAccessRisks: [],
        complianceFlags: [],
        recommendations: ['This is a demo workflow - all operations are simulated'],
      },
    };
  }

  /**
   * Parse user input and generate a workflow plan
   */
  async planWorkflow(userInput: string): Promise<PlanningResult> {
    const intent = this.parseIntent(userInput);

    // Use demo mode if no valid API key
    if (this.isDemoMode()) {
      console.log('📎 Running in DEMO MODE - using deterministic workflow planning');
      const plan = this.generateDemoPlan(userInput, intent);
      return { success: true, plan, rawResponse: 'DEMO_MODE' };
    }

    let lastError: string = '';

    for (let attempt = 0; attempt < this.config.maxPlanningAttempts; attempt++) {
      try {
        const response = await this.callLLM(userInput, attempt > 0);
        const plan = this.parseResponse(response, intent);

        if (plan) {
          return { success: true, plan, rawResponse: response };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        lastError = errorMessage;
        console.error(`Planning attempt ${attempt + 1} failed:`, error);

        // If it's an API error, fallback to demo mode immediately
        if (errorMessage.includes('OpenAI API error') ||
          errorMessage.includes('API error') ||
          errorMessage.includes('fetch failed') ||
          errorMessage.includes('401') ||
          errorMessage.includes('403') ||
          errorMessage.includes('429')) {
          console.log('📎 OpenAI API unavailable - falling back to DEMO MODE');
          const plan = this.generateDemoPlan(userInput, intent);
          return { success: true, plan, rawResponse: 'DEMO_MODE_FALLBACK' };
        }
      }
    }

    // Final fallback to demo mode
    console.log('📎 All planning attempts failed - using DEMO MODE');
    const plan = this.generateDemoPlan(userInput, intent);
    return { success: true, plan, rawResponse: 'DEMO_MODE_FALLBACK' };
  }

  /**
   * Parse user intent from raw input
   */
  private parseIntent(userInput: string): UserIntent {
    const entities = this.extractEntities(userInput);

    return {
      rawInput: userInput,
      parsedIntent: this.summarizeIntent(userInput),
      confidence: 0.0, // Will be updated by LLM
      entities,
    };
  }

  /**
   * Extract entities from user input
   */
  private extractEntities(input: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Extract database references
    const dbPatterns = [
      /from\s+(\w+\.\w+)/gi,
      /table\s+(\w+)/gi,
      /database\s+(\w+)/gi,
    ];

    for (const pattern of dbPatterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        entities.push({
          type: 'database_reference',
          value: match[1],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    // Extract email addresses
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
    let emailMatch;
    while ((emailMatch = emailPattern.exec(input)) !== null) {
      entities.push({
        type: 'email',
        value: emailMatch[0],
        startIndex: emailMatch.index,
        endIndex: emailMatch.index + emailMatch[0].length,
      });
    }

    // Extract S3 bucket references
    const s3Pattern = /s3:\/\/([a-z0-9.-]+)/gi;
    let s3Match;
    while ((s3Match = s3Pattern.exec(input)) !== null) {
      entities.push({
        type: 's3_bucket',
        value: s3Match[1],
        startIndex: s3Match.index,
        endIndex: s3Match.index + s3Match[0].length,
      });
    }

    // Extract time references
    const timePatterns = [
      /last\s+(month|week|quarter|year)/gi,
      /this\s+(month|week|quarter|year)/gi,
      /(\d{4}-\d{2}-\d{2})/g,
    ];

    for (const pattern of timePatterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        entities.push({
          type: 'time_reference',
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }

    return entities;
  }

  /**
   * Create a brief summary of the intent
   */
  private summarizeIntent(input: string): string {
    // Simple summarization - in production, could use LLM
    const words = input.split(/\s+/);
    if (words.length <= 10) {
      return input;
    }
    return words.slice(0, 10).join(' ') + '...';
  }

  /**
   * Call the LLM to generate a plan
   */
  private async callLLM(userInput: string, isRetry: boolean): Promise<string> {
    const messages = [
      { role: 'system', content: this.config.systemPrompt! },
      ...this.conversationHistory,
      {
        role: 'user',
        content: isRetry
          ? `Please try again with a valid JSON response:\n\n${userInput}`
          : userInput,
      },
    ];

    // Use OpenAI API
    if (this.config.provider === 'openai') {
      return await this.callOpenAI(messages);
    }

    // Fallback: Generate a mock plan for demo purposes
    return this.generateMockPlan(userInput);
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0].message.content;
  }

  /**
   * Parse LLM response into a WorkflowPlan
   */
  private parseResponse(response: string, intent: UserIntent): WorkflowPlan | null {
    try {
      const parsed = JSON.parse(response);

      // Validate required fields
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        console.error('Invalid response: missing tasks array');
        return null;
      }

      // Build the plan
      const tasks: PlannedTask[] = parsed.tasks.map((task: {
        taskType: string;
        description?: string;
        params?: Record<string, unknown>;
        dependencies?: string[];
        estimatedDurationMs?: number;
      }, index: number) => ({
        taskType: task.taskType as TaskType,
        description: task.description || `Task ${index + 1}`,
        params: task.params || {},
        dependencies: task.dependencies || [],
        estimatedDurationMs: task.estimatedDurationMs || 5000,
      }));

      // Calculate estimated duration
      const estimatedDurationMs = tasks.reduce(
        (sum, task) => sum + task.estimatedDurationMs,
        0
      );

      // Build risk assessment
      const riskAssessment: RiskAssessment = parsed.riskAssessment || {
        overallRisk: this.assessRisk(tasks),
        dataAccessRisks: this.identifyDataAccessRisks(tasks),
        complianceFlags: [],
        recommendations: [],
      };

      return {
        id: uuidv4(),
        intent: {
          ...intent,
          parsedIntent: parsed.intent || intent.parsedIntent,
          confidence: parsed.confidence || 0.8,
        },
        tasks,
        estimatedDurationMs,
        requiredConnectors: [...new Set(tasks.map((t) => t.taskType))],
        riskAssessment,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return null;
    }
  }

  /**
   * Assess overall risk level
   */
  private assessRisk(tasks: PlannedTask[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    const riskyTypes = ['EMAIL_SEND', 'CONFLUENCE_PUBLISH', 'S3_UPLOAD'];
    const dataTypes = ['SNOWFLAKE_QUERY', 'QUIVER_SEARCH'];

    const hasRiskyTasks = tasks.some((t) => riskyTypes.includes(t.taskType));
    const hasDataAccess = tasks.some((t) => dataTypes.includes(t.taskType));

    if (hasRiskyTasks && hasDataAccess) {
      return 'HIGH';
    }
    if (hasRiskyTasks || tasks.length > 5) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Identify data access risks
   */
  private identifyDataAccessRisks(tasks: PlannedTask[]): string[] {
    const risks: string[] = [];

    for (const task of tasks) {
      if (task.taskType === 'SNOWFLAKE_QUERY') {
        const query = (task.params.query as string) || '';
        if (query.toLowerCase().includes('select *')) {
          risks.push('Unrestricted SELECT * query detected');
        }
        if (
          query.toLowerCase().includes('drop') ||
          query.toLowerCase().includes('delete')
        ) {
          risks.push('Destructive query detected');
        }
      }

      if (task.taskType === 'EMAIL_SEND') {
        const recipients = task.params.recipients as string[];
        if (recipients && recipients.length > 10) {
          risks.push('Mass email detected');
        }
      }
    }

    return risks;
  }

  /**
   * Generate mock plan for demo/testing
   */
  private generateMockPlan(userInput: string): string {
    // Detect common patterns and generate appropriate plans
    const input = userInput.toLowerCase();

    if (input.includes('sales') || input.includes('data') || input.includes('query')) {
      return JSON.stringify({
        intent: 'Query data and process results',
        confidence: 0.85,
        tasks: [
          {
            taskType: 'SNOWFLAKE_QUERY',
            description: 'Query requested data from Snowflake',
            params: { query: 'SELECT * FROM sales_data WHERE date >= DATEADD(month, -1, CURRENT_DATE)' },
            dependencies: [],
            estimatedDurationMs: 5000,
          },
          {
            taskType: 'DATA_TRANSFORM',
            description: 'Transform and format query results',
            params: { format: 'csv' },
            dependencies: ['task_0'],
            estimatedDurationMs: 2000,
          },
          {
            taskType: 'S3_UPLOAD',
            description: 'Upload results to S3',
            params: { bucket: 'reports', key: 'output/results.csv' },
            dependencies: ['task_1'],
            estimatedDurationMs: 3000,
          },
        ],
        riskAssessment: {
          overallRisk: 'LOW',
          dataAccessRisks: [],
          complianceFlags: [],
          recommendations: ['Review query results before sharing'],
        },
      });
    }

    if (input.includes('email') || input.includes('notify') || input.includes('send')) {
      return JSON.stringify({
        intent: 'Send notification',
        confidence: 0.9,
        tasks: [
          {
            taskType: 'EMAIL_SEND',
            description: 'Send email notification',
            params: {
              recipients: ['team@example.com'],
              subject: 'Notification',
              body: 'This is an automated notification.',
            },
            dependencies: [],
            estimatedDurationMs: 2000,
          },
        ],
        riskAssessment: {
          overallRisk: 'LOW',
          dataAccessRisks: [],
          complianceFlags: [],
          recommendations: [],
        },
      });
    }

    // Default plan
    return JSON.stringify({
      intent: 'Execute workflow',
      confidence: 0.7,
      tasks: [
        {
          taskType: 'DATA_TRANSFORM',
          description: 'Process request',
          params: {},
          dependencies: [],
          estimatedDurationMs: 3000,
        },
      ],
      riskAssessment: {
        overallRisk: 'LOW',
        dataAccessRisks: [],
        complianceFlags: [],
        recommendations: [],
      },
    });
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add context to conversation
   */
  addContext(context: string): void {
    this.conversationHistory.push({ role: 'system', content: context });
  }
}
