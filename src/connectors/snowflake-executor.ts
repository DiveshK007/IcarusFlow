/**
 * Snowflake Query Executor - Production Implementation
 * 
 * MCP Connector for querying Snowflake data warehouse.
 * Uses the official Snowflake SDK for real database operations.
 * 
 * Falls back to demo mode when credentials are not configured.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  SnowflakeConfig,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// Conditional import for Snowflake SDK
let snowflake: typeof import('snowflake-sdk') | null = null;
try {
  snowflake = await import('snowflake-sdk');
} catch {
  logger.warn('[Snowflake] SDK not available, using demo mode');
}

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
  private connection: unknown = null;
  private isDemoMode: boolean;

  constructor(config: SnowflakeConfig) {
    super('SnowflakeQueryExecutor', '2.0.0');
    this.config = config;

    // Check if we have valid credentials
    this.isDemoMode = !config.account ||
      !config.username ||
      !config.password ||
      config.account === 'demo-account' ||
      !snowflake;

    if (this.isDemoMode) {
      logger.info('[Snowflake] Running in demo mode (no valid credentials)');
    }
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
        logger.warn(`[Snowflake] Blocked SQL keyword detected: ${keyword}`);
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
      if (this.isDemoMode) {
        return this.executeDemoQuery(params);
      }
      return this.executeRealQuery(params);
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
   * Execute real Snowflake query using SDK
   */
  private async executeRealQuery(
    params: SnowflakeQueryParams
  ): Promise<{ data?: SnowflakeQueryResult; error?: string }> {
    if (!snowflake) {
      return { error: 'Snowflake SDK not available' };
    }

    logger.info(`[Snowflake] Executing real query: ${params.query.substring(0, 100)}...`);

    return new Promise((resolve) => {
      const startTime = Date.now();

      // Create connection
      const connection = snowflake.createConnection({
        account: this.config.account,
        username: this.config.username,
        password: this.config.password,
        database: params.database || this.config.database,
        warehouse: params.warehouse || this.config.warehouse,
        schema: params.schema || this.config.schema,
      });

      // Connect
      connection.connect((err) => {
        if (err) {
          logger.error(`[Snowflake] Connection failed: ${err.message}`);
          resolve({ error: `Connection failed: ${err.message}` });
          return;
        }

        // Execute query
        connection.execute({
          sqlText: params.query,
          complete: (queryErr, stmt, rows) => {
            const executionTimeMs = Date.now() - startTime;

            if (queryErr) {
              logger.error(`[Snowflake] Query failed: ${queryErr.message}`);
              resolve({ error: `Query failed: ${queryErr.message}` });
              return;
            }

            // Extract columns
            const columns = stmt?.getColumns()?.map((col: { getName: () => string }) => col.getName()) || [];

            // Apply row limit if specified
            let resultRows = rows || [];
            if (params.maxRows && resultRows.length > params.maxRows) {
              resultRows = resultRows.slice(0, params.maxRows);
            }

            const data: SnowflakeQueryResult = {
              columns,
              rows: resultRows.map((row: Record<string, unknown>) =>
                columns.map((col: string) => row[col])
              ),
              rowCount: resultRows.length,
              metadata: {
                executionTimeMs,
                bytesScanned: stmt.getSqlText().length * 100, // Approximate
                queryId: stmt.getStatementId(),
              },
            };

            logger.info(`[Snowflake] Query completed: ${data.rowCount} rows in ${executionTimeMs}ms`);
            resolve({ data });
          },
        });
      });
    });
  }

  /**
   * Execute demo query (simulated data)
   */
  private async executeDemoQuery(
    params: SnowflakeQueryParams
  ): Promise<{ data?: SnowflakeQueryResult; error?: string }> {
    logger.info(`[Snowflake] [DEMO] Executing query: ${params.query.substring(0, 100)}...`);

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
          queryId: `demo-${Date.now()}`,
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
