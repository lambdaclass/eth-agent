/**
 * Uniswap V3 protocol integration
 * Supports swaps via SwapRouter02 and quotes via Quoter V2
 */

import type { Address, Hex } from '../core/types.js';
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

    // Calculate price impact (simplified - real calculation would need pool data)
    const priceImpact = this.estimatePriceImpact(fee);

    return {
      amountIn,
      amountOut: decoded.amountOut,
      amountOutMinimum: 0n, // Will be set by caller with slippage
      priceImpact,
      fee,
      path: [{ tokenIn, tokenOut, fee }],
      gasEstimate: decoded.gasEstimate,
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
   * Estimate price impact (simplified calculation)
   */
  private estimatePriceImpact(fee: FeeTier): number {
    // This is a simplified estimate - real price impact calculation
    // would require pool reserves and tick data
    const feePercent = fee / 10000;
    return feePercent;
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

    return {
      hash,
      amountIn: params.amountIn,
      amountOut: params.amountOutMinimum, // Actual amount from logs would be better
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

    return {
      hash,
      amountIn: params.amountIn,
      amountOut: params.amountOutMinimum,
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
