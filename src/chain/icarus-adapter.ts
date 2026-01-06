/**
 * Icarus SDK Adapter
 * 
 * This adapter provides a clean interface between IcarusFlow and the
 * Weilliptic Icarus execution environment.
 * 
 * Design Pattern: Adapter + Strategy
 * - IcarusAdapter defines the interface
 * - MockIcarusAdapter provides local testing capability
 * - WeilChainIcarusAdapter will connect to real Icarus SDK (when available)
 * 
 * To swap implementations, change the adapter instance in ChainAuditLogger
 * or IcarusFlow configuration.
 */

import { createHash } from 'crypto';
import type { Flow, ChainCommit, AuditEntry } from '../types/index.js';

/**
 * Core interface for Icarus SDK interaction
 * All chain operations go through this adapter
 */
export interface IcarusAdapter {
  /** Initialize connection to Icarus execution environment */
  connect(): Promise<void>;
  
  /** Disconnect from Icarus */
  disconnect(): Promise<void>;
  
  /** Check if adapter is connected and ready */
  isReady(): boolean;
  
  /** Submit a workflow state commitment to chain */
  commitWorkflowState(params: CommitParams): Promise<CommitResult>;
  
  /** Verify a workflow execution against chain state */
  verifyWorkflowExecution(flowId: string, workflowHash: string): Promise<VerificationResult>;
  
  /** Log an audit event (may batch for efficiency) */
  logAuditEvent(entry: AuditEntry): Promise<string>;
  
  /** Flush any pending audit events to chain */
  flushAuditLog(): Promise<void>;
  
  /** Get current network/connection info */
  getNetworkInfo(): NetworkInfo;
}

export interface CommitParams {
  flowId: string;
  workflowHash: string;
  stateRoot: string;
  auditLogHash: string;
  metadata?: Record<string, unknown>;
}

export interface CommitResult {
  success: boolean;
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  gasUsed: number;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  commit?: ChainCommit;
  auditEntries: AuditEntry[];
  verifiedAt: Date;
  error?: string;
}

export interface NetworkInfo {
  network: string;
  chainId: number;
  blockHeight: number;
  connected: boolean;
  latency?: number;
}

/**
 * Mock Icarus Adapter
 * 
 * Provides full functionality for local development and testing.
 * All data is stored in-memory and simulates chain behavior.
 * 
 * Use this for:
 * - Local development
 * - Integration testing
 * - Demo purposes
 */
export class MockIcarusAdapter implements IcarusAdapter {
  private connected: boolean = false;
  private blockNumber: number = 0;
  private commits: Map<string, ChainCommit> = new Map();
  private auditBuffer: AuditEntry[] = [];
  private auditLog: Map<string, AuditEntry[]> = new Map();

  async connect(): Promise<void> {
    // Simulate connection delay
    await this.delay(100);
    this.connected = true;
    console.log('[MockIcarus] Connected to mock Icarus environment');
  }

  async disconnect(): Promise<void> {
    await this.flushAuditLog();
    this.connected = false;
    console.log('[MockIcarus] Disconnected from mock Icarus environment');
  }

  isReady(): boolean {
    return this.connected;
  }

  async commitWorkflowState(params: CommitParams): Promise<CommitResult> {
    if (!this.connected) {
      return {
        success: false,
        transactionHash: '',
        blockNumber: 0,
        timestamp: new Date(),
        gasUsed: 0,
        error: 'Adapter not connected',
      };
    }

    // Simulate transaction processing
    await this.delay(50);
    this.blockNumber++;

    const txHash = this.generateTransactionHash(params);
    const commit: ChainCommit = {
      transactionHash: txHash,
      blockNumber: this.blockNumber,
      timestamp: new Date(),
      workflowHash: params.workflowHash,
      stateRoot: params.stateRoot,
      auditLogHash: params.auditLogHash,
      gasUsed: this.calculateGas(params),
    };

    this.commits.set(params.flowId, commit);

    console.log(`[MockIcarus] Committed workflow ${params.flowId.substring(0, 8)}...`);
    console.log(`[MockIcarus] Block: ${commit.blockNumber}, TX: ${txHash.substring(0, 16)}...`);

    return {
      success: true,
      transactionHash: commit.transactionHash,
      blockNumber: commit.blockNumber,
      timestamp: commit.timestamp,
      gasUsed: commit.gasUsed,
    };
  }

  async verifyWorkflowExecution(flowId: string, workflowHash: string): Promise<VerificationResult> {
    if (!this.connected) {
      return {
        valid: false,
        auditEntries: [],
        verifiedAt: new Date(),
        error: 'Adapter not connected',
      };
    }

    const commit = this.commits.get(flowId);
    if (!commit) {
      return {
        valid: false,
        auditEntries: [],
        verifiedAt: new Date(),
        error: 'Workflow not found on chain',
      };
    }

    const valid = commit.workflowHash === workflowHash;
    const auditEntries = this.auditLog.get(flowId) || [];

    return {
      valid,
      commit,
      auditEntries,
      verifiedAt: new Date(),
    };
  }

  async logAuditEvent(entry: AuditEntry): Promise<string> {
    // Buffer audit events for batch processing
    this.auditBuffer.push(entry);

    // Store immediately for retrieval (in real impl, this would be batched)
    const flowEntries = this.auditLog.get(entry.flowId) || [];
    flowEntries.push(entry);
    this.auditLog.set(entry.flowId, flowEntries);

    return entry.id;
  }

  async flushAuditLog(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    // Simulate batch commit
    await this.delay(20);
    console.log(`[MockIcarus] Flushed ${this.auditBuffer.length} audit entries`);
    this.auditBuffer = [];
  }

  getNetworkInfo(): NetworkInfo {
    return {
      network: 'mock-testnet',
      chainId: 31337,
      blockHeight: this.blockNumber,
      connected: this.connected,
      latency: 50,
    };
  }

  // Helper methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateTransactionHash(params: CommitParams): string {
    const data = JSON.stringify({
      ...params,
      timestamp: Date.now(),
      nonce: Math.random(),
    });
    return '0x' + createHash('sha256').update(data).digest('hex');
  }

  private calculateGas(params: CommitParams): number {
    // Simulate gas calculation based on data size
    const dataSize = JSON.stringify(params).length;
    return 21000 + dataSize * 16;
  }
}

/**
 * WeilChain Icarus Adapter
 * 
 * Production adapter for connecting to the Weilliptic Icarus execution environment.
 * 
 * STATUS: Placeholder implementation
 * 
 * When the Icarus SDK becomes available:
 * 1. Import the SDK: import { IcarusClient } from '@weilliptic/icarus-sdk'
 * 2. Implement each method using SDK calls
 * 3. Handle authentication via config.privateKey
 * 4. Map SDK responses to our interface types
 */
export class WeilChainIcarusAdapter implements IcarusAdapter {
  private config: WeilChainConfig;
  private connected: boolean = false;
  // private client: IcarusClient; // Uncomment when SDK available

  constructor(config: WeilChainConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // TODO: Replace with actual SDK initialization
    // this.client = new IcarusClient({
    //   rpcUrl: this.config.rpcUrl,
    //   network: this.config.network,
    //   privateKey: this.config.privateKey,
    // });
    // await this.client.connect();
    
    console.log(`[WeilChain] Connecting to ${this.config.network}...`);
    
    // For now, fall back to mock behavior with warning
    console.warn('[WeilChain] SDK not available - using mock behavior');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // await this.client?.disconnect();
    this.connected = false;
  }

  isReady(): boolean {
    return this.connected;
  }

  async commitWorkflowState(params: CommitParams): Promise<CommitResult> {
    // TODO: Replace with actual SDK call
    // const tx = await this.client.submitWorkflowCommit({
    //   flowId: params.flowId,
    //   workflowHash: params.workflowHash,
    //   stateRoot: params.stateRoot,
    //   auditLogHash: params.auditLogHash,
    // });
    // return {
    //   success: true,
    //   transactionHash: tx.hash,
    //   blockNumber: tx.blockNumber,
    //   timestamp: new Date(tx.timestamp),
    //   gasUsed: tx.gasUsed,
    // };

    // Placeholder: delegate to mock for now
    const mock = new MockIcarusAdapter();
    await mock.connect();
    return mock.commitWorkflowState(params);
  }

  async verifyWorkflowExecution(flowId: string, workflowHash: string): Promise<VerificationResult> {
    // TODO: Replace with actual SDK call
    // const result = await this.client.verifyWorkflow(flowId, workflowHash);
    // return { ... };

    return {
      valid: false,
      auditEntries: [],
      verifiedAt: new Date(),
      error: 'WeilChain SDK not yet integrated',
    };
  }

  async logAuditEvent(entry: AuditEntry): Promise<string> {
    // TODO: Replace with actual SDK call
    // return await this.client.logAuditEntry(entry);
    return entry.id;
  }

  async flushAuditLog(): Promise<void> {
    // TODO: Replace with actual SDK call
    // await this.client.flushAuditLog();
  }

  getNetworkInfo(): NetworkInfo {
    return {
      network: this.config.network,
      chainId: this.config.network === 'mainnet' ? 1 : 5,
      blockHeight: 0,
      connected: this.connected,
    };
  }
}

export interface WeilChainConfig {
  rpcUrl: string;
  network: 'mainnet' | 'testnet';
  privateKey: string;
  contractAddress: string;
  gasLimit?: number;
}

/**
 * Factory function to create the appropriate adapter
 */
export function createIcarusAdapter(
  type: 'mock' | 'weilchain',
  config?: WeilChainConfig
): IcarusAdapter {
  switch (type) {
    case 'mock':
      return new MockIcarusAdapter();
    case 'weilchain':
      if (!config) {
        throw new Error('WeilChain config required for weilchain adapter');
      }
      return new WeilChainIcarusAdapter(config);
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}
