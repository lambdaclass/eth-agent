import { describe, it, expect } from 'vitest';
import { TransactionBuilder, signTransaction, parseTransaction } from '../../src/protocol/transaction.js';
import { EOA } from '../../src/protocol/account.js';
import type { Address, Hex, Hash } from '../../src/core/types.js';

describe('Transaction', () => {
  const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
  const testAddress = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;
  const recipient = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;

  describe('TransactionBuilder', () => {
    it('creates empty transaction', () => {
      const tx = TransactionBuilder.create().build();
      expect(tx.type).toBe('legacy');
    });

    it('sets recipient', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .build();
      expect(tx.to).toBe(recipient);
    });

    it('sets value', () => {
      const tx = TransactionBuilder.create()
        .value(1000000000000000000n) // 1 ETH
        .build();
      expect(tx.value).toBe(1000000000000000000n);
    });

    it('sets data', () => {
      const tx = TransactionBuilder.create()
        .data('0xdeadbeef')
        .build();
      expect(tx.data).toBe('0xdeadbeef');
    });

    it('sets nonce', () => {
      const tx = TransactionBuilder.create()
        .nonce(5)
        .build();
      expect(tx.nonce).toBe(5);
    });

    it('sets chainId', () => {
      const tx = TransactionBuilder.create()
        .chainId(1)
        .build();
      expect(tx.chainId).toBe(1);
    });

    it('sets gasLimit', () => {
      const tx = TransactionBuilder.create()
        .gasLimit(21000n)
        .build();
      expect(tx.gasLimit).toBe(21000n);
    });

    it('sets gasPrice for legacy', () => {
      const tx = TransactionBuilder.create()
        .gasPrice(20000000000n)
        .build();
      expect(tx.type).toBe('legacy');
      expect((tx as { gasPrice: bigint }).gasPrice).toBe(20000000000n);
    });

    it('chains all methods', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000n)
        .data('0x1234')
        .nonce(1)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      expect(tx.to).toBe(recipient);
      expect(tx.value).toBe(1000n);
      expect(tx.data).toBe('0x1234');
      expect(tx.nonce).toBe(1);
      expect(tx.chainId).toBe(1);
      expect(tx.gasLimit).toBe(21000n);
    });

    describe('EIP-1559 transactions', () => {
      it('creates EIP-1559 when maxFeePerGas is set', () => {
        const tx = TransactionBuilder.create()
          .maxFeePerGas(30000000000n)
          .build();
        expect(tx.type).toBe('eip1559');
      });

      it('creates EIP-1559 when maxPriorityFeePerGas is set', () => {
        const tx = TransactionBuilder.create()
          .maxPriorityFeePerGas(2000000000n)
          .build();
        expect(tx.type).toBe('eip1559');
      });

      it('sets both EIP-1559 gas fields', () => {
        const tx = TransactionBuilder.create()
          .maxFeePerGas(30000000000n)
          .maxPriorityFeePerGas(2000000000n)
          .build();

        expect(tx.type).toBe('eip1559');
        expect((tx as { maxFeePerGas: bigint }).maxFeePerGas).toBe(30000000000n);
        expect((tx as { maxPriorityFeePerGas: bigint }).maxPriorityFeePerGas).toBe(2000000000n);
      });
    });

    describe('EIP-2930 transactions', () => {
      it('creates EIP-2930 when accessList is set', () => {
        const tx = TransactionBuilder.create()
          .gasPrice(20000000000n)
          .accessList([
            { address: recipient, storageKeys: [] },
          ])
          .build();
        expect(tx.type).toBe('eip2930');
      });
    });

    describe('type override', () => {
      it('forces legacy type', () => {
        const tx = TransactionBuilder.create()
          .maxFeePerGas(30000000000n)
          .type('legacy')
          .build();
        expect(tx.type).toBe('legacy');
      });

      it('forces eip2930 type', () => {
        const tx = TransactionBuilder.create()
          .type('eip2930')
          .build();
        expect(tx.type).toBe('eip2930');
      });

      it('forces eip1559 type', () => {
        const tx = TransactionBuilder.create()
          .type('eip1559')
          .build();
        expect(tx.type).toBe('eip1559');
      });
    });
  });

  describe('signTransaction', () => {
    const account = EOA.fromPrivateKey(testPrivateKey);

    it('signs legacy transaction', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);

      expect(signed.raw).toMatch(/^0x/);
      expect(signed.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signed.signature.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signed.signature.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('signs EIP-1559 transaction', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .maxFeePerGas(30000000000n)
        .maxPriorityFeePerGas(2000000000n)
        .build();

      const signed = signTransaction(tx, account);

      expect(signed.raw.startsWith('0x02')).toBe(true); // EIP-1559 type prefix
      expect(signed.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('signs EIP-2930 transaction', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .accessList([])
        .type('eip2930')
        .build();

      const signed = signTransaction(tx, account);

      expect(signed.raw.startsWith('0x01')).toBe(true); // EIP-2930 type prefix
    });

    it('signs via builder', () => {
      const signed = TransactionBuilder.create()
        .to(recipient)
        .value(1000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .sign(account);

      expect(signed.raw).toMatch(/^0x/);
      expect(signed.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('parseTransaction', () => {
    const account = EOA.fromPrivateKey(testPrivateKey);

    it('parses legacy transaction', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(5)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.type).toBe('legacy');
      expect(parsed.to?.toLowerCase()).toBe(recipient.toLowerCase());
      expect(parsed.value).toBe(1000000000000000000n);
      expect(parsed.nonce).toBe(5);
      expect(parsed.gasLimit).toBe(21000n);
      expect(parsed.gasPrice).toBe(20000000000n);
    });

    it('parses EIP-1559 transaction', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(3)
        .chainId(1)
        .gasLimit(21000n)
        .maxFeePerGas(30000000000n)
        .maxPriorityFeePerGas(2000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.type).toBe('eip1559');
      expect(parsed.chainId).toBe(1);
      expect(parsed.nonce).toBe(3);
      expect((parsed as { maxFeePerGas: bigint }).maxFeePerGas).toBe(30000000000n);
      expect((parsed as { maxPriorityFeePerGas: bigint }).maxPriorityFeePerGas).toBe(2000000000n);
    });

    it('parses EIP-2930 transaction', () => {
      const storageKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hash;
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000000000000000000n)
        .nonce(1)
        .chainId(1)
        .gasLimit(30000n)
        .gasPrice(20000000000n)
        .accessList([
          { address: recipient, storageKeys: [storageKey] },
        ])
        .type('eip2930')
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.type).toBe('eip2930');
      expect((parsed as { accessList: unknown[] }).accessList).toBeDefined();
    });

    it('parses transaction with contract creation (no to address)', () => {
      const tx = TransactionBuilder.create()
        .value(0n)
        .data('0x6080604052')
        .nonce(0)
        .chainId(1)
        .gasLimit(100000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.to).toBeUndefined();
      expect(parsed.data).toBe('0x6080604052');
    });

    it('recovers signature', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.signature).toBeDefined();
      expect(parsed.signature.r).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(parsed.signature.s).toMatch(/^0x[a-fA-F0-9]+$/);
    });
  });

  describe('edge cases', () => {
    const account = EOA.fromPrivateKey(testPrivateKey);

    it('handles zero value', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(0n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.value).toBe(0n);
    });

    it('handles empty data', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000n)
        .nonce(0)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.data).toBeUndefined();
    });

    it('handles large nonce', () => {
      const tx = TransactionBuilder.create()
        .to(recipient)
        .value(1000n)
        .nonce(1000000)
        .chainId(1)
        .gasLimit(21000n)
        .gasPrice(20000000000n)
        .build();

      const signed = signTransaction(tx, account);
      const parsed = parseTransaction(signed.raw);

      expect(parsed.nonce).toBe(1000000);
    });

    it('handles different chain IDs', () => {
      const chains = [1, 5, 137, 42161, 10];

      for (const chainId of chains) {
        const tx = TransactionBuilder.create()
          .to(recipient)
          .value(1000n)
          .nonce(0)
          .chainId(chainId)
          .gasLimit(21000n)
          .gasPrice(20000000000n)
          .build();

        const signed = signTransaction(tx, account);
        const parsed = parseTransaction(signed.raw);

        expect(parsed.chainId).toBe(chainId);
      }
    });
  });
});
