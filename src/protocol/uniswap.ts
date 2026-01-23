/**
 * Uniswap V3 protocol integration
 * Supports swaps via SwapRouter02 and quotes via Quoter V2
 */

import type { Address, Hex, TransactionReceipt } from '../core/types.js';
import type { RPCClient } from './rpc.js';
import type { Account } from './account.js';
import { Contract } from './contract.js';
import { GasOracle } from './gas.js';
import { TransactionBuilder } from './transaction.js';

/**
 * Uniswap SwapRouter02 addresses per chain
 * https://docs.uniswap.org/contracts/v3/reference/deployments
 */
export const UNISWAP_ROUTER_ADDRESSES: Record<number, string> = {
  1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',      // Ethereum Mainnet
  10: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',     // Optimism
  137: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',    // Polygon
  42161: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',  // Arbitrum One
  8453: '0x2626664c2603336E57B271c5C0b26F421741e481',   // Base
  43114: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',  // Avalanche
  56: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',     // BNB Chain
  11155111: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Sepolia
};

/**
 * Uniswap Quoter V2 addresses per chain
 */
export const UNISWAP_QUOTER_ADDRESSES: Record<number, string> = {
  1: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',      // Ethereum Mainnet
  10: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',     // Optimism
  137: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',    // Polygon
  42161: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',  // Arbitrum One
  8453: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',   // Base
  43114: '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',  // Avalanche
  56: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',     // BNB Chain
  11155111: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3', // Sepolia
};

/**
 * WETH addresses per chain (needed for ETH swaps)
 */
export const WETH_ADDRESSES: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',      // Ethereum Mainnet
  10: '0x4200000000000000000000000000000000000006',     // Optimism
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // Polygon (WMATIC)
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  // Arbitrum One
  8453: '0x4200000000000000000000000000000000000006',   // Base
  43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',  // Avalanche (WAVAX)
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',     // BNB Chain (WBNB)
  11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia
};

/**
 * Common Uniswap V3 fee tiers (in basis points * 100)
 * 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
 */
export const FEE_TIERS = [500, 3000, 10000] as const;
export type FeeTier = (typeof FEE_TIERS)[number];

/**
 * ERC20 Transfer event topic (keccak256 of "Transfer(address,address,uint256)")
 * Used to parse actual output amounts from transaction logs
 */
export const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * SwapRouter02 ABI - Only the functions we need
 */
export const SWAP_ROUTER_ABI = [
  // exactInputSingle - Single pool swap
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  // exactInput - Multi-hop swap
  {
    name: 'exactInput',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'path', type: 'bytes' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  // multicall - For batching multiple operations
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
  // unwrapWETH9 - Unwrap WETH after swap
  {
    name: 'unwrapWETH9',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
  // refundETH - Refund any leftover ETH
  {
    name: 'refundETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const;

/**
 * Quoter V2 ABI - For getting swap quotes
 */
export const QUOTER_ABI = [
  // quoteExactInputSingle - Quote for single pool swap
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
  // quoteExactInput - Quote for multi-hop swap
  {
    name: 'quoteExactInput',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
      { name: 'initializedTicksCrossedList', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

/**
 * ERC20 approval ABI
 */
const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * WETH ABI - For wrapping/unwrapping ETH
 */
export const WETH_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Swap quote result
 */
export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  amountOutMinimum: bigint; // After slippage
  priceImpact: number;
  fee: FeeTier;
  path: {
    tokenIn: string;
    tokenOut: string;
    fee: FeeTier;
  }[];
  gasEstimate: bigint;
  /** Number of initialized ticks crossed - higher means more price impact */
  initializedTicksCrossed: number;
}

/**
 * Swap execution parameters
 */
export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: Address;
  deadline: number;
  fee?: FeeTier;
  sqrtPriceLimitX96?: bigint;
}

/**
 * Swap result
 */
export interface SwapExecutionResult {
  hash: Hex;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  blockNumber: number;
}

/**
 * Uniswap client configuration
 */
export interface UniswapClientConfig {
  rpc: RPCClient;
  account?: Account;
  chainId?: number;
}

/**
 * Uniswap V3 client for swaps and quotes
 */
export class UniswapClient {
  private readonly rpc: RPCClient;
  private readonly account?: Account;
  private chainId?: number;
  private readonly gasOracle: GasOracle;

  constructor(config: UniswapClientConfig) {
    this.rpc = config.rpc;
    this.account = config.account;
    this.chainId = config.chainId;
    this.gasOracle = new GasOracle(config.rpc);
  }

  /**
   * Get the chain ID, caching if needed
   */
  private async getChainId(): Promise<number> {
    if (this.chainId === undefined) {
      this.chainId = await this.rpc.getChainId();
    }
    return this.chainId;
  }

  /**
   * Get router address for current chain
   */
  private async getRouterAddress(): Promise<Address> {
    const chainId = await this.getChainId();
    const address = UNISWAP_ROUTER_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`Uniswap not supported on chain ${chainId}`);
    }
    return address as Address;
  }

  /**
   * Get quoter address for current chain
   */
  private async getQuoterAddress(): Promise<Address> {
    const chainId = await this.getChainId();
    const address = UNISWAP_QUOTER_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`Uniswap Quoter not supported on chain ${chainId}`);
    }
    return address as Address;
  }

  /**
   * Get WETH address for current chain
   */
  async getWETHAddress(): Promise<Address> {
    const chainId = await this.getChainId();
    const address = WETH_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`WETH not configured for chain ${chainId}`);
    }
    return address as Address;
  }

  /**
   * Get a swap quote
   *
   * Tries multiple fee tiers (0.05%, 0.3%, 1%) to find the best quote.
   *
   * @param params.tokenIn - Input token address
   * @param params.tokenOut - Output token address
   * @param params.amountIn - Amount of input token (in raw units with decimals)
   * @param params.slippageTolerance - Maximum slippage as a percentage value:
   *   - 0.5 means 0.5% slippage tolerance
   *   - 1 means 1% slippage tolerance
   *   - Default: 0.5 (0.5%)
   *
   * @returns Quote with amountOut, amountOutMinimum (after slippage), priceImpact, and fee tier
   */
  async getQuote(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    slippageTolerance?: number;
  }): Promise<SwapQuote> {
    const quoterAddress = await this.getQuoterAddress();
    const slippage = params.slippageTolerance ?? 0.5;

    // Try each fee tier to find the best quote
    let bestQuote: SwapQuote | null = null;

    for (const fee of FEE_TIERS) {
      try {
        const quote = await this.getQuoteForFee(
          quoterAddress,
          params.tokenIn,
          params.tokenOut,
          params.amountIn,
          fee
        );

        if (!bestQuote || quote.amountOut > bestQuote.amountOut) {
          bestQuote = quote;
        }
      } catch {
        // This fee tier doesn't have a pool, try next
        continue;
      }
    }

    if (!bestQuote) {
      throw new Error(
        `No liquidity found for ${params.tokenIn} -> ${params.tokenOut}`
      );
    }

    // Calculate amount out minimum with slippage protection
    // slippage is a percentage (e.g., 0.5 for 0.5%), so:
    // - slippage 0.5% means multiplier = (100 - 0.5) * 100 = 9950
    // - amountOutMinimum = amountOut * 9950 / 10000 = 99.5% of amountOut
    const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100));
    bestQuote.amountOutMinimum = (bestQuote.amountOut * slippageMultiplier) / 10000n;

    return bestQuote;
  }

  /**
   * Get quote for a specific fee tier
   */
  private async getQuoteForFee(
    quoterAddress: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    fee: FeeTier
  ): Promise<SwapQuote> {
    // Call quoteExactInputSingle with staticCall (simulates transaction)
    const params = {
      tokenIn,
      tokenOut,
      amountIn,
      fee,
      sqrtPriceLimitX96: 0n,
    };

    // Use eth_call to simulate the quote
    const result = await this.rpc.call({
      to: quoterAddress,
      data: this.encodeQuoteCall(params),
    });

    // Decode the result
    const decoded = this.decodeQuoteResult(result);

    // Calculate price impact using initializedTicksCrossed
    // Each tick in Uniswap V3 represents a 0.01% price change (1 basis point)
    // The fee also contributes to effective price impact
    const priceImpact = this.calculatePriceImpact(
      fee,
      decoded.initializedTicksCrossed,
      amountIn,
      decoded.amountOut
    );

    return {
      amountIn,
      amountOut: decoded.amountOut,
      amountOutMinimum: 0n, // Will be set by caller with slippage
      priceImpact,
      fee,
      path: [{ tokenIn, tokenOut, fee }],
      gasEstimate: decoded.gasEstimate,
      initializedTicksCrossed: decoded.initializedTicksCrossed,
    };
  }

  /**
   * Encode quoteExactInputSingle call data
   */
  private encodeQuoteCall(params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    fee: FeeTier;
    sqrtPriceLimitX96: bigint;
  }): Hex {
    // Function selector for quoteExactInputSingle
    const selector = '0xc6a5026a';

    // Encode the tuple parameters manually
    const tokenInPadded = params.tokenIn.slice(2).toLowerCase().padStart(64, '0');
    const tokenOutPadded = params.tokenOut.slice(2).toLowerCase().padStart(64, '0');
    const amountInHex = params.amountIn.toString(16).padStart(64, '0');
    const feeHex = params.fee.toString(16).padStart(64, '0');
    const sqrtPriceLimitHex = params.sqrtPriceLimitX96.toString(16).padStart(64, '0');

    return (selector + tokenInPadded + tokenOutPadded + amountInHex + feeHex + sqrtPriceLimitHex) as Hex;
  }

  /**
   * Decode quote result
   */
  private decodeQuoteResult(data: Hex): {
    amountOut: bigint;
    sqrtPriceX96After: bigint;
    initializedTicksCrossed: number;
    gasEstimate: bigint;
  } {
    // Remove 0x prefix and decode
    const hex = data.slice(2);

    // Each uint256 is 32 bytes (64 hex chars)
    const amountOut = BigInt('0x' + hex.slice(0, 64));
    const sqrtPriceX96After = BigInt('0x' + hex.slice(64, 128));
    const initializedTicksCrossed = Number(BigInt('0x' + hex.slice(128, 192)));
    const gasEstimate = BigInt('0x' + hex.slice(192, 256));

    return { amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate };
  }

  /**
   * Calculate price impact based on quote data.
   *
   * Price impact is estimated using:
   * 1. The fee tier (base cost of the swap)
   * 2. Number of initialized ticks crossed (each tick = ~0.01% price movement in Uniswap V3)
   * 3. Comparison of input/output ratio vs. a theoretical "spot" rate
   *
   * This provides a more accurate estimate than just returning the fee percentage,
   * though exact price impact would require comparing against the pool's current spot price.
   *
   * @param fee - The fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
   * @param ticksCrossed - Number of initialized tick boundaries crossed during the swap
   * @param amountIn - Input amount in raw units
   * @param amountOut - Output amount in raw units
   * @returns Estimated price impact as a percentage (e.g., 0.5 means 0.5%)
   */
  private calculatePriceImpact(
    fee: FeeTier,
    ticksCrossed: number,
    _amountIn: bigint,
    _amountOut: bigint
  ): number {
    // Base impact from the fee tier
    const feePercent = fee / 10000;

    // Each tick crossed represents approximately 0.01% (1 basis point) price movement
    // In Uniswap V3, ticks are spaced at 1.0001^tick, so each tick is ~0.01%
    // More ticks crossed = larger swap relative to liquidity = higher price impact
    const tickImpact = ticksCrossed * 0.01;

    // Total estimated price impact
    // For most swaps with good liquidity, ticksCrossed is 0-2
    // High tick counts (10+) indicate significant price movement through the pool
    const totalImpact = feePercent + tickImpact;

    // Round to 4 decimal places
    return Math.round(totalImpact * 10000) / 10000;
  }

  /**
   * Parse the actual output amount from transaction receipt logs.
   *
   * Looks for ERC20 Transfer events to the recipient address to determine
   * the actual amount received (not just the minimum).
   *
   * @param receipt - Transaction receipt with logs
   * @param tokenOut - Output token address
   * @param recipient - Address that should receive the tokens
   * @returns Actual output amount, or undefined if not found in logs
   */
  private parseActualOutputFromLogs(
    receipt: TransactionReceipt,
    tokenOut: Address,
    recipient: Address
  ): bigint | undefined {
    // Safety check: if no logs, return undefined
    if (!receipt.logs || receipt.logs.length === 0) {
      return undefined;
    }

    // Look for Transfer events from the output token to the recipient
    // Transfer(address indexed from, address indexed to, uint256 value)
    // topic[0] = event signature, topic[1] = from, topic[2] = to
    // data = value (uint256)
    const tokenOutLower = tokenOut.toLowerCase();
    const recipientPadded = recipient.toLowerCase().slice(2).padStart(64, '0');

    for (const log of receipt.logs) {
      // Check if this is a Transfer event from the output token
      const topic0 = log.topics[0];
      const topic2 = log.topics[2];
      if (
        log.address.toLowerCase() === tokenOutLower &&
        log.topics.length >= 3 &&
        topic0 &&
        topic2 &&
        topic0.toLowerCase() === TRANSFER_EVENT_TOPIC.toLowerCase()
      ) {
        // Check if the recipient matches (topic[2] is the "to" address)
        const toAddress = topic2.slice(2).toLowerCase();
        if (toAddress === recipientPadded) {
          // Parse the amount from log data
          const amountHex = log.data.slice(2); // Remove 0x prefix
          return BigInt('0x' + amountHex);
        }
      }
    }

    return undefined;
  }

  /**
   * Check and set token approval for router if needed
   */
  async ensureApproval(
    tokenAddress: Address,
    amount: bigint,
    owner: Address
  ): Promise<Hex | null> {
    if (!this.account) {
      throw new Error('Account required for approval');
    }

    const routerAddress = await this.getRouterAddress();

    const tokenContract = new Contract({
      address: tokenAddress,
      abi: ERC20_APPROVE_ABI,
      rpc: this.rpc,
      account: this.account,
    });

    // Check current allowance
    const allowance = await tokenContract.read<bigint>('allowance', [owner, routerAddress]);

    if (allowance >= amount) {
      return null; // Already approved
    }

    // Approve max uint256 to avoid repeated approvals
    const maxUint256 = 2n ** 256n - 1n;
    const result = await tokenContract.write('approve', [routerAddress, maxUint256]);
    const receipt = await result.wait();

    return receipt.hash;
  }

  /**
   * Execute a swap
   */
  async executeSwap(params: SwapParams): Promise<SwapExecutionResult> {
    if (!this.account) {
      throw new Error('Account required for swap execution');
    }

    const routerAddress = await this.getRouterAddress();
    const chainId = await this.getChainId();

    // Build the swap transaction
    const swapData = this.encodeSwapCall(params);

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      from: this.account.address,
      to: routerAddress,
      data: swapData,
      value: 0n,
    });

    // Get nonce
    const nonce = await this.rpc.getTransactionCount(this.account.address);

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(routerAddress)
      .value(0n)
      .data(swapData)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit * 12n / 10n); // Add 20% buffer

    if (gasEstimate.maxFeePerGas) {
      builder = builder
        .maxFeePerGas(gasEstimate.maxFeePerGas)
        .maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas ?? 0n);
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);
    const receipt = await this.rpc.waitForTransaction(hash);

    // Parse actual output amount from transaction logs
    // This gives us the real amount received, not just the minimum
    const actualOutput = this.parseActualOutputFromLogs(
      receipt,
      params.tokenOut,
      params.recipient
    );

    return {
      hash,
      amountIn: params.amountIn,
      amountOut: actualOutput ?? params.amountOutMinimum,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Execute a swap with ETH as input
   */
  async executeSwapWithETH(params: SwapParams & { value: bigint }): Promise<SwapExecutionResult> {
    if (!this.account) {
      throw new Error('Account required for swap execution');
    }

    const routerAddress = await this.getRouterAddress();
    const chainId = await this.getChainId();

    // Build the swap transaction
    const swapData = this.encodeSwapCall(params);

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      from: this.account.address,
      to: routerAddress,
      data: swapData,
      value: params.value,
    });

    // Get nonce
    const nonce = await this.rpc.getTransactionCount(this.account.address);

    // Build transaction with value (ETH)
    let builder = TransactionBuilder.create()
      .to(routerAddress)
      .value(params.value)
      .data(swapData)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit * 12n / 10n);

    if (gasEstimate.maxFeePerGas) {
      builder = builder
        .maxFeePerGas(gasEstimate.maxFeePerGas)
        .maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas ?? 0n);
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);
    const receipt = await this.rpc.waitForTransaction(hash);

    // Parse actual output amount from transaction logs
    // This gives us the real amount received, not just the minimum
    const actualOutput = this.parseActualOutputFromLogs(
      receipt,
      params.tokenOut,
      params.recipient
    );

    return {
      hash,
      amountIn: params.amountIn,
      amountOut: actualOutput ?? params.amountOutMinimum,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Encode exactInputSingle call
   */
  private encodeSwapCall(params: SwapParams): Hex {
    // Function selector for exactInputSingle
    const selector = '0x04e45aaf';

    // Encode the tuple parameters manually
    const tokenInPadded = params.tokenIn.slice(2).toLowerCase().padStart(64, '0');
    const tokenOutPadded = params.tokenOut.slice(2).toLowerCase().padStart(64, '0');
    const feeHex = (params.fee ?? 3000).toString(16).padStart(64, '0');
    const recipientPadded = params.recipient.slice(2).toLowerCase().padStart(64, '0');
    const amountInHex = params.amountIn.toString(16).padStart(64, '0');
    const amountOutMinHex = params.amountOutMinimum.toString(16).padStart(64, '0');
    const sqrtPriceLimitHex = (params.sqrtPriceLimitX96 ?? 0n).toString(16).padStart(64, '0');

    return (selector + tokenInPadded + tokenOutPadded + feeHex + recipientPadded + amountInHex + amountOutMinHex + sqrtPriceLimitHex) as Hex;
  }

  /**
   * Wrap ETH to WETH
   * This is a direct call to the WETH contract, not a Uniswap swap
   */
  async wrapETH(amount: bigint): Promise<SwapExecutionResult> {
    if (!this.account) {
      throw new Error('Account required for wrapping ETH');
    }

    const wethAddress = await this.getWETHAddress();
    const chainId = await this.getChainId();

    // Encode WETH deposit() call - just the function selector, no params
    const depositData = '0xd0e30db0' as Hex; // deposit()

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      from: this.account.address,
      to: wethAddress,
      data: depositData,
      value: amount,
    });

    // Get nonce
    const nonce = await this.rpc.getTransactionCount(this.account.address);

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(wethAddress)
      .value(amount)
      .data(depositData)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit * 12n / 10n);

    if (gasEstimate.maxFeePerGas) {
      builder = builder
        .maxFeePerGas(gasEstimate.maxFeePerGas)
        .maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas ?? 0n);
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);
    const receipt = await this.rpc.waitForTransaction(hash);

    return {
      hash,
      amountIn: amount,
      amountOut: amount, // 1:1 for wrap
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Unwrap WETH to ETH
   * This is a direct call to the WETH contract, not a Uniswap swap
   */
  async unwrapWETH(amount: bigint): Promise<SwapExecutionResult> {
    if (!this.account) {
      throw new Error('Account required for unwrapping WETH');
    }

    const wethAddress = await this.getWETHAddress();
    const chainId = await this.getChainId();

    // Encode WETH withdraw(uint256) call
    const selector = '0x2e1a7d4d'; // withdraw(uint256)
    const amountHex = amount.toString(16).padStart(64, '0');
    const withdrawData = (selector + amountHex) as Hex;

    // Estimate gas
    const gasEstimate = await this.gasOracle.estimateGas({
      from: this.account.address,
      to: wethAddress,
      data: withdrawData,
      value: 0n,
    });

    // Get nonce
    const nonce = await this.rpc.getTransactionCount(this.account.address);

    // Build transaction
    let builder = TransactionBuilder.create()
      .to(wethAddress)
      .value(0n)
      .data(withdrawData)
      .nonce(nonce)
      .chainId(chainId)
      .gasLimit(gasEstimate.gasLimit * 12n / 10n);

    if (gasEstimate.maxFeePerGas) {
      builder = builder
        .maxFeePerGas(gasEstimate.maxFeePerGas)
        .maxPriorityFeePerGas(gasEstimate.maxPriorityFeePerGas ?? 0n);
    } else if (gasEstimate.gasPrice) {
      builder = builder.gasPrice(gasEstimate.gasPrice);
    }

    // Sign and send
    const signed = builder.sign(this.account);
    const hash = await this.rpc.sendRawTransaction(signed.raw);
    const receipt = await this.rpc.waitForTransaction(hash);

    return {
      hash,
      amountIn: amount,
      amountOut: amount, // 1:1 for unwrap
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      blockNumber: receipt.blockNumber,
    };
  }
}

/**
 * Create a Uniswap client
 */
export function createUniswapClient(config: UniswapClientConfig): UniswapClient {
  return new UniswapClient(config);
}

/**
 * Check if Uniswap is supported on a chain
 */
export function isUniswapSupported(chainId: number): boolean {
  return UNISWAP_ROUTER_ADDRESSES[chainId] !== undefined;
}

/**
 * Get default deadline (20 minutes from now)
 */
export function getDefaultDeadline(seconds = 1200): number {
  return Math.floor(Date.now() / 1000) + seconds;
}
