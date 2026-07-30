/**
 * Central env + network configuration.
 *
 * Everything Hedera-shaped is read through here so the route handlers, the
 * reference client and the scripts can never disagree about which network,
 * facilitator or asset they are talking about.
 */

import {
  HBAR_ASSET_ID,
  HEDERA_TESTNET_CAIP2,
  HEDERA_TESTNET_MIRROR_NODE_URL,
  HEDERA_TESTNET_USDC,
  HEDERA_USDC_DECIMALS,
} from "@x402/hedera";

/** CAIP-2 network this deployment settles on. */
export const NETWORK = (process.env.HEDERA_NETWORK ??
  HEDERA_TESTNET_CAIP2) as typeof HEDERA_TESTNET_CAIP2;

/**
 * Facilitator that verifies and settles payments.
 *
 * Must advertise `hedera:testnet` in its /supported response. Note that
 * `facilitator.x402.rs` does NOT — it has no Hedera entry at all. The x402.org
 * facilitator does, with fee payer 0.0.9185802.
 */
export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

/** Mirror node REST base. Free, no API key, and the source of our own ledger. */
export const MIRROR_URL =
  process.env.HEDERA_MIRROR_URL ?? HEDERA_TESTNET_MIRROR_NODE_URL;

/** Account that receives x402 settlements. */
export const PAY_TO =
  process.env.PAY_TO_ACCOUNT ?? process.env.HEDERA_ACCOUNT_ID ?? "";

/** HBAR is represented as asset id 0.0.0; amounts are denominated in tinybars. */
export const HBAR_ASSET = HBAR_ASSET_ID;
export const TINYBARS_PER_HBAR = 100_000_000;

/** USDC on Hedera testnet, issued as an HTS fungible token. */
export const USDC_ASSET = process.env.HEDERA_USDC_TOKEN_ID ?? HEDERA_TESTNET_USDC;
export const USDC_DECIMALS = HEDERA_USDC_DECIMALS;

/**
 * Publisher credits — an HTS token that splits its own revenue.
 *
 * Unlike HBAR and USDC this is a token we issue, which is exactly what lets it
 * carry fractional custom fees routing a cut of every transfer to shareholder
 * accounts at the protocol level. We cannot do that to Circle's USDC because we
 * do not control that token.
 */
export const CREDITS_ASSET = process.env.HBAR402_CREDITS_TOKEN_ID ?? "";
export const CREDITS_DECIMALS = Number(
  process.env.HBAR402_CREDITS_DECIMALS ?? "6",
);

/** Fee collectors that receive a cut of every credits transfer. */
export function shareholders(): string[] {
  return [process.env.HBAR402_SHAREHOLDER_A, process.env.HBAR402_SHAREHOLDER_B].filter(
    (s): s is string => Boolean(s),
  );
}

/** Public base URL, used to build absolute `resource` URLs in 402 responses. */
export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** HashScan link for a Hedera transaction id, for receipts and the ledger UI. */
export function hashscanTx(transactionId: string): string {
  const net = NETWORK.split(":")[1] ?? "testnet";
  return `https://hashscan.io/${net}/transaction/${transactionId}`;
}

/** HashScan link for an account. */
export function hashscanAccount(accountId: string): string {
  const net = NETWORK.split(":")[1] ?? "testnet";
  return `https://hashscan.io/${net}/account/${accountId}`;
}

/** Throws if the server is missing the config it needs to accept payments. */
export function assertServerConfig(): void {
  if (!PAY_TO) {
    throw new Error(
      "PAY_TO_ACCOUNT (or HEDERA_ACCOUNT_ID) must be set to receive x402 payments",
    );
  }
}
