/**
 * Product catalog.
 *
 * Each product is a real data endpoint priced in all three settlement assets.
 * The route advertises every option in a single 402 and the buyer picks whichever
 * it holds:
 *
 *   HBAR   cheapest possible per-call cost, no token association needed
 *   USDC   stable unit of account, Circle-issued HTS token
 *   H402   publisher credits, which also pay shareholders on transfer
 *
 * Amounts are atomic: tinybars for HBAR (1 HBAR = 1e8 tinybars), and 6-decimal
 * base units for USDC and credits.
 */

export type ParamSpec = {
  name: string;
  required: boolean;
  description: string;
  example: string;
};

export type Product = {
  id: string;
  title: string;
  description: string;
  /** Price in tinybars when settling in HBAR. */
  priceTinybars: number;
  /** Price in USDC base units (6 decimals) when settling in USDC. */
  priceUsdcAtomic: number;
  /**
   * Price in credits base units (6 decimals) when settling in H402.
   * Priced at parity with USDC; the difference is that a credits transfer also
   * pays shareholders at the protocol level via the token's fractional fees.
   */
  priceCreditsAtomic: number;
  params: ParamSpec[];
  /** What the buyer gets back, for the docs page. */
  returns: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "hbar-spot",
    title: "HBAR spot",
    description:
      "Live HBAR/USD spot price with 24h change and volume. The cheapest product in the catalog — priced so an agent polling every minute spends under a cent an hour.",
    priceTinybars: 1_000_000, // 0.01 HBAR
    priceUsdcAtomic: 1_000, // $0.001
    priceCreditsAtomic: 1_000, // $0.001 in credits
    params: [],
    returns: "usd, change24hPct, vol24hUsd, marketCapUsd, asOf",
  },
  {
    id: "network-pulse",
    title: "Network pulse",
    description:
      "Live Hedera network throughput measured off the mirror node: observed TPS over the most recent transaction window, plus HBAR supply figures.",
    priceTinybars: 2_000_000, // 0.02 HBAR
    priceUsdcAtomic: 2_000, // $0.002
    priceCreditsAtomic: 2_000, // $0.002 in credits
    params: [],
    returns: "observedTps, windowSeconds, sampleSize, circulatingHbar, totalHbar, asOf",
  },
  {
    id: "token-snapshot",
    title: "Token snapshot",
    description:
      "Supply and distribution snapshot for any HTS token: total and max supply, decimals, treasury, freeze/kyc posture, and the top holders by balance.",
    priceTinybars: 3_000_000, // 0.03 HBAR
    priceUsdcAtomic: 3_000, // $0.003
    priceCreditsAtomic: 3_000, // $0.003 in credits
    params: [
      {
        name: "tokenId",
        required: true,
        description: "HTS token id to inspect",
        example: "0.0.429274",
      },
    ],
    returns: "tokenId, name, symbol, decimals, totalSupply, maxSupply, treasury, topHolders[]",
  },
  {
    id: "whale-watch",
    title: "Whale watch",
    description:
      "Recent large transfers touching an account, ranked by absolute size. Useful for agents that need to react to treasury movements without running their own indexer.",
    priceTinybars: 5_000_000, // 0.05 HBAR
    priceUsdcAtomic: 5_000, // $0.005
    priceCreditsAtomic: 5_000, // $0.005 in credits
    params: [
      {
        name: "accountId",
        required: true,
        description: "Hedera account id to watch",
        example: "0.0.5864587",
      },
      {
        name: "minHbar",
        required: false,
        description: "Minimum absolute HBAR movement to report (default 100)",
        example: "100",
      },
    ],
    returns: "accountId, minHbar, movements[] { transactionId, hbar, counterparty, consensusAt, hashscan }",
  },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Extracts the product id from an /api/v1/<product> style path. */
export function productIdFromPath(path: string): string {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

/** Human-readable HBAR price, for docs and the catalog UI. */
export function hbarPrice(p: Product): string {
  return `${p.priceTinybars / 100_000_000} HBAR`;
}

/** Human-readable USDC price, for docs and the catalog UI. */
export function usdcPrice(p: Product): string {
  return `$${(p.priceUsdcAtomic / 1_000_000).toFixed(6).replace(/0+$/, "")}`;
}

/** Human-readable credits price. */
export function creditsPrice(p: Product): string {
  return `${p.priceCreditsAtomic / 1_000_000} H402`;
}

/** Validates query params against the product spec. Returns an error message or null. */
export function validateParams(
  product: Product,
  params: URLSearchParams,
): string | null {
  for (const spec of product.params) {
    if (spec.required && !params.get(spec.name)) {
      return `Missing required parameter: ${spec.name}`;
    }
  }
  return null;
}
