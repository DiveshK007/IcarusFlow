/**
 * S3 Upload Executor - Production Implementation
 * 
 * MCP Connector for AWS S3 file storage.
 * Uses the official AWS SDK v3 for real S3 operations.
 * 
 * Falls back to demo mode when credentials are not configured.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  S3Config,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { createHash } from 'crypto';

// AWS SDK imports
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';

export interface S3UploadParams {
  bucket?: string;
  key: string;
  data?: unknown;
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: 'private' | 'public-read' | 'public-read-write';
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  url: string;
  etag: string;
  contentHash: string;
  bytesUploaded: number;
  timestamp: string;
}

export class S3UploadExecutor extends BaseExecutor {
  private config: S3Config;
  private client: S3Client | null = null;
  private isDemoMode: boolean;

  constructor(config: S3Config) {
    super('S3UploadExecutor', '2.0.0');
    this.config = config;

    // Check if we have valid credentials
    this.isDemoMode = !config.accessKeyId ||
      !config.secretAccessKey ||
      config.accessKeyId === 'demo-access-key';

    if (!this.isDemoMode) {
      this.client = new S3Client({
        region: config.region || 'us-east-1',
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
      logger.info(`[S3] Initialized for region: ${config.region || 'us-east-1'}`);
    } else {
      logger.info('[S3] Running in demo mode (no valid credentials)');
    }
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    const params = task.params as unknown as S3UploadParams;

    if (!params.key || typeof params.key !== 'string') {
      logger.warn('[S3] Missing or invalid key parameter');
      return false;
    }

    // Validate key format
    if (params.key.startsWith('/')) {
      logger.warn('[S3] Key should not start with /');
      return false;
    }

    return true;
  }

  /**
   * Execute S3 upload
   */
  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as S3UploadParams;

    if (!this.validate(task)) {
      return this.failure({
        code: 'INVALID_PARAMS',
        message: 'S3 parameters validation failed',
        recoverable: false,
      });
    }

    // Get data from params or from previous task result
    let uploadData = params.data;
    if (!uploadData) {
      uploadData = this.findPreviousResult(context);
    }

    if (!uploadData) {
      return this.failure({
        code: 'NO_DATA',
        message: 'No data to upload',
        recoverable: false,
      });
    }

    const { result, durationMs } = await this.timed(async () => {
      if (this.isDemoMode) {
        return this.executeDemoUpload(params, uploadData);
      }
      return this.executeRealUpload(params, uploadData);
    });

    if (result.error) {
      return this.failure(
        {
          code: 'UPLOAD_FAILED',
          message: result.error,
          recoverable: true,
        },
        { durationMs }
      );
    }

    // Store result in context
    context.variables.set(`${task.id}_result`, result.data);

    return this.success(result.data, {
      durationMs,
      bytesProcessed: result.data?.bytesUploaded ?? 0,
    });
  }

  /**
   * Execute real S3 upload using AWS SDK
   */
  private async executeRealUpload(
    params: S3UploadParams,
    data: unknown
  ): Promise<{ data?: S3UploadResult; error?: string }> {
    if (!this.client) {
      return { error: 'S3 client not initialized' };
    }

    const bucket = params.bucket || this.config.bucketName;
    if (!bucket) {
      return { error: 'No bucket specified' };
    }

    try {
      // Convert data to buffer
      const body = this.serializeData(data, params.contentType);
      const contentHash = createHash('sha256').update(body).digest('hex');

      const putParams: PutObjectCommandInput = {
        Bucket: bucket,
        Key: params.key,
        Body: body,
        ContentType: params.contentType || this.detectContentType(params.key),
        Metadata: {
          ...params.metadata,
          'x-icarus-hash': contentHash,
        },
      };

      logger.info(`[S3] Uploading to s3://${bucket}/${params.key} (${body.length} bytes)`);

      const command = new PutObjectCommand(putParams);
      const response = await this.client.send(command);

      const result: S3UploadResult = {
        bucket,
        key: params.key,
        url: `https://${bucket}.s3.amazonaws.com/${params.key}`,
        etag: response.ETag || '',
        contentHash,
        bytesUploaded: body.length,
        timestamp: new Date().toISOString(),
      };

      logger.info(`[S3] ✓ Upload complete: ${result.url}`);
      logger.debug(`[S3] ETag: ${result.etag}, Hash: ${contentHash.substring(0, 16)}...`);

      return { data: result };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown S3 error';
      logger.error(`[S3] Upload failed: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * Execute demo upload (simulated)
   */
  private async executeDemoUpload(
    params: S3UploadParams,
    data: unknown
  ): Promise<{ data?: S3UploadResult; error?: string }> {
    const bucket = params.bucket || this.config.bucketName || 'demo-bucket';

    logger.info(`[S3] [DEMO] Uploading to s3://${bucket}/${params.key}`);

    // Simulate upload latency
    await this.sleep(300);

    const body = this.serializeData(data, params.contentType);
    const contentHash = createHash('sha256').update(body).digest('hex');

    return {
      data: {
        bucket,
        key: params.key,
        url: `https://${bucket}.s3.amazonaws.com/${params.key}`,
        etag: `"${contentHash.substring(0, 32)}"`,
        contentHash,
        bytesUploaded: body.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Serialize data for upload
   */
  private serializeData(data: unknown, contentType?: string): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (typeof data === 'string') {
      return Buffer.from(data, 'utf-8');
    }

    // Check for tabular data (from Snowflake, etc.)
    if (data && typeof data === 'object' && 'rows' in data && 'columns' in data) {
      const tabularData = data as { columns: string[]; rows: unknown[][] };

      if (contentType?.includes('csv')) {
        return Buffer.from(this.toCSV(tabularData), 'utf-8');
      }
    }

    // Default to JSON
    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Convert tabular data to CSV
   */
  private toCSV(data: { columns: string[]; rows: unknown[][] }): string {
    const header = data.columns.join(',');
    const rows = data.rows.map(row =>
      row.map(cell => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        return str.includes(',') || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Detect content type from file extension
   */
  private detectContentType(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      'json': 'application/json',
      'csv': 'text/csv',
      'txt': 'text/plain',
      'html': 'text/html',
      'xml': 'application/xml',
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
    };
    return types[ext || ''] || 'application/octet-stream';
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
