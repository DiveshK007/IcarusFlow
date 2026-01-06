/**
 * S3 Upload Executor
 * 
 * MCP Connector for uploading files to AWS S3.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
  S3Config,
} from '../types/index.js';
import { createHash } from 'crypto';

export interface S3UploadParams {
  bucket: string;
  key: string;
  data?: unknown;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  etag: string;
  url: string;
  size: number;
}

export class S3UploadExecutor extends BaseExecutor {
  private config: S3Config;

  constructor(config: S3Config) {
    super('S3UploadExecutor', '1.0.0');
    this.config = config;
  }

  /**
   * Validate task parameters
   */
  validate(task: Task): boolean {
    const params = task.params as unknown as S3UploadParams;
    
    if (!params.bucket || typeof params.bucket !== 'string') {
      return false;
    }

    if (!params.key || typeof params.key !== 'string') {
      return false;
    }

    // Validate key format (no traversal attacks)
    if (params.key.includes('..') || params.key.startsWith('/')) {
      console.warn('Invalid S3 key format');
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
        message: 'S3 upload parameters validation failed',
        recoverable: false,
      });
    }

    // Get data from context (from previous task) or from params
    let uploadData = params.data;
    if (!uploadData) {
      // Look for data from previous tasks
      for (const [key, value] of context.variables) {
        if (key.endsWith('_result')) {
          uploadData = value;
          break;
        }
      }
    }

    if (!uploadData) {
      return this.failure({
        code: 'NO_DATA',
        message: 'No data available for upload',
        recoverable: false,
      });
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.uploadToS3(params, uploadData);
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
      bytesProcessed: result.data?.size ?? 0,
    });
  }

  /**
   * Upload to S3 (simulated for demo)
   */
  private async uploadToS3(
    params: S3UploadParams,
    data: unknown
  ): Promise<{ data?: S3UploadResult; error?: string }> {
    console.log(`[S3] Uploading to s3://${params.bucket}/${params.key}`);

    // Simulate upload latency
    await this.sleep(300);

    // Serialize data
    const serializedData = JSON.stringify(data);
    const size = Buffer.byteLength(serializedData, 'utf8');
    const etag = createHash('md5').update(serializedData).digest('hex');

    // Generate presigned URL (simulated)
    const url = `https://${params.bucket}.s3.${this.config.region}.amazonaws.com/${params.key}`;

    return {
      data: {
        bucket: params.bucket,
        key: params.key,
        etag: `"${etag}"`,
        url,
        size,
      },
    };
  }

  /**
   * Cleanup - delete uploaded file on rollback
   */
  async cleanup(task: Task, context: ExecutionContext): Promise<void> {
    const result = context.variables.get(`${task.id}_result`) as S3UploadResult | undefined;
    
    if (result) {
      console.log(`[S3] Cleanup: Would delete s3://${result.bucket}/${result.key}`);
      // In production, this would call S3 DeleteObject
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
