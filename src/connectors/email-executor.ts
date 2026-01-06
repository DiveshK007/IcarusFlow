/**
 * Email Send Executor
 * 
 * MCP Connector for sending email notifications.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  EmailConfig,
} from '../types/index.js';
import { createHash } from 'crypto';

export interface EmailSendParams {
  recipients: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ name: string; content: string }>;
  isHtml?: boolean;
}

export interface EmailSendResult {
  messageId: string;
  recipients: string[];
  timestamp: string;
  status: 'sent' | 'queued';
}

export class EmailSendExecutor extends BaseExecutor {
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    super('EmailSendExecutor', '1.0.0');
    this.config = config;
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    const params = task.params as unknown as EmailSendParams;
    
    if (!params.recipients || !Array.isArray(params.recipients) || params.recipients.length === 0) {
      return false;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of params.recipients) {
      if (!emailRegex.test(email)) {
        console.warn(`Invalid email format: ${email}`);
        return false;
      }
    }

    if (!params.subject || typeof params.subject !== 'string') {
      return false;
    }

    // Rate limiting check - max 100 recipients
    if (params.recipients.length > 100) {
      console.warn('Too many recipients');
      return false;
    }

    return true;
  }

  /**
   * Execute email send
   */
  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as EmailSendParams;
    
    if (!this.validate(task)) {
      return this.failure({
        code: 'INVALID_PARAMS',
        message: 'Email parameters validation failed',
        recoverable: false,
      });
    }

    // Enrich body with data from context if needed
    let body = params.body;
    if (body.includes('{{data}}')) {
      const previousData = this.findPreviousResult(context);
      if (previousData) {
        body = body.replace('{{data}}', this.formatDataForEmail(previousData));
      }
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.sendEmail({ ...params, body });
    });

    if (result.error) {
      return this.failure(
        {
          code: 'EMAIL_FAILED',
          message: result.error,
          recoverable: true,
        },
        { durationMs }
      );
    }

    context.variables.set(`${task.id}_result`, result.data);

    return this.success(result.data, { durationMs });
  }

  /**
   * Send email (simulated for demo)
   */
  private async sendEmail(
    params: EmailSendParams
  ): Promise<{ data?: EmailSendResult; error?: string }> {
    console.log(`[Email] Sending to: ${params.recipients.join(', ')}`);
    console.log(`[Email] Subject: ${params.subject}`);

    // Simulate sending latency
    await this.sleep(200);

    // Generate message ID
    const messageId = createHash('sha256')
      .update(JSON.stringify(params) + Date.now())
      .digest('hex')
      .substring(0, 32);

    return {
      data: {
        messageId,
        recipients: params.recipients,
        timestamp: new Date().toISOString(),
        status: 'sent',
      },
    };
  }

  /**
   * Find result from previous task
   */
  private findPreviousResult(context: ExecutionContext): unknown {
    for (const [key, value] of context.variables) {
      if (key.endsWith('_result') && value !== null) {
        return value;
      }
    }
    return null;
  }

  /**
   * Format data for email body
   */
  private formatDataForEmail(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    // Format query results as a table
    if (data && typeof data === 'object' && 'rows' in data && 'columns' in data) {
      const result = data as { columns: string[]; rows: unknown[][] };
      let table = result.columns.join(' | ') + '\n';
      table += result.columns.map(() => '---').join(' | ') + '\n';
      for (const row of result.rows.slice(0, 10)) {
        table += row.join(' | ') + '\n';
      }
      if (result.rows.length > 10) {
        table += `... and ${result.rows.length - 10} more rows`;
      }
      return table;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
