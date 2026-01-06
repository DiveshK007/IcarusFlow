/**
 * Execution Trace Visualizer
 * 
 * Produces human-readable execution traces suitable for:
 * - Hackathon demo screenshots
 * - PowerPoint presentations
 * - Debug logs
 * 
 * Output format is designed to be visually clear and self-explanatory.
 */

import type { Flow, Task, TaskStatus, WorkflowStatus } from '../types/index.js';

export interface TraceStep {
  stepNumber: number;
  taskId: string;
  taskName: string;
  taskType: string;
  status: TaskStatus;
  durationMs?: number;
  outputPreview?: string;
  error?: string;
}

export interface ExecutionTrace {
  flowId: string;
  workflowName: string;
  status: WorkflowStatus;
  totalDurationMs: number;
  steps: TraceStep[];
  chainCommit?: {
    hash: string;
    block: number;
  };
  timestamp: string;
}

/**
 * Build execution trace from completed flow
 */
export function buildExecutionTrace(flow: Flow): ExecutionTrace {
  const steps: TraceStep[] = flow.tasks.map((task, index) => ({
    stepNumber: index + 1,
    taskId: task.id,
    taskName: task.name,
    taskType: task.type,
    status: task.status,
    durationMs: task.result?.executionTimeMs,
    outputPreview: task.result?.data 
      ? JSON.stringify(task.result.data).substring(0, 100) + '...'
      : undefined,
    error: task.result?.error,
  }));

  const totalDuration = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  return {
    flowId: flow.id,
    workflowName: flow.metadata.name,
    status: flow.status,
    totalDurationMs: totalDuration,
    steps,
    chainCommit: flow.chainCommitHash ? {
      hash: flow.chainCommitHash,
      block: 0, // Would be populated from chain response
    } : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format trace as visual ASCII diagram (for terminal/logs)
 */
export function formatTraceVisual(trace: ExecutionTrace): string {
  const lines: string[] = [];
  
  // Header
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║                    ICARUSFLOW EXECUTION TRACE                     ║');
  lines.push('╠══════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Flow ID: ${trace.flowId.substring(0, 36).padEnd(36)}              ║`);
  lines.push(`║  Workflow: ${trace.workflowName.substring(0, 35).padEnd(35)}              ║`);
  lines.push(`║  Status: ${getStatusEmoji(trace.status)} ${trace.status.padEnd(32)}              ║`);
  lines.push('╠══════════════════════════════════════════════════════════════════╣');
  
  // Execution flow diagram
  lines.push('║                                                                    ║');
  lines.push('║  EXECUTION FLOW:                                                   ║');
  lines.push('║  ══════════════                                                    ║');
  lines.push('║                                                                    ║');
  lines.push('║      ┌─────────────┐                                               ║');
  lines.push('║      │   START     │                                               ║');
  lines.push('║      └──────┬──────┘                                               ║');
  lines.push('║             │                                                      ║');
  
  // Steps
  for (const step of trace.steps) {
    const icon = getStepIcon(step.status);
    const duration = step.durationMs ? `${step.durationMs}ms` : '-';
    lines.push('║             ▼                                                      ║');
    lines.push(`║      ┌─────────────────────────────────────────┐                   ║`);
    lines.push(`║      │ ${icon} Step ${step.stepNumber}: ${step.taskName.substring(0, 28).padEnd(28)} │                   ║`);
    lines.push(`║      │    Type: ${step.taskType.padEnd(31)} │                   ║`);
    lines.push(`║      │    Time: ${duration.padEnd(31)} │                   ║`);
    if (step.error) {
      lines.push(`║      │    ❌ Error: ${step.error.substring(0, 25).padEnd(25)} │                   ║`);
    }
    lines.push(`║      └─────────────────────────────────────────┘                   ║`);
    lines.push('║             │                                                      ║');
  }
  
  // Chain commit
  if (trace.chainCommit) {
    lines.push('║             ▼                                                      ║');
    lines.push('║      ┌─────────────────────────────────────────┐                   ║');
    lines.push('║      │ ⛓️  ON-CHAIN COMMIT                      │                   ║');
    lines.push(`║      │    TX: ${trace.chainCommit.hash.substring(0, 32)}...│                   ║`);
    lines.push('║      └─────────────────────────────────────────┘                   ║');
    lines.push('║             │                                                      ║');
  }
  
  // End
  lines.push('║             ▼                                                      ║');
  lines.push(`║      ┌─────────────┐                                               ║`);
  lines.push(`║      │  ${trace.status === 'COMMITTED' ? '✅ DONE' : '❌ FAIL'}     │                                               ║`);
  lines.push('║      └─────────────┘                                               ║');
  lines.push('║                                                                    ║');
  
  // Summary
  lines.push('╠══════════════════════════════════════════════════════════════════╣');
  lines.push('║  SUMMARY:                                                         ║');
  lines.push(`║    • Total Steps: ${trace.steps.length}                                               ║`);
  lines.push(`║    • Duration: ${trace.totalDurationMs}ms                                            ║`);
  lines.push(`║    • Completed: ${trace.steps.filter(s => s.status === 'SUCCESS').length}/${trace.steps.length}                                              ║`);
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format trace as minimal single-line summary
 */
export function formatTraceMinimal(trace: ExecutionTrace): string {
  const stepIcons = trace.steps.map(s => getStepIcon(s.status)).join('→');
  const status = trace.status === 'COMMITTED' ? '✅' : '❌';
  return `[${trace.flowId.substring(0, 8)}] ${stepIcons} ${status} (${trace.totalDurationMs}ms)`;
}

/**
 * Format trace as detailed JSON-like output
 */
export function formatTraceDetailed(trace: ExecutionTrace): string {
  const lines: string[] = [];
  
  lines.push(`\n┌── WORKFLOW EXECUTION ──────────────────────────────────`);
  lines.push(`│ Flow ID:    ${trace.flowId}`);
  lines.push(`│ Name:       ${trace.workflowName}`);
  lines.push(`│ Status:     ${getStatusEmoji(trace.status)} ${trace.status}`);
  lines.push(`│ Duration:   ${trace.totalDurationMs}ms`);
  lines.push(`├── STEPS ───────────────────────────────────────────────`);
  
  for (const step of trace.steps) {
    const icon = getStepIcon(step.status);
    lines.push(`│`);
    lines.push(`│ ${icon} Step ${step.stepNumber}: ${step.taskName}`);
    lines.push(`│   ├─ Type: ${step.taskType}`);
    lines.push(`│   ├─ ID: ${step.taskId}`);
    lines.push(`│   ├─ Duration: ${step.durationMs || 0}ms`);
    lines.push(`│   └─ Status: ${step.status}`);
    if (step.error) {
      lines.push(`│      ⚠️  Error: ${step.error}`);
    }
  }
  
  if (trace.chainCommit) {
    lines.push(`├── CHAIN COMMIT ────────────────────────────────────────`);
    lines.push(`│ Transaction: ${trace.chainCommit.hash}`);
  }
  
  lines.push(`└────────────────────────────────────────────────────────\n`);
  
  return lines.join('\n');
}

/**
 * Format trace for API response (clean JSON)
 */
export function formatTraceForApi(trace: ExecutionTrace): object {
  return {
    flowId: trace.flowId,
    workflow: trace.workflowName,
    status: trace.status,
    durationMs: trace.totalDurationMs,
    steps: trace.steps.map(s => ({
      step: s.stepNumber,
      name: s.taskName,
      type: s.taskType,
      status: s.status,
      durationMs: s.durationMs || 0,
      ...(s.error && { error: s.error }),
    })),
    ...(trace.chainCommit && {
      chainCommit: {
        transactionHash: trace.chainCommit.hash,
      },
    }),
    timestamp: trace.timestamp,
  };
}

// Helper functions
function getStatusEmoji(status: WorkflowStatus): string {
  switch (status) {
    case 'COMMITTED': return '✅';
    case 'FAILED': return '❌';
    case 'RUNNING': return '🔄';
    case 'PENDING': return '⏳';
    case 'ROLLED_BACK': return '↩️';
    default: return '❓';
  }
}

function getStepIcon(status: TaskStatus): string {
  switch (status) {
    case 'SUCCESS': return '✅';
    case 'FAILED': return '❌';
    case 'RUNNING': return '🔄';
    case 'PENDING': return '⏳';
    case 'SKIPPED': return '⏭️';
    default: return '❓';
  }
}

/**
 * Print trace to console in chosen format
 */
export function printExecutionTrace(
  trace: ExecutionTrace, 
  format: 'minimal' | 'detailed' | 'visual' = 'visual'
): void {
  switch (format) {
    case 'minimal':
      console.log(formatTraceMinimal(trace));
      break;
    case 'detailed':
      console.log(formatTraceDetailed(trace));
      break;
    case 'visual':
    default:
      console.log(formatTraceVisual(trace));
      break;
  }
}
