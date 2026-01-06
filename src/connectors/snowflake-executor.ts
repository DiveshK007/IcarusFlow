/**
 * Snowflake Query Executor
 * 
 * MCP Connector for querying Snowflake data warehouse.
 * Executes SQL queries and returns structured results.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  SnowflakeConfig,
} from '../types/index.js';

export interface SnowflakeQueryParams {
  query: string;
  database?: string;
  schema?: string;
  warehouse?: string;
  timeout?: number;
  maxRows?: number;
}

export interface SnowflakeQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  metadata: {
    executionTimeMs: number;
    bytesScanned: number;
    queryId: string;
  };
}

export class SnowflakeExecutor extends BaseExecutor {
  private config: SnowflakeConfig;

  constructor(config: SnowflakeConfig) {
    super('SnowflakeQueryExecutor', '1.0.0');
    this.config = config;
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    const params = task.params as unknown as SnowflakeQueryParams;
    
    if (!params.query || typeof params.query !== 'string') {
      return false;
    }

    // Security checks
    const query = params.query.toLowerCase();
    
    // Block dangerous operations
    const blockedKeywords = ['drop', 'delete', 'truncate', 'alter', 'create', 'insert', 'update'];
    for (const keyword of blockedKeywords) {
      if (query.includes(keyword)) {
        console.warn(`Blocked SQL keyword detected: ${keyword}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Execute Snowflake query
   */
  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as SnowflakeQueryParams;
    
    if (!this.validate(task)) {
      return this.failure({
        code: 'INVALID_QUERY',
        message: 'Query validation failed',
        recoverable: false,
      });
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.executeQuery(params);
    });

    if (result.error) {
      return this.failure(
        {
          code: 'QUERY_FAILED',
          message: result.error,
          recoverable: true,
        },
        { durationMs }
      );
    }

    // Store result in context for downstream tasks
    context.variables.set(`${task.id}_result`, result.data);

    return this.success(result.data, {
      durationMs,
      bytesProcessed: result.data?.metadata?.bytesScanned ?? 0,
    });
  }

  /**
   * Execute the actual query (simulated for demo)
   */
  private async executeQuery(
    params: SnowflakeQueryParams
  ): Promise<{ data?: SnowflakeQueryResult; error?: string }> {
    // In production, this would use the Snowflake SDK
    // For demo purposes, we simulate the query execution
    
    console.log(`[Snowflake] Executing query: ${params.query.substring(0, 100)}...`);

    // Simulate network latency
    await this.sleep(500);

    // Parse query to generate mock data
    const mockData = this.generateMockData(params.query);

    return {
      data: {
        columns: mockData.columns,
        rows: mockData.rows,
        rowCount: mockData.rows.length,
        metadata: {
          executionTimeMs: 350,
          bytesScanned: 1024 * 100, // 100KB
          queryId: `01a12345-${Date.now()}`,
        },
      },
    };
  }

  /**
   * Generate mock data based on query
   */
  private generateMockData(query: string): { columns: string[]; rows: unknown[][] } {
    const lowerQuery = query.toLowerCase();

    // Sales data
    if (lowerQuery.includes('sales') || lowerQuery.includes('revenue')) {
      return {
        columns: ['date', 'product', 'region', 'sales', 'units'],
        rows: [
          ['2025-01-01', 'Product A', 'North', 15000, 150],
          ['2025-01-01', 'Product B', 'South', 22000, 180],
          ['2025-01-02', 'Product A', 'North', 18000, 175],
          ['2025-01-02', 'Product B', 'South', 19500, 160],
          ['2025-01-03', 'Product A', 'East', 21000, 200],
        ],
      };
    }

    // Churn data
    if (lowerQuery.includes('churn')) {
      return {
        columns: ['month', 'product', 'total_customers', 'churned', 'churn_rate'],
        rows: [
          ['2025-Q4', 'Enterprise', 1000, 25, 0.025],
          ['2025-Q4', 'Professional', 5000, 200, 0.04],
          ['2025-Q4', 'Basic', 20000, 1500, 0.075],
        ],
      };
    }

    // User data
    if (lowerQuery.includes('user') || lowerQuery.includes('customer')) {
      return {
        columns: ['user_id', 'name', 'email', 'signup_date', 'plan'],
        rows: [
          [1, 'John Doe', 'john@example.com', '2024-01-15', 'Enterprise'],
          [2, 'Jane Smith', 'jane@example.com', '2024-02-20', 'Professional'],
          [3, 'Bob Wilson', 'bob@example.com', '2024-03-10', 'Basic'],
        ],
      };
    }

    // Default
    return {
      columns: ['id', 'value', 'timestamp'],
      rows: [
        [1, 'data_1', '2025-01-06T10:00:00Z'],
        [2, 'data_2', '2025-01-06T11:00:00Z'],
        [3, 'data_3', '2025-01-06T12:00:00Z'],
      ],
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
