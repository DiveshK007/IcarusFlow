/**
 * IcarusFlow Configuration Loader
 */

import type {
  IcarusConfig,
  LLMConfig,
  ChainConfig,
  ConnectorConfigs,
  ExecutionConfig,
  Policy,
} from '../types/index.js';
import { getDefaultPolicies } from '../core/policy-validator.js';

/**
 * Load configuration from environment variables
 */
export function loadConfig(): IcarusConfig {
  return {
    llm: loadLLMConfig(),
    chain: loadChainConfig(),
    connectors: loadConnectorConfigs(),
    policies: loadPolicies(),
    execution: loadExecutionConfig(),
  };
}

/**
 * Load LLM configuration
 */
function loadLLMConfig(): LLMConfig {
  return {
    provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic' | 'local') || 'openai',
    model: process.env.LLM_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
    apiKey: process.env.OPENAI_API_KEY || '',
  };
}

/**
 * Load chain configuration
 */
function loadChainConfig(): ChainConfig {
  return {
    rpcUrl: process.env.WEIL_CHAIN_RPC_URL || 'https://rpc.weilchain.io',
    network: process.env.WEIL_CHAIN_NETWORK || 'testnet',
    privateKey: process.env.WEIL_PRIVATE_KEY || '',
    contractAddress: process.env.WEIL_CONTRACT_ADDRESS || '',
    gasLimit: parseInt(process.env.WEIL_GAS_LIMIT || '500000'),
  };
}

/**
 * Load connector configurations
 */
function loadConnectorConfigs(): ConnectorConfigs {
  return {
    snowflake: {
      account: process.env.SNOWFLAKE_ACCOUNT || '',
      username: process.env.SNOWFLAKE_USERNAME || '',
      password: process.env.SNOWFLAKE_PASSWORD || '',
      database: process.env.SNOWFLAKE_DATABASE || '',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
      schema: process.env.SNOWFLAKE_SCHEMA || 'public',
    },
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.S3_BUCKET_NAME || '',
    },
    email: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || 'noreply@icarusflow.io',
    },
    confluence: {
      baseUrl: process.env.CONFLUENCE_BASE_URL || '',
      apiToken: process.env.CONFLUENCE_API_TOKEN || '',
      spaceKey: process.env.CONFLUENCE_SPACE_KEY || '',
    },
  };
}

/**
 * Load execution configuration
 */
function loadExecutionConfig(): ExecutionConfig {
  return {
    maxWorkflowSteps: parseInt(process.env.MAX_WORKFLOW_STEPS || '50'),
    defaultTimeoutMs: parseInt(process.env.EXECUTION_TIMEOUT_MS || '300000'),
    enablePolicyEnforcement: process.env.ENABLE_POLICY_ENFORCEMENT !== 'false',
    enableAuditLog: process.env.ENABLE_AUDIT_LOG !== 'false',
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  };
}

/**
 * Load policies from config or use defaults
 */
function loadPolicies(): Policy[] {
  // In production, this would load from chain or config file
  return getDefaultPolicies();
}

/**
 * Validate configuration
 */
export function validateConfig(config: IcarusConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check LLM config
  if (!config.llm.apiKey && config.llm.provider !== 'local') {
    errors.push('LLM API key is required for non-local providers');
  }

  // Check chain config for production
  if (config.chain.network === 'mainnet') {
    if (!config.chain.privateKey) {
      errors.push('Private key is required for mainnet');
    }
    if (!config.chain.contractAddress) {
      errors.push('Contract address is required for mainnet');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
