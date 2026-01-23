/**
 * Human-in-the-loop approval system
 */

import type { Address, Hex } from '../core/types.js';
import { ApprovalDeniedError, ApprovalTimeoutError } from './errors.js';
import { parseAmount as parseAmountCore } from '../core/units.js';

export interface ApprovalRequest {
  id: string;
  type: 'send' | 'approve' | 'contract_call' | 'unknown';
  timestamp: Date;
  summary: string;
  details: {
    from: Address;
    to?: Address;
    value?: { wei: bigint; eth: string; usd?: number };
    data?: Hex;
    gasCost?: { wei: bigint; eth: string; usd?: number };
    totalCost?: { wei: bigint; eth: string; usd?: number };
    contractMethod?: string;
    contractArgs?: unknown[];
    risk: 'low' | 'medium' | 'high';
    warnings: string[];
  };
}

export interface ApprovalResponse {
  approved: boolean;
  reason?: string;
  timestamp: Date;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<boolean>;

export interface ApprovalConfig {
  // When to require approval
  requireApprovalWhen?: {
    amountExceeds?: string | bigint;
    recipientIsNew?: boolean;
    riskLevelAbove?: 'low' | 'medium';
    always?: boolean;
  };
  // Handler function
  handler?: ApprovalHandler;
  // Timeout for approval request
  timeout?: number;
  // What to do on timeout
  onTimeout?: 'reject' | 'approve';
}

/**
 * Approval engine for human-in-the-loop verification
 */
export class ApprovalEngine {
  private readonly config: Required<ApprovalConfig>;
  private readonly pendingRequests: Map<string, {
    request: ApprovalRequest;
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: ApprovalConfig = {}) {
    this.config = {
      requireApprovalWhen: config.requireApprovalWhen ?? { always: false },
      handler: config.handler ?? (async () => false),
      timeout: config.timeout ?? 5 * 60 * 1000, // 5 minutes default
      onTimeout: config.onTimeout ?? 'reject',
    };
  }

  /**
   * Check if approval is required for a transaction
   */
  requiresApproval(context: {
    amount?: bigint;
    recipientIsNew?: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
  }): boolean {
    const rules = this.config.requireApprovalWhen;

    if (rules.always) {
      return true;
    }

    if (rules.amountExceeds !== undefined && context.amount !== undefined) {
      const threshold = typeof rules.amountExceeds === 'bigint'
        ? rules.amountExceeds
        : parseAmount(rules.amountExceeds);
      if (context.amount > threshold) {
        return true;
      }
    }

    if (rules.recipientIsNew && context.recipientIsNew) {
      return true;
    }

    if (rules.riskLevelAbove !== undefined && context.riskLevel !== undefined) {
      const riskOrder = { low: 0, medium: 1, high: 2 };
      if (riskOrder[context.riskLevel] > riskOrder[rules.riskLevelAbove]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Request approval for a transaction
   */
  async requestApproval(request: Omit<ApprovalRequest, 'id' | 'timestamp'>): Promise<boolean> {
    const fullRequest: ApprovalRequest = {
      ...request,
      id: generateRequestId(),
      timestamp: new Date(),
    };

    return new Promise<boolean>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(fullRequest.id);

        if (this.config.onTimeout === 'approve') {
          resolve(true);
        } else {
          reject(new ApprovalTimeoutError(this.config.timeout));
        }
      }, this.config.timeout);

      // Store pending request
      this.pendingRequests.set(fullRequest.id, {
        request: fullRequest,
        resolve: (approved: boolean) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(fullRequest.id);
          resolve(approved);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(fullRequest.id);
          reject(error);
        },
      });

      // Call handler
      this.config.handler(fullRequest)
        .then((approved) => {
          const pending = this.pendingRequests.get(fullRequest.id);
          if (pending) {
            pending.resolve(approved);
          }
        })
        .catch((error) => {
          const pending = this.pendingRequests.get(fullRequest.id);
          if (pending) {
            pending.reject(error as Error);
          }
        });
    });
  }

  /**
   * Respond to a pending approval request (for async handlers)
   */
  respond(requestId: string, approved: boolean, reason?: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      throw new Error(`No pending request with ID: ${requestId}`);
    }

    if (approved) {
      pending.resolve(true);
    } else {
      pending.reject(new ApprovalDeniedError(reason));
    }
  }

  /**
   * Get all pending approval requests
   */
  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values()).map((p) => p.request);
  }

  /**
   * Cancel a pending approval request
   */
  cancel(requestId: string, reason?: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.reject(new ApprovalDeniedError(reason ?? 'Request cancelled'));
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ApprovalConfig>): void {
    if (config.requireApprovalWhen !== undefined) {
      Object.assign(this.config.requireApprovalWhen, config.requireApprovalWhen);
    }
    if (config.handler !== undefined) {
      this.config.handler = config.handler;
    }
    if (config.timeout !== undefined) {
      this.config.timeout = config.timeout;
    }
    if (config.onTimeout !== undefined) {
      this.config.onTimeout = config.onTimeout;
    }
  }
}

/**
 * Create a human-readable approval request summary
 */
export function formatApprovalRequest(request: ApprovalRequest): string {
  const lines: string[] = [];

  lines.push(`=== Approval Request ===`);
  lines.push(`Type: ${request.type}`);
  lines.push(`Time: ${request.timestamp.toISOString()}`);
  lines.push('');
  lines.push(request.summary);
  lines.push('');

  if (request.details.to) {
    lines.push(`To: ${request.details.to}`);
  }

  if (request.details.value) {
    lines.push(`Amount: ${request.details.value.eth} ETH`);
    if (request.details.value.usd) {
      lines.push(`        ($${request.details.value.usd.toFixed(2)})`);
    }
  }

  if (request.details.gasCost) {
    lines.push(`Gas Cost: ${request.details.gasCost.eth} ETH`);
  }

  if (request.details.totalCost) {
    lines.push(`Total Cost: ${request.details.totalCost.eth} ETH`);
  }

  if (request.details.contractMethod) {
    lines.push(`Contract Method: ${request.details.contractMethod}`);
  }

  lines.push('');
  lines.push(`Risk Level: ${request.details.risk.toUpperCase()}`);

  if (request.details.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of request.details.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

// Helper to generate unique request IDs
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Use imported parseAmount
function parseAmount(amount: string): bigint {
  return parseAmountCore(amount);
}
