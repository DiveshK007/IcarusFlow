/**
 * Email Send Executor - Production Implementation
 * 
 * MCP Connector for sending email notifications.
 * Uses Nodemailer for real SMTP operations.
 * 
 * Falls back to demo mode when credentials are not configured.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  EmailConfig,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailSendParams {
  recipients: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  isHtml?: boolean;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
  recipients: string[];
  timestamp: string;
  status: 'sent' | 'queued';
  accepted: string[];
  rejected: string[];
}

export class EmailSendExecutor extends BaseExecutor {
  private config: EmailConfig;
  private transporter: Transporter | null = null;
  private isDemoMode: boolean;

  constructor(config: EmailConfig) {
    super('EmailSendExecutor', '2.0.0');
    this.config = config;

    // Check if we have valid credentials
    this.isDemoMode = !config.host ||
      !config.user ||
      !config.password ||
      config.host === 'smtp.demo.com';

    if (!this.isDemoMode) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });
      logger.info(`[Email] Initialized SMTP transport: ${config.host}:${config.port || 587}`);
    } else {
      logger.info('[Email] Running in demo mode (no valid credentials)');
    }
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    const params = task.params as unknown as EmailSendParams;

    if (!params.recipients || !Array.isArray(params.recipients) || params.recipients.length === 0) {
      logger.warn('[Email] Missing or empty recipients');
      return false;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of params.recipients) {
      if (!emailRegex.test(email)) {
        logger.warn(`[Email] Invalid email format: ${email}`);
        return false;
      }
    }

    if (!params.subject || typeof params.subject !== 'string') {
      logger.warn('[Email] Missing or invalid subject');
      return false;
    }

    // Rate limiting check - max 100 recipients
    const totalRecipients = (params.recipients?.length || 0) +
      (params.cc?.length || 0) +
      (params.bcc?.length || 0);
    if (totalRecipients > 100) {
      logger.warn('[Email] Too many recipients (max 100)');
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
      if (this.isDemoMode) {
        return this.executeDemoSend({ ...params, body });
      }
      return this.executeRealSend({ ...params, body });
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
   * Execute real email send using Nodemailer
   */
  private async executeRealSend(
    params: EmailSendParams
  ): Promise<{ data?: EmailSendResult; error?: string }> {
    if (!this.transporter) {
      return { error: 'Email transporter not initialized' };
    }

    try {
      logger.info(`[Email] Sending to: ${params.recipients.join(', ')}`);
      logger.info(`[Email] Subject: ${params.subject}`);

      const mailOptions = {
        from: this.config.from || this.config.user,
        to: params.recipients.join(', '),
        cc: params.cc?.join(', '),
        bcc: params.bcc?.join(', '),
        subject: params.subject,
        [params.isHtml ? 'html' : 'text']: params.body,
        replyTo: params.replyTo,
        attachments: params.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);

      const result: EmailSendResult = {
        messageId: info.messageId,
        recipients: params.recipients,
        timestamp: new Date().toISOString(),
        status: 'sent',
        accepted: (info.accepted || []) as string[],
        rejected: (info.rejected || []) as string[],
      };

      logger.info(`[Email] ✓ Sent successfully. Message ID: ${info.messageId}`);

      return { data: result };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
      logger.error(`[Email] Send failed: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * Execute demo email send (simulated)
   */
  private async executeDemoSend(
    params: EmailSendParams
  ): Promise<{ data?: EmailSendResult; error?: string }> {
    logger.info(`[Email] [DEMO] Sending to: ${params.recipients.join(', ')}`);
    logger.info(`[Email] [DEMO] Subject: ${params.subject}`);

    // Simulate sending latency
    await this.sleep(200);

    // Generate message ID
    const messageId = createHash('sha256')
      .update(JSON.stringify(params) + Date.now())
      .digest('hex')
      .substring(0, 32) + '@icarusflow.demo';

    return {
      data: {
        messageId,
        recipients: params.recipients,
        timestamp: new Date().toISOString(),
        status: 'sent',
        accepted: params.recipients,
        rejected: [],
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

    // Format S3 upload result
    if (data && typeof data === 'object' && 'url' in data) {
      const s3Result = data as { url: string; key: string; bytesUploaded: number };
      return `File uploaded to: ${s3Result.url}\nKey: ${s3Result.key}\nSize: ${s3Result.bytesUploaded} bytes`;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter || this.isDemoMode) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('[Email] SMTP connection verified');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[Email] SMTP verification failed: ${errorMessage}`);
      return false;
    }
  }
}
