/**
 * The paid endpoint. One route serves the whole catalog.
 *
 * Two things worth noting about the shape here:
 *
 *  1. `accepts` is an array with one entry per settlement asset, so a single 402
 *     response offers the buyer both HBAR and USDC and lets it pick whichever it
 *     holds. The facilitator settles whichever option comes back.
 *  2. Prices are `DynamicPrice` functions rather than constants, so the product
 *     (and therefore its price) is resolved from the request path at 402 time.
 *     That means one wrapper covers every product instead of one per price tier.
 */

import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import type { HTTPRequestContext } from "@x402/core/server";
import {
  findProduct,
  productIdFromPath,
  validateParams,
  PRODUCTS,
} from "@/lib/catalog";
import { resolveProduct } from "@/lib/providers";
import { getResourceServer } from "@/lib/x402-server";
import {
  CREDITS_ASSET,
  HBAR_ASSET,
  NETWORK,
  PAY_TO,
  USDC_ASSET,
  assertServerConfig,
} from "@/lib/config";

// The Hedera SDK needs node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A single entry in `accepts`. Derived from RouteConfig rather than imported,
 * since @x402/core/server does not re-export the PaymentOption type directly.
 */
type PaymentOption = Extract<RouteConfig["accepts"], readonly unknown[]>[number];

/** Resolves the product for a request, or throws if the path is unknown. */
function productForContext(ctx: HTTPRequestContext) {
  const product = findProduct(productIdFromPath(ctx.path));
  if (!product) throw new Error(`unknown product in path: ${ctx.path}`);
  return product;
}

const acceptedAssets: PaymentOption[] = [
  {
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    // HBAR: asset id 0.0.0, amount denominated in tinybars.
    price: (ctx) => ({
      asset: HBAR_ASSET,
      amount: String(productForContext(ctx).priceTinybars),
    }),
    maxTimeoutSeconds: 120,
  },
  {
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    // USDC: Circle-issued HTS fungible token, amount in 6-decimal base units.
    price: (ctx) => ({
      asset: USDC_ASSET,
      amount: String(productForContext(ctx).priceUsdcAtomic),
    }),
    maxTimeoutSeconds: 120,
  },
];

// Credits are only offered once the token exists, so a fresh clone of this repo
// works with HBAR and USDC before anyone runs `pnpm hts:credits`.
if (CREDITS_ASSET) {
  acceptedAssets.push({
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    price: (ctx) => ({
      asset: CREDITS_ASSET,
      amount: String(productForContext(ctx).priceCreditsAtomic),
    }),
    maxTimeoutSeconds: 120,
  });
}

const routeConfig: RouteConfig = {
  accepts: acceptedAssets,
  description: "hbar402 — pay-per-query Hedera-native data",
  mimeType: "application/json",
  serviceName: "hbar402",
  tags: ["hedera", "market-data", "x402", "pay-per-query"],
  // Unpaid callers get the catalog entry rather than an empty body, so a bare
  // curl is self-documenting.
  unpaidResponseBody: (ctx) => {
    const product = findProduct(productIdFromPath(ctx.path));
    return {
      contentType: "application/json",
      body: product
        ? {
            error: "payment_required",
            product: {
              id: product.id,
              title: product.title,
              description: product.description,
              returns: product.returns,
              params: product.params,
            },
            pricing: {
              hbar: { asset: HBAR_ASSET, amount: String(product.priceTinybars) },
              usdc: { asset: USDC_ASSET, amount: String(product.priceUsdcAtomic) },
              ...(CREDITS_ASSET
                ? {
                    credits: {
                      asset: CREDITS_ASSET,
                      amount: String(product.priceCreditsAtomic),
                      note: "H402 transfers also pay shareholders via HTS fractional fees",
                    },
                  }
                : {}),
            },
            hint: "Retry with an x402 payment. See /docs for a client in ~20 lines.",
          }
        : {
            error: "unknown_product",
            available: PRODUCTS.map((p) => p.id),
          },
    };
  },
};

/** The actual data handler. Only reached once payment has been verified. */
const handler = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url);
  const product = findProduct(productIdFromPath(url.pathname));

  if (!product) {
    return NextResponse.json(
      { error: "unknown_product", available: PRODUCTS.map((p) => p.id) },
      { status: 404 },
    );
  }

  const paramError = validateParams(product, url.searchParams);
  if (paramError) {
    // Returning >=400 means withX402 does not settle the payment, so a
    // malformed request costs the buyer nothing.
    return NextResponse.json(
      { error: "invalid_request", message: paramError },
      { status: 400 },
    );
  }

  try {
    const data = await resolveProduct(product, url.searchParams);
    return NextResponse.json({
      product: product.id,
      data,
      network: NETWORK,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "upstream_failure",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
};

let paidHandler: ((req: NextRequest) => Promise<NextResponse>) | null = null;

async function getPaidHandler() {
  if (paidHandler) return paidHandler;
  assertServerConfig();
  const server = await getResourceServer();
  paidHandler = withX402(handler, routeConfig, server);
  return paidHandler;
}

/**
 * Rebuilds the payload for a request whose payment already settled.
 *
 * Used only by the drained-body guard below. Safe to call because every product
 * is an idempotent read — re-resolving costs us an upstream fetch, not the buyer
 * another payment.
 */
async function regenerate(request: NextRequest): Promise<string | null> {
  const url = new URL(request.url);
  const product = findProduct(productIdFromPath(url.pathname));
  if (!product) return null;
  try {
    const data = await resolveProduct(product, url.searchParams);
    return JSON.stringify({ product: product.id, data, network: NETWORK });
  } catch {
    return null;
  }
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const paid = await getPaidHandler();
    const response = await paid(request);

    if (response.status !== 200) return response;

    // Guard against an upstream bug in @x402/next 2.20.0: it buffers the body
    // for settlement hooks via `response.clone().arrayBuffer()` and then reuses
    // the *original* stream for the outgoing response. That tee races, and
    // roughly one request in four is delivered with an empty body — after the
    // payment has already settled, so the buyer is charged and gets nothing.
    //
    // Read the body once here. If it survived, pass it through unchanged. If it
    // was drained, regenerate it: the buyer paid, so they are owed the data.
    //
    // Reading can also throw outright with "Body is unusable: Body has already
    // been read", since on some paths upstream consumes the original rather than
    // the clone. Both outcomes mean the same thing — no body to forward — so
    // treat a throw exactly like an empty body.
    let body: string | null = null;
    try {
      body = await response.text();
    } catch {
      body = null;
    }

    const headers = new Headers(response.headers);
    // Length is recomputed by the runtime; a stale value would truncate.
    headers.delete("content-length");

    if (body !== null && body.length > 0) {
      return new NextResponse(body, { status: 200, headers });
    }

    const rebuilt = await regenerate(request);
    if (rebuilt) {
      headers.set("x-hbar402-body-recovered", "1");
      return new NextResponse(rebuilt, { status: 200, headers });
    }

    // Could not rebuild. Say so explicitly rather than returning a silent empty
    // 200 — the PAYMENT-RESPONSE header is still attached, so the buyer retains
    // proof of payment and can claim.
    return new NextResponse(
      JSON.stringify({
        error: "response_lost_after_settlement",
        message:
          "Payment settled but the response body was lost and could not be regenerated. The PAYMENT-RESPONSE header on this response is your proof of payment.",
      }),
      { status: 500, headers },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
};
