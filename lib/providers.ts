/**
 * Data providers behind the paid endpoints.
 *
 * These are real sources, not fixtures: CoinGecko for spot, and the Hedera
 * mirror node for everything network-native. A buyer who pays should get data
 * they could not have trivially made up, otherwise the payment is theatre.
 */

import { TINYBARS_PER_HBAR } from "./config";
import {
  consensusToIso,
  getAccountTransactions,
  getNetworkSupply,
  getRecentTransactions,
  getToken,
  getTokenBalances,
  toHashscanTxId,
} from "./mirror";
import type { Product } from "./catalog";

export type ProductResult = Record<string, unknown>;

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true";

type CoinGeckoResponse = {
  "hedera-hashgraph"?: {
    usd?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
    usd_24h_change?: number;
  };
};

async function hbarSpot(): Promise<ProductResult> {
  const res = await fetch(COINGECKO_URL, {
    headers: { accept: "application/json" },
    next: { revalidate: 20 },
  });
  if (!res.ok) throw new Error(`spot upstream ${res.status}`);
  const json = (await res.json()) as CoinGeckoResponse;
  const q = json["hedera-hashgraph"];
  if (!q || typeof q.usd !== "number") throw new Error("spot upstream malformed");

  return {
    symbol: "HBAR",
    usd: q.usd,
    change24hPct: q.usd_24h_change ?? null,
    vol24hUsd: q.usd_24h_vol ?? null,
    marketCapUsd: q.usd_market_cap ?? null,
    asOf: new Date().toISOString(),
    source: "coingecko",
  };
}

/**
 * Observed throughput, derived rather than quoted: take the newest N consensus
 * transactions and divide the count by the wall-clock span they cover. That is
 * a real measurement of what the network just did.
 */
async function networkPulse(): Promise<ProductResult> {
  const [{ transactions }, supply] = await Promise.all([
    getRecentTransactions(100),
    getNetworkSupply(),
  ]);

  if (transactions.length < 2) throw new Error("insufficient transaction sample");

  const stamps = transactions
    .map((t) => Number(t.consensus_timestamp))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const windowSeconds = stamps[stamps.length - 1] - stamps[0];
  const observedTps =
    windowSeconds > 0 ? Number((stamps.length / windowSeconds).toFixed(2)) : null;

  const successCount = transactions.filter((t) => t.result === "SUCCESS").length;
  const avgFeeTinybars = Math.round(
    transactions.reduce((sum, t) => sum + (t.charged_tx_fee ?? 0), 0) /
      transactions.length,
  );

  return {
    observedTps,
    windowSeconds: Number(windowSeconds.toFixed(3)),
    sampleSize: stamps.length,
    successRatePct: Number(((successCount / transactions.length) * 100).toFixed(1)),
    avgFeeTinybars,
    avgFeeHbar: avgFeeTinybars / TINYBARS_PER_HBAR,
    releasedHbar: Number(supply.released_supply) / TINYBARS_PER_HBAR,
    totalHbar: Number(supply.total_supply) / TINYBARS_PER_HBAR,
    asOf: new Date().toISOString(),
    source: "hedera-mirror-node",
  };
}

async function tokenSnapshot(params: URLSearchParams): Promise<ProductResult> {
  const tokenId = params.get("tokenId")!;
  const [token, balances] = await Promise.all([
    getToken(tokenId),
    getTokenBalances(tokenId, 10),
  ]);

  const decimals = Number(token.decimals);
  const scale = 10 ** decimals;

  return {
    tokenId: token.token_id,
    name: token.name,
    symbol: token.symbol,
    type: token.type,
    decimals,
    totalSupply: Number(token.total_supply) / scale,
    maxSupply: token.max_supply === "0" ? null : Number(token.max_supply) / scale,
    treasury: token.treasury_account_id,
    freezeDefault: token.freeze_default,
    pauseStatus: token.pause_status,
    topHolders: balances.balances.map((b) => ({
      account: b.account,
      balance: b.balance / scale,
    })),
    asOf: new Date().toISOString(),
    source: "hedera-mirror-node",
  };
}

async function whaleWatch(params: URLSearchParams): Promise<ProductResult> {
  const accountId = params.get("accountId")!;
  const minHbar = Number(params.get("minHbar") ?? "100");
  if (!Number.isFinite(minHbar) || minHbar < 0) {
    throw new Error("minHbar must be a non-negative number");
  }
  const minTinybars = minHbar * TINYBARS_PER_HBAR;

  const { transactions } = await getAccountTransactions(accountId, 50);

  const movements = transactions
    .map((tx) => {
      const mine = (tx.transfers ?? []).find((t) => t.account === accountId);
      if (!mine) return null;
      if (Math.abs(mine.amount) < minTinybars) return null;

      // The counterparty is whichever side moved the opposite direction most.
      const counterparty = (tx.transfers ?? [])
        .filter((t) => t.account !== accountId)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];

      return {
        transactionId: tx.transaction_id,
        direction: mine.amount > 0 ? "in" : "out",
        hbar: mine.amount / TINYBARS_PER_HBAR,
        counterparty: counterparty?.account ?? null,
        result: tx.result,
        consensusAt: consensusToIso(tx.consensus_timestamp),
        hashscan: `https://hashscan.io/testnet/transaction/${toHashscanTxId(tx.transaction_id)}`,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => Math.abs(b.hbar) - Math.abs(a.hbar));

  return {
    accountId,
    minHbar,
    scanned: transactions.length,
    matched: movements.length,
    movements,
    asOf: new Date().toISOString(),
    source: "hedera-mirror-node",
  };
}

/** Dispatches a paid request to its provider. */
export async function resolveProduct(
  product: Product,
  params: URLSearchParams,
): Promise<ProductResult> {
  switch (product.id) {
    case "hbar-spot":
      return hbarSpot();
    case "network-pulse":
      return networkPulse();
    case "token-snapshot":
      return tokenSnapshot(params);
    case "whale-watch":
      return whaleWatch(params);
    default:
      throw new Error(`no provider for product ${product.id}`);
  }
}
