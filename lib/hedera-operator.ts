/**
 * Shared Hedera operator client.
 *
 * `PrivateKey` and `Client` are imported from `@x402/hedera` rather than
 * `@hiero-ledger/sdk` wherever possible, because the SDK relies on internal
 * string-brand and instanceof checks that break if two copies end up on disk.
 * We pin `@hiero-ledger/sdk` to the exact version `@x402/hedera` depends on so
 * pnpm resolves a single instance, which lets us pull in the topic classes the
 * re-export does not cover.
 */

import { Client, PrivateKey } from "@x402/hedera";

/** Parses either portal key format: DER (ED25519) or raw hex (ECDSA). */
export function parseKey(raw: string): PrivateKey {
  const key = raw.trim().replace(/^0x/, "");
  if (key.startsWith("302e") || key.startsWith("3030") || key.length > 64) {
    return PrivateKey.fromStringDer(key);
  }
  return PrivateKey.fromStringECDSA(key);
}

let client: Client | null = null;

/**
 * Operator client for transactions we submit ourselves (HCS receipts, token
 * creation). Note this is separate from x402 settlement — those transactions
 * are signed by the buyer and submitted by the facilitator, never by us.
 */
export function getOperatorClient(): Client {
  if (client) return client;

  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY are required");
  }

  const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
  client = network.endsWith("mainnet") ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(accountId, parseKey(privateKey));
  return client;
}

export function operatorAccountId(): string {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  if (!accountId) throw new Error("HEDERA_ACCOUNT_ID is required");
  return accountId;
}
