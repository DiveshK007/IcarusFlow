/**
 * IMFS (In-Memory File System) Executor
 * 
 * MCP Connector for storing and retrieving intermediate results
 * on the Icarus chain's in-memory file system.
 */

import { BaseExecutor } from './base-executor.js';
import type {
  Task,
  ExecutionContext,
  ExecutorResult,
} from '../types/index.js';
import { createHash } from 'crypto';

export interface IMFSStoreParams {
  key: string;
  data?: unknown;
  ttlSeconds?: number;
}

export interface IMFSRetrieveParams {
  key: string;
}

export interface IMFSResult {
  key: string;
  hash: string;
  size: number;
  timestamp: string;
}

// Simulated in-memory storage
const imfsStorage = new Map<string, { data: unknown; hash: string; timestamp: Date }>();

export class IMFSStoreExecutor extends BaseExecutor {
  constructor() {
    super('IMFSStoreExecutor', '1.0.0');
  }

  validate(task: Task): boolean {
    const params = task.params as unknown as IMFSStoreParams;
    return !!params.key && typeof params.key === 'string';
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as IMFSStoreParams;
    
    if (!this.validate(task)) {
      return this.failure({
        code: 'INVALID_PARAMS',
        message: 'IMFS store requires a key parameter',
        recoverable: false,
      });
    }

    // Get data from params or previous task
    let data = params.data;
    if (!data) {
      for (const [key, value] of context.variables) {
        if (key.endsWith('_result')) {
          data = value;
          break;
        }
      }
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.storeData(params.key, data);
    });

    // Track in context for cleanup
    context.imfsFiles.set(params.key, result.hash);
    context.variables.set(`${task.id}_result`, result);

    return this.success(result, { durationMs, bytesProcessed: result.size });
  }

  private storeData(key: string, data: unknown): IMFSResult {
    const serialized = JSON.stringify(data);
    const hash = createHash('sha256').update(serialized).digest('hex');
    const timestamp = new Date();

    imfsStorage.set(key, { data, hash, timestamp });

    console.log(`[IMFS] Stored: ${key} (${hash.substring(0, 8)}...)`);

    return {
      key,
      hash,
      size: Buffer.byteLength(serialized, 'utf8'),
      timestamp: timestamp.toISOString(),
    };
  }

  async cleanup(task: Task, context: ExecutionContext): Promise<void> {
    const params = task.params as unknown as IMFSStoreParams;
    if (imfsStorage.has(params.key)) {
      imfsStorage.delete(params.key);
      console.log(`[IMFS] Cleanup: Deleted ${params.key}`);
    }
  }
}

export class IMFSRetrieveExecutor extends BaseExecutor {
  constructor() {
    super('IMFSRetrieveExecutor', '1.0.0');
  }

  validate(task: Task): boolean {
    const params = task.params as unknown as IMFSRetrieveParams;
    return !!params.key && typeof params.key === 'string';
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutorResult> {
    const params = task.params as unknown as IMFSRetrieveParams;
    
    if (!this.validate(task)) {
      return this.failure({
        code: 'INVALID_PARAMS',
        message: 'IMFS retrieve requires a key parameter',
        recoverable: false,
      });
    }

    const { result, durationMs } = await this.timed(async () => {
      return this.retrieveData(params.key);
    });

    if (!result) {
      return this.failure({
        code: 'NOT_FOUND',
        message: `IMFS key not found: ${params.key}`,
        recoverable: false,
      });
    }

    context.variables.set(`${task.id}_result`, result.data);

    return this.success(result, { durationMs });
  }

  private retrieveData(key: string): { data: unknown; hash: string } | null {
    const stored = imfsStorage.get(key);
    if (!stored) {
      return null;
    }

    console.log(`[IMFS] Retrieved: ${key}`);
    return { data: stored.data, hash: stored.hash };
  }
}
