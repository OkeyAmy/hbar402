/**
 * End-to-end payment proof.
 *
 * Buys every product in the catalog, once per settlement asset, against a
 * running server. Prints a HashScan link per payment so the on-chain settlement
 * is independently checkable.
 *
 *   pnpm dev            # in one terminal
 *   pnpm spike          # in another
 */

import { PRODUCTS, hbarPrice, usdcPrice } from "../lib/catalog";
import { buy, type AssetPreference } from "../lib/x402-hedera-client";

const BASE = process.env.SPIKE_BASE_URL ?? "http://localhost:3000";

const BUYER_ACCOUNT =
  process.env.DEMO_BUYER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID || "";
const BUYER_KEY =
  process.env.DEMO_BUYER_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY || "";

if (!BUYER_ACCOUNT || !BUYER_KEY) {
  console.error("Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env.local");
  process.exit(1);
}

/** Example params for products that need them. */
const EXAMPLE_PARAMS: Record<string, string> = {
  "token-snapshot": "?tokenId=0.0.429274",
  "whale-watch": "?accountId=0.0.5864587&minHbar=1",
};

type Row = {
  product: string;
  asset: AssetPreference;
  status: number;
  tx: string | null;
  link: string | null;
  note: string;
};

async function main() {
  console.log(`buyer   : ${BUYER_ACCOUNT}`);
  console.log(`server  : ${BASE}`);
  console.log("");

  const rows: Row[] = [];

  for (const product of PRODUCTS) {
    const query = EXAMPLE_PARAMS[product.id] ?? "";
    const url = `${BASE}/api/v1/${product.id}${query}`;

    for (const asset of ["hbar", "usdc"] as AssetPreference[]) {
      const label = `${product.id} / ${asset}`;
      const price = asset === "hbar" ? hbarPrice(product) : usdcPrice(product);
      process.stdout.write(`paying ${label.padEnd(28)} ${price.padEnd(12)} ... `);

      try {
        const result = await buy(url, {
          accountId: BUYER_ACCOUNT,
          privateKey: BUYER_KEY,
          prefer: asset,
        });

        const tx = result.receipt?.transactionId ?? null;
        const ok = result.status === 200 && result.receipt?.success === true;
        console.log(ok ? "OK" : `FAILED (${result.status})`);
        if (!ok && result.error) console.log(`   ${result.error.slice(0, 300)}`);

        rows.push({
          product: product.id,
          asset,
          status: result.status,
          tx,
          link: result.receipt?.hashscan ?? null,
          note: ok ? "settled" : (result.error ?? "no receipt").slice(0, 80),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log("THREW");
        console.log(`   ${message.slice(0, 300)}`);
        rows.push({
          product: product.id,
          asset,
          status: 0,
          tx: null,
          link: null,
          note: message.slice(0, 80),
        });
      }
    }
  }

  console.log("\n--- settlements ---");
  for (const r of rows) {
    const head = `${r.product}/${r.asset}`.padEnd(30);
    console.log(`${head} ${r.link ?? r.note}`);
  }

  const settled = rows.filter((r) => r.tx).length;
  console.log(`\n${settled}/${rows.length} payments settled on chain`);
  if (settled !== rows.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
