/**
 * AI Integration Example
 *
 * Demonstrates integrating eth-agent with AI frameworks:
 * - OpenAI function calling
 * - LangChain tools
 * - Anthropic tool use
 *
 * Run: npx tsx examples/ai-integration.ts
 */

import {
  AgentWallet,
  SafetyPresets,
  createOpenAITools,
  createLangChainTools,
  createAnthropicTools,
} from '@lambdaclass/eth-agent';

// Example approval callback for AI agents
async function aiApproval(request: {
  summary: string;
  details: Record<string, unknown>;
}): Promise<boolean> {
  console.log(`\n[APPROVAL REQUIRED] ${request.summary}`);
  // In production, this could:
  // - Send notification to human operator
  // - Check against policy rules
  // - Queue for review
  // For demo, auto-approve small amounts
  const value = request.details.value as { wei: bigint } | undefined;
  if (value && value.wei < 1000000000000000n) { // < 0.001 ETH
    console.log('[AUTO-APPROVED] Amount under threshold');
    return true;
  }
  console.log('[DENIED] Requires human approval');
  return false;
}

async function main() {
  // Create wallet with AI-friendly safety settings
  const wallet = AgentWallet.create({
    privateKey: process.env.ETH_PRIVATE_KEY!,
    rpcUrl: process.env.RPC_URL ?? 'https://eth.llamarpc.com',
    ...SafetyPresets.CONSERVATIVE, // Strict limits for autonomous operation
    onApprovalRequired: aiApproval,
  });

  console.log('=== AI Integration Examples ===\n');
  console.log(`Wallet: ${wallet.address}`);

  // OpenAI Function Calling
  console.log('\n--- OpenAI Tools ---');
  const openaiTools = createOpenAITools(wallet);
  console.log('Available tools:');
  for (const tool of openaiTools) {
    console.log(`  - ${tool.function.name}: ${tool.function.description}`);
  }

  // Example: How OpenAI would call these tools
  console.log('\nExample OpenAI function call:');
  const openaiCall = {
    name: 'get_balance',
    arguments: JSON.stringify({}),
  };
  console.log(`  Tool: ${openaiCall.name}`);
  console.log(`  Args: ${openaiCall.arguments}`);

  // Execute the tool
  const balanceTool = openaiTools.find(t => t.function.name === 'get_balance');
  if (balanceTool) {
    const result = await (balanceTool as any).execute({});
    console.log(`  Result: ${JSON.stringify(result)}`);
  }

  // LangChain Tools
  console.log('\n--- LangChain Tools ---');
  const langchainTools = createLangChainTools(wallet);
  console.log('Available tools:');
  for (const tool of langchainTools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }

  // Example: Using LangChain tool
  console.log('\nExample LangChain tool call:');
  const balanceLCTool = langchainTools.find(t => t.name === 'get_balance');
  if (balanceLCTool) {
    const result = await balanceLCTool.invoke({});
    console.log(`  get_balance result: ${JSON.stringify(result)}`);
  }

  // Anthropic Tools
  console.log('\n--- Anthropic Tools ---');
  const anthropicTools = createAnthropicTools(wallet);
  console.log('Available tools:');
  for (const tool of anthropicTools) {
    console.log(`  - ${tool.name}: ${tool.description}`);
  }

  // Example: How Anthropic would use these tools
  console.log('\nExample Anthropic tool use:');
  const anthropicToolUse = {
    type: 'tool_use',
    id: 'toolu_01234',
    name: 'preview_transaction',
    input: {
      to: 'vitalik.eth',
      amount: '0.001 ETH',
    },
  };
  console.log(`  Tool: ${anthropicToolUse.name}`);
  console.log(`  Input: ${JSON.stringify(anthropicToolUse.input)}`);

  // Execute preview
  const previewTool = anthropicTools.find(t => t.name === 'preview_transaction');
  if (previewTool) {
    const result = await (previewTool as any).execute(anthropicToolUse.input);
    console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
  }

  // Demonstrate safety in action
  console.log('\n--- Safety Demonstration ---');

  console.log('\n1. Checking spending limits:');
  const limits = wallet.getLimits();
  console.log(`   Per-TX limit: ${limits.perTransaction.limit} ETH`);
  console.log(`   Hourly limit: ${limits.hourly.limit} ETH`);
  console.log(`   Daily limit: ${limits.daily.limit} ETH`);

  console.log('\n2. Preview transaction (with safety checks):');
  try {
    const preview = await wallet.preview({
      to: 'vitalik.eth',
      amount: '0.001 ETH',
    });
    console.log(`   Can execute: ${preview.canExecute}`);
    console.log(`   Total cost: ${preview.costs.total.eth} ETH`);
    if (preview.blockers.length > 0) {
      console.log(`   Blockers: ${preview.blockers.join(', ')}`);
    }
    if (preview.warnings.length > 0) {
      console.log(`   Warnings: ${preview.warnings.join(', ')}`);
    }
  } catch (e) {
    console.log(`   Error: ${(e as Error).message}`);
  }

  console.log('\n3. Attempting to exceed limit:');
  try {
    const bigPreview = await wallet.preview({
      to: 'vitalik.eth',
      amount: '100 ETH',
    });
    console.log(`   Can execute: ${bigPreview.canExecute}`);
    console.log(`   Blockers: ${bigPreview.blockers.join(', ')}`);
  } catch (e) {
    console.log(`   Blocked: ${(e as Error).message}`);
  }

  // Show how to build a simple AI agent loop
  console.log('\n--- Simple AI Agent Loop ---');
  console.log(`
Example agent loop pseudocode:

async function agentLoop(wallet, llm) {
  while (true) {
    const task = await getNextTask();

    // LLM decides action
    const action = await llm.chat([
      { role: 'system', content: 'You are an Ethereum agent...' },
      { role: 'user', content: task.description },
    ], { tools: createOpenAITools(wallet) });

    if (action.tool_calls) {
      for (const call of action.tool_calls) {
        // Safety checks happen inside tool execution
        const result = await executeToolCall(call, wallet);

        // Report result
        await reportResult(task, result);
      }
    }
  }
}
`);

  console.log('\n=== Done ===');
}

main().catch(console.error);
