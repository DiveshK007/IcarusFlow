/**
 * Logging Utility
 */

import type { AuditEntry, Flow, Task } from '../types/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

class Logger {
  private level: LogLevel;
  private format: 'json' | 'text';
  private entries: LogEntry[] = [];

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.format = (process.env.LOG_FORMAT as 'json' | 'text') || 'text';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    
    if (this.format === 'json') {
      return JSON.stringify({ timestamp, level, message, ...context });
    }
    
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${levelStr} ${message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
    this.entries.push(entry);

    const formatted = this.formatMessage(level, message, context);
    
    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  // Workflow-specific logging
  logWorkflowStart(flow: Flow): void {
    this.info('Workflow started', {
      flowId: flow.id,
      workflowId: flow.workflowId,
      taskCount: flow.tasks.length,
    });
  }

  logWorkflowEnd(flow: Flow, success: boolean): void {
    const level = success ? 'info' : 'error';
    this.log(level, success ? 'Workflow completed' : 'Workflow failed', {
      flowId: flow.id,
      status: flow.status,
      chainCommitHash: flow.chainCommitHash,
    });
  }

  logTaskStart(task: Task): void {
    this.debug('Task started', {
      taskId: task.id,
      taskType: task.type,
      taskName: task.name,
    });
  }

  logTaskEnd(task: Task): void {
    const level = task.status === 'SUCCESS' ? 'debug' : 'error';
    this.log(level, `Task ${task.status.toLowerCase()}`, {
      taskId: task.id,
      taskType: task.type,
      duration: task.result?.executionTimeMs,
      error: task.result?.error,
    });
  }

  logAuditEvent(entry: AuditEntry): void {
    this.info('Audit event', {
      eventType: entry.eventType,
      flowId: entry.flowId,
      taskId: entry.taskId,
      actor: entry.actor,
    });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

// Singleton instance
export const logger = new Logger();
