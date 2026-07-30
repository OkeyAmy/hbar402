/**
 * Hedera mirror node REST client.
 *
 * The mirror node is free, keyless, and authoritative for everything that has
 * reached consensus. We lean on it for two distinct jobs:
 *
 *  1. as the *data source* behind the paid products, and
 *  2. as the *payment ledger* — instead of running a database, the public
 *     ledger page reads transfers into the payTo account straight off chain,
 *     which means every row we display is independently verifiable.
 */

import { MIRROR_URL } from "./config";

async function mirrorGet<T>(path: string, revalidate = 5): Promise<T> {
  const url = path.startsWith("http") ? path : `${MIRROR_URL}${path}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`mirror node ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export type MirrorTransfer = { account: string; amount: number };

export type MirrorTokenTransfer = {
  token_id: string;
  account: string;
  amount: number;
};

export type MirrorTransaction = {
  transaction_id: string;
  consensus_timestamp: string;
  name: string;
  result: string;
  charged_tx_fee: number;
  memo_base64?: string | null;
  transfers?: MirrorTransfer[];
  token_transfers?: MirrorTokenTransfer[];
};

export type MirrorAccount = {
  account: string;
  evm_address: string | null;
  key: { _type: string; key: string } | null;
  max_automatic_token_associations: number;
  balance: {
    balance: number;
    timestamp: string;
    tokens: { token_id: string; balance: number }[];
  } | null;
};

export type MirrorToken = {
  token_id: string;
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  max_supply: string;
  treasury_account_id: string;
  type: string;
  freeze_default: boolean;
  pause_status: string;
};

export type MirrorTokenBalance = { account: string; balance: number };

export type MirrorSupply = {
  /** Mirror node names this `released_supply`, not `circulating_supply`. */
  released_supply: string;
  total_supply: string;
  timestamp: string;
};

export function getAccount(accountId: string): Promise<MirrorAccount> {
  return mirrorGet<MirrorAccount>(`/api/v1/accounts/${accountId}`, 5);
}

export function getToken(tokenId: string): Promise<MirrorToken> {
  return mirrorGet<MirrorToken>(`/api/v1/tokens/${tokenId}`, 30);
}

export function getTokenBalances(
  tokenId: string,
  limit = 10,
): Promise<{ balances: MirrorTokenBalance[] }> {
  return mirrorGet<{ balances: MirrorTokenBalance[] }>(
    `/api/v1/tokens/${tokenId}/balances?order=desc&limit=${limit}`,
    30,
  );
}

export function getNetworkSupply(): Promise<MirrorSupply> {
  return mirrorGet<MirrorSupply>(`/api/v1/network/supply`, 30);
}

export function getRecentTransactions(
  limit = 100,
): Promise<{ transactions: MirrorTransaction[] }> {
  return mirrorGet<{ transactions: MirrorTransaction[] }>(
    `/api/v1/transactions?order=desc&limit=${limit}`,
    2,
  );
}

/**
 * Transactions touching an account, newest first. `transactiontype=CRYPTOTRANSFER`
 * keeps the payload to value movement rather than every contract call.
 */
export function getAccountTransactions(
  accountId: string,
  limit = 50,
): Promise<{ transactions: MirrorTransaction[] }> {
  return mirrorGet<{ transactions: MirrorTransaction[] }>(
    `/api/v1/transactions?account.id=${accountId}&transactiontype=CRYPTOTRANSFER&order=desc&limit=${limit}`,
    5,
  );
}

/** Converts a mirror node consensus timestamp ("173...123456789") to an ISO string. */
export function consensusToIso(consensusTimestamp: string): string {
  const seconds = Number(consensusTimestamp.split(".")[0]);
  return new Date(seconds * 1000).toISOString();
}

/**
 * HashScan wants transaction ids in `0.0.x-secs-nanos` form, while the mirror
 * node returns `0.0.x@secs.nanos`. Normalize so links actually resolve.
 */
export function toHashscanTxId(transactionId: string): string {
  return transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
}
