/**
 * Session Keys Example
 *
 * Demonstrates delegated signing with limited permissions:
 * - Creating session keys
 * - Setting permission constraints
 * - Validating actions
 * - Signing with session keys
 *
 * Run: npx tsx examples/session-keys.ts
 */

import {
  SessionKeyManager,
  createSessionKey,
  generatePrivateKey,
  privateKeyToAddress,
  ETH,
  keccak256,
} from '@lambdaclass/eth-agent';

async function main() {
  // Generate owner key (in production, use secure key management)
  const ownerKey = generatePrivateKey();
  const ownerAddress = privateKeyToAddress(ownerKey);
  console.log(`Owner address: ${ownerAddress}`);

  // Create session key manager
  const manager = new SessionKeyManager(ownerKey);

  // Create a session key with permissions
  console.log('\n--- Creating Session Key ---');
  const session = manager.createSession({
    // Time constraints
    validUntil: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
    validAfter: 0, // Valid immediately

    // Value constraints
    maxValue: ETH(0.5), // Max 0.5 ETH per transaction

    // Target constraints
    allowedTargets: [
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
    ],

    // Function constraints
    allowedSelectors: [
      '0xa9059cbb', // transfer(address,uint256)
      '0x095ea7b3', // approve(address,uint256)
    ],

    // Rate limiting
    maxTransactions: 10, // Max 10 transactions
  });

  console.log(`Session key address: ${session.publicKey}`);
  console.log(`Created at: ${new Date(session.createdAt * 1000).toISOString()}`);
  console.log(`Nonce: ${session.nonce}`);

  // Validate actions
  console.log('\n--- Validating Actions ---');

  // Valid action
  const validAction = manager.validateAction(session.publicKey, {
    target: '0x1234567890123456789012345678901234567890',
    value: ETH(0.1),
    selector: '0xa9059cbb',
  });
  console.log(`Valid action (0.1 ETH to allowed target): ${validAction.valid ? 'ALLOWED' : 'DENIED - ' + validAction.reason}`);

  // Action exceeding value limit
  const overLimitAction = manager.validateAction(session.publicKey, {
    target: '0x1234567890123456789012345678901234567890',
    value: ETH(1), // Over 0.5 ETH limit
  });
  console.log(`Over limit (1 ETH): ${overLimitAction.valid ? 'ALLOWED' : 'DENIED - ' + overLimitAction.reason}`);

  // Action to non-allowed target
  const wrongTargetAction = manager.validateAction(session.publicKey, {
    target: '0x9999999999999999999999999999999999999999',
    value: ETH(0.1),
  });
  console.log(`Wrong target: ${wrongTargetAction.valid ? 'ALLOWED' : 'DENIED - ' + wrongTargetAction.reason}`);

  // Action with non-allowed function
  const wrongSelectorAction = manager.validateAction(session.publicKey, {
    target: '0x1234567890123456789012345678901234567890',
    value: ETH(0.1),
    selector: '0x23b872dd', // transferFrom - not allowed
  });
  console.log(`Wrong selector: ${wrongSelectorAction.valid ? 'ALLOWED' : 'DENIED - ' + wrongSelectorAction.reason}`);

  // Sign with session key
  console.log('\n--- Signing with Session Key ---');
  const messageHash = keccak256(new TextEncoder().encode('Test message'));

  const signature = manager.signWithSession(session.publicKey, messageHash, {
    target: '0x1234567890123456789012345678901234567890',
    value: ETH(0.1),
  });

  console.log(`Session key: ${signature.sessionKey}`);
  console.log(`Signature: ${signature.signature.slice(0, 50)}...`);
  console.log(`Nonce after signing: ${session.nonce}`);

  // Transaction limit test
  console.log('\n--- Transaction Limit Test ---');
  const limitedSession = manager.createSession({
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    maxTransactions: 2,
  });

  console.log(`Created session with maxTransactions: 2`);

  // Sign twice
  manager.signWithSession(limitedSession.publicKey, messageHash, {
    target: '0x1234567890123456789012345678901234567890',
    value: 0n,
  });
  console.log(`After 1st sign - nonce: ${limitedSession.nonce}`);

  manager.signWithSession(limitedSession.publicKey, messageHash, {
    target: '0x1234567890123456789012345678901234567890',
    value: 0n,
  });
  console.log(`After 2nd sign - nonce: ${limitedSession.nonce}`);

  // Third sign should fail
  const canSign = manager.validateAction(limitedSession.publicKey, {
    target: '0x1234567890123456789012345678901234567890',
    value: 0n,
  });
  console.log(`3rd sign allowed: ${canSign.valid ? 'yes' : 'no - ' + canSign.reason}`);

  // Export and import session
  console.log('\n--- Export/Import Session ---');
  const exported = manager.exportSession(session.publicKey);
  console.log(`Exported session: ${exported.slice(0, 100)}...`);

  // Create new manager and import
  const newManager = new SessionKeyManager(generatePrivateKey());
  const imported = newManager.importSession(exported);
  console.log(`Imported session key: ${imported.publicKey}`);
  console.log(`Session preserved: ${imported.publicKey === session.publicKey}`);

  // List active sessions
  console.log('\n--- Active Sessions ---');
  const activeSessions = manager.listSessions();
  console.log(`Active sessions: ${activeSessions.length}`);
  for (const s of activeSessions) {
    console.log(`  - ${s.publicKey} (nonce: ${s.nonce})`);
  }

  // Revoke a session
  console.log('\n--- Revoking Session ---');
  const revoked = manager.revokeSession(limitedSession.publicKey);
  console.log(`Revoked: ${revoked}`);
  console.log(`Active sessions after revoke: ${manager.listSessions().length}`);

  // Create standalone session key (without manager)
  console.log('\n--- Standalone Session Key ---');
  const standalone = createSessionKey({
    validUntil: Math.floor(Date.now() / 1000) + 7200,
    maxValue: ETH(1),
  });
  console.log(`Standalone key address: ${standalone.address}`);
  console.log(`Has private key: ${standalone.privateKey.startsWith('0x')}`);
}

main().catch(console.error);
