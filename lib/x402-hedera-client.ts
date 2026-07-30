/**
 * Reference client. This is the file to copy if you want to buy from hbar402.
 *
 * The whole integration is: build a signer from a Hedera account id + key,
 * register the Hedera exact scheme, and wrap fetch. After that, a paid endpoint
 * is just an ordinary `fetch` call — the 402 handshake, the partially-signed
 * TransferTransaction and the retry all happen underneath.
 */

import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import type { PaymentRequirements } from "@x402/core/types";

/** Which settlement asset the buyer would rather spend. */
export type AssetPreference = "hbar" | "usdc" | "credits";

export const HBAR_ASSET_ID = "0.0.0";

/**
 * Parses either key format the Hedera portal hands out:
 * DER-encoded (ED25519 accounts) or raw hex (ECDSA accounts).
 *
 * Note we import `PrivateKey` from `@x402/hedera` rather than
 * `@hiero-ledger/sdk`. The SDK uses internal string-brand and instanceof
 * checks, so two copies on disk break at runtime with confusing errors like
 * `t.startsWith is not a function`. Going through the re-export guarantees one
 * instance.
 */
export function parseHederaKey(raw: string): PrivateKey {
  const key = raw.trim().replace(/^0x/, "");
  // DER private keys start with a SEQUENCE header; raw ECDSA keys are 64 hex chars.
  if (key.startsWith("302e") || key.startsWith("3030") || key.length > 64) {
    return PrivateKey.fromStringDer(key);
  }
  return PrivateKey.fromStringECDSA(key);
}

/**
 * Chooses which of the server's offered payment options to pay.
 *
 * hbar402 advertises HBAR, USDC and credits in a single 402. A buyer declares
 * what it holds and the rest is automatic. Since USDC and credits are both HTS
 * tokens they cannot be told apart structurally, so USDC is matched by its known
 * token id and credits is "the HTS token that is not USDC". Passing a raw token
 * id instead of a preference name pins the choice exactly.
 *
 * If the preferred asset is not on offer we fall back to the first option rather
 * than failing — a buyer that can pay something should not be blocked by a
 * preference.
 */
export function assetSelector(prefer: AssetPreference | string, usdcAsset: string) {
  return (
    _version: number,
    requirements: PaymentRequirements[],
  ): PaymentRequirements => {
    const matches = (r: PaymentRequirements): boolean => {
      switch (prefer) {
        case "hbar":
          return r.asset === HBAR_ASSET_ID;
        case "usdc":
          return r.asset === usdcAsset;
        case "credits":
          return r.asset !== HBAR_ASSET_ID && r.asset !== usdcAsset;
        default:
          // An explicit token id.
          return r.asset === prefer;
      }
    };
    return requirements.find(matches) ?? requirements[0];
  };
}

export type BuyerConfig = {
  accountId: string;
  privateKey: string;
  /** CAIP-2 network, e.g. "hedera:testnet". */
  network?: `${string}:${string}`;
  /** "hbar" | "usdc" | "credits", or an explicit HTS token id. */
  prefer?: AssetPreference | string;
  /** USDC token id, needed to distinguish USDC from other HTS tokens. */
  usdcAsset?: string;
};

/** USDC on Hedera testnet. Override via BuyerConfig for mainnet. */
export const HEDERA_TESTNET_USDC = "0.0.429274";

/** Builds a `fetch` that transparently pays for 402 responses. */
export function createPayingFetch(config: BuyerConfig) {
  const network = config.network ?? "hedera:testnet";
  const signer = createClientHederaSigner(
    config.accountId,
    parseHederaKey(config.privateKey),
    { network },
  );

  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network, client: new ExactHederaScheme(signer) }],
    paymentRequirementsSelector: assetSelector(
      config.prefer ?? "hbar",
      config.usdcAsset ?? HEDERA_TESTNET_USDC,
    ),
  });
}

export type Receipt = {
  transactionId: string | null;
  hashscan: string | null;
  payer: string | null;
  success: boolean;
};

export type PurchaseResult<T = unknown> = {
  status: number;
  data: T | null;
  receipt: Receipt | null;
  error?: string;
};

function hashscanFor(transactionId: string, network: string): string {
  const net = network.split(":")[1] ?? "testnet";
  // Mirror node / SDK render ids as `0.0.x@secs.nanos`; HashScan wants dashes.
  const normalized = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `https://hashscan.io/${net}/transaction/${normalized}`;
}

/**
 * One-shot purchase helper: calls a paid URL, pays for it, and returns the data
 * alongside a verifiable receipt.
 */
export async function buy<T = unknown>(
  url: string,
  config: BuyerConfig,
): Promise<PurchaseResult<T>> {
  const network = config.network ?? "hedera:testnet";
  const payingFetch = createPayingFetch(config);

  const res = await payingFetch(url, { headers: { accept: "application/json" } });
  // x402 v2 dropped the `x-` prefix: the settlement receipt comes back on
  // `PAYMENT-RESPONSE`, matching the `PAYMENT-REQUIRED` header on the 402.
  const header =
    res.headers.get("payment-response") ?? res.headers.get("x-payment-response");

  let receipt: Receipt | null = null;
  if (header) {
    try {
      const settled = decodePaymentResponseHeader(header);
      // The generic SettleResponse field is `transaction`; the Hedera scheme
      // puts the Hedera transaction id ("0.0.x@secs.nanos") in it.
      const txId = settled.transaction || null;
      receipt = {
        transactionId: txId,
        hashscan: txId ? hashscanFor(txId, network) : null,
        payer: settled.payer ?? null,
        success: settled.success ?? false,
      };
    } catch {
      receipt = null;
    }
  }

  if (!res.ok) {
    return {
      status: res.status,
      data: null,
      receipt,
      error: await res.text().catch(() => "request failed"),
    };
  }

  return { status: res.status, data: (await res.json()) as T, receipt };
}
