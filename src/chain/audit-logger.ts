/**
 * Chain Audit Logger
 * 
 * On-Chain State & Audit Layer
 * 
 * What goes on-chain?
 * - Workflow hash
 * - Task sequence
 * - Input/output hashes
 * - Policy decisions
 * - Timestamps
 * 
 * What stays off-chain?
 * - Raw data blobs
 * - Large files
 * - Private payloads
 * 
 * Linked via content-addressed hashes.
 * 
 * This balances:
 * ✔ auditability
 * ✔ privacy
 * ✔ scalability
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type {
  Flow,
  AuditEntry,
  ChainCommit,
  ChainConfig,
} from '../types/index.js';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  flowId: string;
  eventType: string;
  actor: string;
  inputHash: string;
  outputHash?: string;
  metadata: string; // JSON encoded
  signature?: string;
}

export interface ChainState {
  lastBlockNumber: number;
  pendingCommits: ChainCommit[];
  committedFlows: Map<string, ChainCommit>;
}

export class ChainAuditLogger {
  private config: ChainConfig;
  private auditLog: AuditLogEntry[] = [];
  private state: ChainState;

  constructor(config: Partial<ChainConfig> = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || 'https://rpc.weilchain.io',
      network: config.network || 'testnet',
      privateKey: config.privateKey || '',
      contractAddress: config.contractAddress || '',
      gasLimit: config.gasLimit || 500000,
    };

    this.state = {
      lastBlockNumber: 0,
      pendingCommits: [],
      committedFlows: new Map(),
    };
  }

  /**
   * Log an audit event
   */
  async logEvent(entry: AuditEntry): Promise<string> {
    const logEntry: AuditLogEntry = {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      flowId: entry.flowId,
      eventType: entry.eventType,
      actor: entry.actor,
      inputHash: entry.inputHash,
      outputHash: entry.outputHash,
      metadata: JSON.stringify(entry.metadata),
    };

    // Sign the entry (simulated)
    logEntry.signature = this.signEntry(logEntry);

    this.auditLog.push(logEntry);

    console.log(`[Chain] Audit event: ${entry.eventType} for flow ${entry.flowId.substring(0, 8)}...`);

    return logEntry.id;
  }

  /**
   * Commit workflow to chain
   */
  async commitWorkflow(flow: Flow, workflowHash: string): Promise<string> {
    // Build the state root from all audit entries
    const auditLogHash = this.computeAuditLogHash(flow.id);

    // Create commit object
    const commit: ChainCommit = {
      transactionHash: this.generateTxHash(),
      blockNumber: ++this.state.lastBlockNumber,
      timestamp: new Date(),
      workflowHash,
      stateRoot: this.computeStateRoot(flow),
      auditLogHash,
      gasUsed: Math.floor(Math.random() * 100000) + 50000,
    };

    // Simulate chain interaction
    await this.submitToChain(commit, flow);

    // Store in state
    this.state.committedFlows.set(flow.id, commit);

    console.log(`[Chain] Committed workflow ${flow.id.substring(0, 8)}... at block ${commit.blockNumber}`);
    console.log(`[Chain] TX Hash: ${commit.transactionHash}`);

    return commit.transactionHash;
  }

  /**
   * Verify a workflow execution
   */
  async verifyWorkflow(flowId: string, workflowHash: string): Promise<{
    valid: boolean;
    commit?: ChainCommit;
    auditLog: AuditLogEntry[];
  }> {
    const commit = this.state.committedFlows.get(flowId);
    
    if (!commit) {
      return { valid: false, auditLog: [] };
    }

    // Verify workflow hash matches
    const valid = commit.workflowHash === workflowHash;

    // Get audit log for this flow
    const flowAuditLog = this.auditLog.filter((e) => e.flowId === flowId);

    return { valid, commit, auditLog: flowAuditLog };
  }

  /**
   * Get audit trail for a workflow
   */
  getAuditTrail(flowId: string): AuditLogEntry[] {
    return this.auditLog.filter((e) => e.flowId === flowId);
  }

  /**
   * Get all commits
   */
  getAllCommits(): ChainCommit[] {
    return Array.from(this.state.committedFlows.values());
  }

  /**
   * Sign an audit entry (simulated)
   */
  private signEntry(entry: AuditLogEntry): string {
    const data = `${entry.id}:${entry.timestamp}:${entry.flowId}:${entry.eventType}:${entry.inputHash}`;
    return createHash('sha256').update(data + this.config.privateKey).digest('hex').substring(0, 64);
  }

  /**
   * Compute audit log hash
   */
  private computeAuditLogHash(flowId: string): string {
    const entries = this.auditLog.filter((e) => e.flowId === flowId);
    const data = entries.map((e) => `${e.id}:${e.inputHash}`).join('|');
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compute state root (Merkle root of all task outputs)
   */
  private computeStateRoot(flow: Flow): string {
    const leaves = flow.tasks.map((task) => {
      const data = `${task.id}:${task.status}:${task.result?.outputHash || 'none'}`;
      return createHash('sha256').update(data).digest('hex');
    });

    // Simplified Merkle root (in production, use proper Merkle tree)
    return createHash('sha256').update(leaves.join('')).digest('hex');
  }

  /**
   * Generate transaction hash
   */
  private generateTxHash(): string {
    return '0x' + createHash('sha256').update(uuidv4() + Date.now()).digest('hex');
  }

  /**
   * Submit to chain (simulated)
   */
  private async submitToChain(commit: ChainCommit, flow: Flow): Promise<void> {
    // In production, this would:
    // 1. Encode the commit data
    // 2. Sign with private key
    // 3. Submit to WeilChain via RPC
    // 4. Wait for confirmation

    console.log(`[Chain] Submitting to ${this.config.network}...`);
    
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Log the commit data structure (what would go on-chain)
    const onChainData = {
      workflowId: flow.id,
      workflowHash: commit.workflowHash,
      stateRoot: commit.stateRoot,
      auditLogHash: commit.auditLogHash,
      taskCount: flow.tasks.length,
      status: flow.status,
      timestamp: commit.timestamp.toISOString(),
    };

    console.log(`[Chain] On-chain data: ${JSON.stringify(onChainData, null, 2)}`);
  }

  /**
   * Export audit log (for compliance/auditors)
   */
  exportAuditLog(flowId?: string): string {
    const entries = flowId
      ? this.auditLog.filter((e) => e.flowId === flowId)
      : this.auditLog;

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Replay workflow from audit log
   */
  async replayWorkflow(flowId: string): Promise<{
    events: AuditLogEntry[];
    timeline: Array<{ time: string; event: string; data: unknown }>;
  }> {
    const events = this.auditLog.filter((e) => e.flowId === flowId);
    
    const timeline = events.map((e) => ({
      time: e.timestamp,
      event: e.eventType,
      data: JSON.parse(e.metadata),
    }));

    return { events, timeline };
  }
}
