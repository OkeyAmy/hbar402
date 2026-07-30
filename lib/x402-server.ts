/**
 * x402 resource server, Hedera flavour.
 *
 * Registers the Hedera `exact` scheme against a facilitator that advertises
 * `hedera:testnet`. The scheme is deliberately NOT the EVM one: on Hedera a
 * payment is a partially-signed native `TransferTransaction` where the
 * facilitator acts as fee payer and submits it, so EIP-3009 / permit style
 * EVM flows do not apply.
 */

import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { FACILITATOR_URL, NETWORK, USDC_ASSET, USDC_DECIMALS } from "./config";
import { productIdFromPath } from "./catalog";
import { RECEIPT_VERSION, submitReceipt } from "./hcs";

let serverPromise: Promise<x402ResourceServer> | null = null;

/**
 * Returns the shared resource server, initialising it on first use.
 *
 * The memoised value is deliberately cleared if initialisation fails.
 * `initialize()` fetches supported payment kinds over the network, so a single
 * transient facilitator hiccup would otherwise poison the cached promise and
 * every subsequent request would fail instantly with the same stale error until
 * the process restarted — an outage that never self-heals on a warm instance.
 * Dropping the promise on failure means the next request simply retries.
 */
export function getResourceServer(): Promise<x402ResourceServer> {
  if (serverPromise) return serverPromise;
  serverPromise = (async () => {
    const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
    const server = new x402ResourceServer(facilitatorClient).register(
      NETWORK,
      new ExactHederaScheme({
        // Fallback used when a price is expressed as plain money ("$0.001")
        // rather than an explicit asset+amount. Our catalog always states the
        // asset explicitly, but this keeps ad-hoc money prices working.
        defaultAssets: {
          [NETWORK]: { asset: USDC_ASSET, decimals: USDC_DECIMALS },
        },
      }),
    );

    // Every settled payment is appended to the public HCS topic. This fires
    // only after the facilitator confirms settlement, so a receipt can never
    // exist for a payment that did not land.
    server.onAfterSettle(async (ctx) => {
      if (!ctx.result.success) return;

      const resourceUrl = ctx.paymentPayload.resource?.url ?? "";
      let product = "unknown";
      try {
        product = productIdFromPath(new URL(resourceUrl).pathname) || "unknown";
      } catch {
        product = productIdFromPath(resourceUrl) || "unknown";
      }

      await submitReceipt({
        v: RECEIPT_VERSION,
        product,
        asset: ctx.requirements.asset,
        amount: ctx.requirements.amount,
        payer: ctx.result.payer ?? "unknown",
        payTo: ctx.requirements.payTo,
        tx: ctx.result.transaction,
        network: ctx.requirements.network,
        ts: new Date().toISOString(),
      });
    });

    // `initialize()` fetches supported payment kinds over the network and the
    // public facilitator is intermittently slow to answer. A couple of quick
    // retries turn a visible 500 into a slightly slower first request.
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await server.initialize();
        return server;
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 400));
        }
      }
    }
    throw lastError;
  })();

  // Clear on rejection so the failure is not cached. Attached before returning
  // so it applies regardless of how the caller handles the promise.
  serverPromise.catch(() => {
    serverPromise = null;
  });

  return serverPromise;
}
