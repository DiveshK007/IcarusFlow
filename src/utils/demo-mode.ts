/**
 * Demo Mode Configuration
 * 
 * Enables deterministic, predictable execution for hackathon demos.
 * All external connectors return mocked responses.
 * Execution traces are formatted for screenshots.
 */

export interface DemoConfig {
  enabled: boolean;
  deterministicIds: boolean;
  mockLatencyMs: number;
  showExecutionTrace: boolean;
  traceFormat: 'minimal' | 'detailed' | 'visual';
}

// Check if demo mode is enabled
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo';
}

// Get demo configuration
export function getDemoConfig(): DemoConfig {
  return {
    enabled: isDemoMode(),
    deterministicIds: process.env.DEMO_DETERMINISTIC_IDS === 'true',
    mockLatencyMs: parseInt(process.env.DEMO_LATENCY_MS || '200'),
    showExecutionTrace: process.env.DEMO_SHOW_TRACE !== 'false',
    traceFormat: (process.env.DEMO_TRACE_FORMAT as DemoConfig['traceFormat']) || 'visual',
  };
}

// Demo-safe ID generator (deterministic in demo mode)
let demoCounter = 0;
export function generateDemoId(prefix: string = 'demo'): string {
  if (isDemoMode()) {
    demoCounter++;
    return `${prefix}-${String(demoCounter).padStart(4, '0')}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Reset demo state (for testing)
export function resetDemoState(): void {
  demoCounter = 0;
}

// Mock data for demo mode
export const DEMO_MOCK_DATA = {
  snowflakeQuery: {
    rows: [
      { product_name: 'Enterprise Plan', total_customers: 1500, churned: 45, churn_rate: 3.0 },
      { product_name: 'Pro Plan', total_customers: 8500, churned: 340, churn_rate: 4.0 },
      { product_name: 'Starter Plan', total_customers: 25000, churned: 1250, churn_rate: 5.0 },
    ],
    rowCount: 3,
    queryTime: 1.2,
  },
  s3Upload: {
    bucket: 'icarusflow-demo',
    key: 'reports/analysis-2026-01-07.csv',
    etag: '"d41d8cd98f00b204e9800998ecf8427e"',
    size: 4096,
  },
  emailSend: {
    messageId: 'demo-msg-001@icarusflow.io',
    accepted: ['analytics@company.com'],
    rejected: [],
  },
  chainCommit: {
    transactionHash: '0x7f9fade1c0d57a7af66ab4ead79fade1c0d57a7af66ab4ead7c2c2eb7b11a91385',
    blockNumber: 12847293,
    gasUsed: 84521,
  },
};
