/**
 * Data Transform Executor
 * 
 * MCP Connector for transforming data between tasks.
 * Supports filtering, aggregation, and format conversion.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
} from '../types/index.js';

export interface DataTransformParams {
  format?: 'json' | 'csv' | 'table' | 'summary';
  filter?: {
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  };
  aggregate?: {
    column: string;
    operation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
  select?: string[];
  limit?: number;
}

export interface DataTransformResult {
  format: string;
  rowCount: number;
  data: unknown;
}

export class DataTransformExecutor extends BaseExecutor {
  constructor() {
    super('DataTransformExecutor', '1.0.0');
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    // Transform is flexible, most params are optional
    return true;
  }

  /**
   * Execute data transformation
   */
  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as DataTransformParams;
    
    // Get input data from previous task
    const inputData = this.getInputData(task, context);
    
    if (!inputData) {
      return this.failure({
        code: 'NO_INPUT_DATA',
        message: 'No input data available for transformation',
        recoverable: false,
      });
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.transformData(inputData, params);
    });

    context.variables.set(`${task.id}_result`, result);

    return this.success(result, { durationMs });
  }

  /**
   * Get input data from context
   */
  private getInputData(task: Task, context: ExecutionContext): unknown {
    // Try to get from dependencies first
    for (const dep of task.dependencies) {
      const depResult = context.variables.get(`${dep}_result`);
      if (depResult) {
        return depResult;
      }
    }

    // Fall back to any result
    for (const [key, value] of context.variables) {
      if (key.endsWith('_result')) {
        return value;
      }
    }

    return null;
  }

  /**
   * Transform data according to params
   */
  private transformData(
    inputData: unknown,
    params: DataTransformParams
  ): DataTransformResult {
    let data: unknown = inputData;
    let rows: unknown[][] = [];

    // Extract rows from Snowflake result format
    if (this.isQueryResult(inputData)) {
      rows = inputData.rows;
      const columns = inputData.columns;

      // Apply filter
      if (params.filter) {
        const colIndex = columns.indexOf(params.filter.column);
        if (colIndex !== -1) {
          rows = rows.filter((row) => {
            const value = row[colIndex];
            return this.evaluateFilter(value, params.filter!.operator, params.filter!.value);
          });
        }
      }

      // Apply select
      if (params.select && params.select.length > 0) {
        const selectIndices = params.select
          .map((col) => columns.indexOf(col))
          .filter((i) => i !== -1);
        rows = rows.map((row) => selectIndices.map((i) => row[i]));
      }

      // Apply aggregation
      if (params.aggregate) {
        const colIndex = columns.indexOf(params.aggregate.column);
        if (colIndex !== -1) {
          const values = rows.map((row) => Number(row[colIndex])).filter((v) => !isNaN(v));
          const aggResult = this.aggregate(values, params.aggregate.operation);
          data = { [params.aggregate.column]: aggResult };
          rows = [[aggResult]];
        }
      }

      // Apply limit
      if (params.limit && params.limit > 0) {
        rows = rows.slice(0, params.limit);
      }

      data = { columns: params.select || columns, rows };
    }

    // Format output
    const format = params.format || 'json';
    let formattedData: unknown;

    switch (format) {
      case 'csv':
        formattedData = this.toCsv(data);
        break;
      case 'table':
        formattedData = this.toTable(data);
        break;
      case 'summary':
        formattedData = this.toSummary(data);
        break;
      default:
        formattedData = data;
    }

    return {
      format,
      rowCount: Array.isArray(rows) ? rows.length : 1,
      data: formattedData,
    };
  }

  /**
   * Check if input is a query result
   */
  private isQueryResult(data: unknown): data is { columns: string[]; rows: unknown[][] } {
    return (
      data !== null &&
      typeof data === 'object' &&
      'columns' in data &&
      'rows' in data &&
      Array.isArray((data as { rows: unknown }).rows)
    );
  }

  /**
   * Evaluate filter condition
   */
  private evaluateFilter(value: unknown, operator: string, target: unknown): boolean {
    switch (operator) {
      case 'eq':
        return value === target;
      case 'neq':
        return value !== target;
      case 'gt':
        return Number(value) > Number(target);
      case 'lt':
        return Number(value) < Number(target);
      case 'contains':
        return String(value).toLowerCase().includes(String(target).toLowerCase());
      default:
        return true;
    }
  }

  /**
   * Aggregate values
   */
  private aggregate(values: number[], operation: string): number {
    if (values.length === 0) return 0;

    switch (operation) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return 0;
    }
  }

  /**
   * Convert to CSV format
   */
  private toCsv(data: unknown): string {
    if (!this.isQueryResult(data)) {
      return JSON.stringify(data);
    }

    const lines: string[] = [];
    lines.push(data.columns.join(','));
    for (const row of data.rows) {
      lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }

  /**
   * Convert to table format
   */
  private toTable(data: unknown): string {
    if (!this.isQueryResult(data)) {
      return JSON.stringify(data, null, 2);
    }

    const colWidths = data.columns.map((col, i) => {
      const maxValueWidth = Math.max(
        ...data.rows.map((row) => String(row[i]).length)
      );
      return Math.max(col.length, maxValueWidth);
    });

    const lines: string[] = [];
    lines.push(data.columns.map((col, i) => col.padEnd(colWidths[i])).join(' | '));
    lines.push(colWidths.map((w) => '-'.repeat(w)).join('-+-'));
    for (const row of data.rows) {
      lines.push(row.map((v, i) => String(v).padEnd(colWidths[i])).join(' | '));
    }
    return lines.join('\n');
  }

  /**
   * Convert to summary format
   */
  private toSummary(data: unknown): string {
    if (!this.isQueryResult(data)) {
      return `Data summary: ${JSON.stringify(data).substring(0, 100)}...`;
    }

    return `Query Result Summary:
- Columns: ${data.columns.join(', ')}
- Row Count: ${data.rows.length}
- Sample Data: ${JSON.stringify(data.rows.slice(0, 3))}`;
  }
}
