/**
 * Buyer CLI. This is the "any agent can use this" entry point.
 *
 *   pnpm buy hbar-spot
 *   pnpm buy token-snapshot --tokenId 0.0.429274
 *   pnpm buy whale-watch --accountId 0.0.5864587 --minHbar 1 --asset usdc
 */

import {
  PRODUCTS,
  findProduct,
  creditsPrice,
  hbarPrice,
  usdcPrice,
} from "../lib/catalog";
import { buy, type AssetPreference } from "../lib/x402-hedera-client";

const BASE = process.env.HBAR402_BASE_URL ?? "http://localhost:3001";

function parseArgs(argv: string[]) {
  const [productId, ...rest] = argv;
  const params = new URLSearchParams();
  let asset: AssetPreference = "hbar";

  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    const value = rest[i + 1];
    if (!key || value === undefined) continue;
    if (key === "asset") {
      asset = value as AssetPreference;
      continue;
    }
    params.set(key, value);
  }

  return { productId, params, asset };
}

async function main() {
  const { productId, params, asset } = parseArgs(process.argv.slice(2));

  if (!productId) {
    console.log(
      "usage: pnpm buy <product> [--param value ...] [--asset hbar|usdc|credits]\n",
    );
    console.log("products:");
    for (const p of PRODUCTS) {
      console.log(
        `  ${p.id.padEnd(16)} ${hbarPrice(p).padEnd(11)} / ${usdcPrice(p).padEnd(9)} / ${creditsPrice(p).padEnd(12)} ${p.title}`,
      );
      for (const spec of p.params) {
        const flag = `--${spec.name}`;
        console.log(
          `    ${flag.padEnd(14)} ${spec.required ? "(required)" : "(optional)"} ${spec.description}`,
        );
      }
    }
    process.exit(1);
  }

  const product = findProduct(productId);
  if (!product) {
    console.error(`unknown product: ${productId}`);
    console.error(`available: ${PRODUCTS.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }

  const accountId = process.env.DEMO_BUYER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;
  const privateKey =
    process.env.DEMO_BUYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    console.error("set DEMO_BUYER_ACCOUNT_ID and DEMO_BUYER_PRIVATE_KEY");
    process.exit(1);
  }

  const query = params.toString();
  const url = `${BASE}/api/v1/${product.id}${query ? `?${query}` : ""}`;
  const price =
    asset === "hbar"
      ? hbarPrice(product)
      : asset === "credits"
        ? creditsPrice(product)
        : usdcPrice(product);

  console.log(`GET   ${url}`);
  console.log(`price ${price} (${asset})`);
  console.log(`payer ${accountId}\n`);

  const result = await buy(url, { accountId, privateKey, prefer: asset });

  if (result.status !== 200) {
    console.error(`failed: HTTP ${result.status}`);
    if (result.error) console.error(result.error.slice(0, 600));
    process.exit(1);
  }

  console.log("--- data ---");
  console.log(JSON.stringify(result.data, null, 2));

  if (result.receipt) {
    console.log("\n--- receipt ---");
    console.log(`settled : ${result.receipt.success}`);
    console.log(`payer   : ${result.receipt.payer ?? "-"}`);
    console.log(`tx      : ${result.receipt.transactionId ?? "-"}`);
    console.log(`hashscan: ${result.receipt.hashscan ?? "-"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
