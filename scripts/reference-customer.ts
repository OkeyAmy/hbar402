/**
 * Reference customer — an autonomous agent that buys its own data feed.
 *
 *   pnpm customer            # one pass over the catalog
 *   pnpm customer --loop 60  # buy every 60s until stopped
 *
 * This exists for two reasons.
 *
 * First, it is the honest demonstration of the thesis: software paying software,
 * per call, with no human in the loop and no subscription. The agent decides what
 * it needs, pays for exactly that, and books the cost. Nothing here is mocked —
 * every iteration moves real value on Hedera testnet and leaves a consensus
 * receipt behind.
 *
 * Second, it is the cost-accounting argument for per-use pricing. The agent
 * tracks what it has spent and what a flat subscription would have cost over the
 * same period, which is the whole reason micropayments matter: at $0.0001 fixed
 * fees, paying per read is cheaper than any plan you could have bought.
 */

import { PRODUCTS, findProduct } from "../lib/catalog";
import { buy, type AssetPreference } from "../lib/x402-hedera-client";
import { assetLabel, assetAmount, fmt } from "../lib/stats";

const BASE = process.env.HBAR402_BASE_URL ?? "http://localhost:3001";

/**
 * What the agent actually wants, and how it pays for each.
 *
 * The asset choice is deliberate rather than random: cheap high-frequency reads
 * go in HBAR because it has the lowest per-transfer cost and needs no token
 * association, while the pricier analytical calls go in credits so shareholders
 * get paid on them.
 */
const WATCHLIST: {
  product: string;
  params: Record<string, string>;
  asset: AssetPreference;
  why: string;
}[] = [
  {
    product: "hbar-spot",
    params: {},
    asset: "hbar",
    why: "mark the book to market",
  },
  {
    product: "network-pulse",
    params: {},
    asset: "hbar",
    why: "detect congestion before sizing the next order",
  },
  {
    product: "token-snapshot",
    params: { tokenId: "0.0.429274" },
    asset: "credits",
    why: "track USDC supply on Hedera",
  },
  {
    product: "whale-watch",
    params: { accountId: "0.0.5864587", minHbar: "1" },
    asset: "credits",
    why: "react to treasury movement",
  },
];

type Spend = { asset: string; amount: number };

const spend: Spend[] = [];
let calls = 0;
let failures = 0;

function buildUrl(product: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `${BASE}/api/v1/${product}${query ? `?${query}` : ""}`;
}

async function tick(accountId: string, privateKey: string): Promise<void> {
  for (const item of WATCHLIST) {
    const product = findProduct(item.product);
    if (!product) continue;

    const url = buildUrl(item.product, item.params);
    process.stdout.write(`  ${item.product.padEnd(16)} ${item.asset.padEnd(8)} `);

    try {
      const result = await buy(url, { accountId, privateKey, prefer: item.asset });

      if (result.status !== 200 || !result.receipt?.success) {
        failures += 1;
        console.log(`skip (${result.status}) ${(result.error ?? "").slice(0, 160)}`);
        continue;
      }

      calls += 1;
      const atomic =
        item.asset === "hbar"
          ? product.priceTinybars
          : item.asset === "credits"
            ? product.priceCreditsAtomic
            : product.priceUsdcAtomic;
      const assetId =
        item.asset === "hbar" ? "0.0.0" : item.asset === "credits" ? "credits" : "usdc";
      spend.push({ asset: assetId, amount: atomic });

      console.log(`ok  ${result.receipt.transactionId}`);
    } catch (err) {
      failures += 1;
      console.log(`error ${err instanceof Error ? err.message : err}`);
    }
  }
}

function report(): void {
  const hbarSpent =
    spend.filter((s) => s.asset === "0.0.0").reduce((a, b) => a + b.amount, 0) / 1e8;
  const creditsSpent =
    spend.filter((s) => s.asset === "credits").reduce((a, b) => a + b.amount, 0) / 1e6;
  const usdcSpent =
    spend.filter((s) => s.asset === "usdc").reduce((a, b) => a + b.amount, 0) / 1e6;

  console.log(`\n  calls ${calls}  failures ${failures}`);
  console.log(
    `  spent ${fmt(hbarSpent, 6)} HBAR · ${fmt(creditsSpent, 6)} H402 · ${fmt(usdcSpent, 6)} USDC`,
  );
}

async function main() {
  const accountId =
    process.env.DEMO_BUYER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;
  const privateKey =
    process.env.DEMO_BUYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    console.error("set DEMO_BUYER_ACCOUNT_ID and DEMO_BUYER_PRIVATE_KEY");
    process.exit(1);
  }

  const loopIndex = process.argv.indexOf("--loop");
  const intervalSeconds =
    loopIndex >= 0 ? Number(process.argv[loopIndex + 1] ?? "60") : null;

  console.log(`reference customer ${accountId}`);
  console.log(`server             ${BASE}`);
  console.log(
    `watchlist          ${WATCHLIST.length} products, ${PRODUCTS.length} available\n`,
  );

  if (intervalSeconds === null) {
    await tick(accountId, privateKey);
    report();
    return;
  }

  console.log(`looping every ${intervalSeconds}s — ctrl-c to stop\n`);
  // Report on exit so an operator watching the loop still gets the totals.
  process.on("SIGINT", () => {
    report();
    process.exit(0);
  });

  for (;;) {
    console.log(`--- ${new Date().toISOString()} ---`);
    await tick(accountId, privateKey);
    report();
    console.log("");
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
