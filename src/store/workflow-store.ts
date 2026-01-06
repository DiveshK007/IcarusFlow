/**
 * Workflow State Store
 * 
 * Provides persistent storage for workflow executions with support for:
 * - Flow state management
 * - Checkpoint/recovery
 * - Query by status, user, time range
 * 
 * Design: Interface-based for easy swap between implementations
 * - MemoryStore: For development/testing
 * - Future: PostgresStore, RedisStore, etc.
 */

import type { Flow, WorkflowStatus, AuditEntry } from '../types/index.js';

/**
 * Store interface for workflow persistence
 */
export interface WorkflowStore {
  /** Save or update a flow */
  saveFlow(flow: Flow): Promise<void>;
  
  /** Get a flow by ID */
  getFlow(flowId: string): Promise<Flow | null>;
  
  /** Delete a flow */
  deleteFlow(flowId: string): Promise<boolean>;
  
  /** List flows with optional filtering */
  listFlows(filter?: FlowFilter): Promise<Flow[]>;
  
  /** Save a checkpoint for recovery */
  saveCheckpoint(flowId: string, checkpoint: Checkpoint): Promise<void>;
  
  /** Get the latest checkpoint for a flow */
  getCheckpoint(flowId: string): Promise<Checkpoint | null>;
  
  /** Clear all data (for testing) */
  clear(): Promise<void>;
  
  /** Get store statistics */
  getStats(): Promise<StoreStats>;
}

export interface FlowFilter {
  status?: WorkflowStatus[];
  userId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface Checkpoint {
  flowId: string;
  timestamp: Date;
  completedTasks: string[];
  variables: Record<string, unknown>;
  lastTaskId: string;
}

export interface StoreStats {
  totalFlows: number;
  flowsByStatus: Record<WorkflowStatus, number>;
  checkpointCount: number;
  oldestFlow?: Date;
  newestFlow?: Date;
}

/**
 * In-Memory Workflow Store
 * 
 * Fast storage for development and testing.
 * Data is lost on restart.
 */
export class MemoryWorkflowStore implements WorkflowStore {
  private flows: Map<string, Flow> = new Map();
  private checkpoints: Map<string, Checkpoint> = new Map();

  async saveFlow(flow: Flow): Promise<void> {
    this.flows.set(flow.id, { ...flow });
  }

  async getFlow(flowId: string): Promise<Flow | null> {
    const flow = this.flows.get(flowId);
    return flow ? { ...flow } : null;
  }

  async deleteFlow(flowId: string): Promise<boolean> {
    const existed = this.flows.has(flowId);
    this.flows.delete(flowId);
    this.checkpoints.delete(flowId);
    return existed;
  }

  async listFlows(filter?: FlowFilter): Promise<Flow[]> {
    let flows = Array.from(this.flows.values());

    if (filter) {
      if (filter.status?.length) {
        flows = flows.filter(f => filter.status!.includes(f.status));
      }
      if (filter.userId) {
        flows = flows.filter(f => f.metadata.createdBy === filter.userId);
      }
      if (filter.createdAfter) {
        flows = flows.filter(f => f.metadata.createdAt >= filter.createdAfter!);
      }
      if (filter.createdBefore) {
        flows = flows.filter(f => f.metadata.createdAt <= filter.createdBefore!);
      }

      // Sort by creation date descending
      flows.sort((a, b) => 
        b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime()
      );

      if (filter.offset) {
        flows = flows.slice(filter.offset);
      }
      if (filter.limit) {
        flows = flows.slice(0, filter.limit);
      }
    }

    return flows.map(f => ({ ...f }));
  }

  async saveCheckpoint(flowId: string, checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(flowId, { ...checkpoint });
  }

  async getCheckpoint(flowId: string): Promise<Checkpoint | null> {
    const checkpoint = this.checkpoints.get(flowId);
    return checkpoint ? { ...checkpoint } : null;
  }

  async clear(): Promise<void> {
    this.flows.clear();
    this.checkpoints.clear();
  }

  async getStats(): Promise<StoreStats> {
    const flows = Array.from(this.flows.values());
    
    const statusCounts: Record<WorkflowStatus, number> = {
      PENDING: 0,
      RUNNING: 0,
      COMMITTED: 0,
      FAILED: 0,
      ROLLED_BACK: 0,
    };

    let oldest: Date | undefined;
    let newest: Date | undefined;

    for (const flow of flows) {
      statusCounts[flow.status]++;
      const created = flow.metadata.createdAt;
      if (!oldest || created < oldest) oldest = created;
      if (!newest || created > newest) newest = created;
    }

    return {
      totalFlows: flows.length,
      flowsByStatus: statusCounts,
      checkpointCount: this.checkpoints.size,
      oldestFlow: oldest,
      newestFlow: newest,
    };
  }
}

/**
 * Singleton store instance
 * In production, this would be configured at startup
 */
let storeInstance: WorkflowStore | null = null;

export function getWorkflowStore(): WorkflowStore {
  if (!storeInstance) {
    storeInstance = new MemoryWorkflowStore();
  }
  return storeInstance;
}

export function setWorkflowStore(store: WorkflowStore): void {
  storeInstance = store;
}

/**
 * Audit Entry Store
 * 
 * Separate store for audit entries to allow different retention policies
 */
export interface AuditStore {
  saveEntry(entry: AuditEntry): Promise<void>;
  getEntriesForFlow(flowId: string): Promise<AuditEntry[]>;
  queryEntries(filter: AuditFilter): Promise<AuditEntry[]>;
  clear(): Promise<void>;
}

export interface AuditFilter {
  flowId?: string;
  eventType?: string[];
  actor?: string;
  after?: Date;
  before?: Date;
  limit?: number;
}

/**
 * In-Memory Audit Store
 */
export class MemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];

  async saveEntry(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async getEntriesForFlow(flowId: string): Promise<AuditEntry[]> {
    return this.entries
      .filter(e => e.flowId === flowId)
      .map(e => ({ ...e }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async queryEntries(filter: AuditFilter): Promise<AuditEntry[]> {
    let results = [...this.entries];

    if (filter.flowId) {
      results = results.filter(e => e.flowId === filter.flowId);
    }
    if (filter.eventType?.length) {
      results = results.filter(e => filter.eventType!.includes(e.eventType));
    }
    if (filter.actor) {
      results = results.filter(e => e.actor === filter.actor);
    }
    if (filter.after) {
      results = results.filter(e => e.timestamp >= filter.after!);
    }
    if (filter.before) {
      results = results.filter(e => e.timestamp <= filter.before!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async clear(): Promise<void> {
    this.entries = [];
  }
}

let auditStoreInstance: AuditStore | null = null;

export function getAuditStore(): AuditStore {
  if (!auditStoreInstance) {
    auditStoreInstance = new MemoryAuditStore();
  }
  return auditStoreInstance;
}

export function setAuditStore(store: AuditStore): void {
  auditStoreInstance = store;
}
