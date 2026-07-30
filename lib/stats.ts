/**
 * Business metrics, derived entirely from consensus.
 *
 * There is no database here on purpose. Revenue, call counts and asset mix are
 * all reconstructed from the HCS receipt topic, which means the numbers the site
 * displays are the same numbers an independent auditor would compute from
 * HashScan. If this server lies, the receipts contradict it.
 */

import { readReceipts, type ConsensusReceipt } from "./hcs";
import {
  CREDITS_ASSET,
  CREDITS_DECIMALS,
  HBAR_ASSET,
  TINYBARS_PER_HBAR,
  USDC_ASSET,
  USDC_DECIMALS,
} from "./config";

export type AssetTotals = {
  hbar: number;
  usdc: number;
  credits: number;
};

export type Stats = {
  totalCalls: number;
  revenue: AssetTotals;
  callsByAsset: AssetTotals;
  callsByProduct: Record<string, number>;
  uniqueBuyers: number;
  latest: ConsensusReceipt[];
  /** True when a receipt topic is configured and reachable. */
  live: boolean;
};

/** Human label for a settlement asset id. */
export function assetLabel(asset: string): string {
  if (asset === HBAR_ASSET) return "HBAR";
  if (asset === USDC_ASSET) return "USDC";
  if (CREDITS_ASSET && asset === CREDITS_ASSET) return "H402";
  return asset;
}

/** Converts an atomic amount to a display number for its asset. */
export function assetAmount(asset: string, amount: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  if (asset === HBAR_ASSET) return value / TINYBARS_PER_HBAR;
  if (CREDITS_ASSET && asset === CREDITS_ASSET) return value / 10 ** CREDITS_DECIMALS;
  return value / 10 ** USDC_DECIMALS;
}

export async function getStats(limit = 100): Promise<Stats> {
  const latest = await readReceipts(limit);

  const revenue: AssetTotals = { hbar: 0, usdc: 0, credits: 0 };
  const callsByAsset: AssetTotals = { hbar: 0, usdc: 0, credits: 0 };
  const callsByProduct: Record<string, number> = {};
  const buyers = new Set<string>();

  for (const r of latest) {
    const label = assetLabel(r.asset);
    const value = assetAmount(r.asset, r.amount);

    if (label === "HBAR") {
      revenue.hbar += value;
      callsByAsset.hbar += 1;
    } else if (label === "USDC") {
      revenue.usdc += value;
      callsByAsset.usdc += 1;
    } else {
      revenue.credits += value;
      callsByAsset.credits += 1;
    }

    callsByProduct[r.product] = (callsByProduct[r.product] ?? 0) + 1;
    if (r.payer && r.payer !== "unknown") buyers.add(r.payer);
  }

  return {
    totalCalls: latest.length,
    revenue,
    callsByAsset,
    callsByProduct,
    uniqueBuyers: buyers.size,
    latest,
    live: latest.length > 0,
  };
}

/** Formats an amount for display, trimming trailing zeros without losing precision. */
export function fmt(value: number, maxDecimals = 6): string {
  if (value === 0) return "0";
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "");
}

/** Relative age string, e.g. "12s ago". */
export function relativeAge(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}
