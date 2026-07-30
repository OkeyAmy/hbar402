/**
 * Sends credits from the treasury to a buyer so it can pay in H402.
 *
 *   pnpm credits:fund                 # funds DEMO_BUYER_ACCOUNT_ID with 100
 *   pnpm credits:fund 0.0.1234 250    # funds an arbitrary account
 *
 * Worth watching the balances after this runs: the transfer itself is subject to
 * the token's fractional fees, so the shareholder accounts get paid by this very
 * transaction. That is the point — the split is a property of the token, not of
 * any particular payment flow.
 */

import { TransferTransaction } from "@hiero-ledger/sdk";
import { getOperatorClient, operatorAccountId } from "../lib/hedera-operator";
import { CREDITS_ASSET, CREDITS_DECIMALS, NETWORK } from "../lib/config";

async function balanceOf(accountId: string, tokenId: string): Promise<number> {
  const url = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return 0;
  const body = (await res.json()) as { tokens?: { balance: number }[] };
  return body.tokens?.[0]?.balance ?? 0;
}

async function main() {
  if (!CREDITS_ASSET) {
    console.error("HBAR402_CREDITS_TOKEN_ID is not set — run `pnpm hts:credits` first");
    process.exit(1);
  }

  const target = process.argv[2] || process.env.DEMO_BUYER_ACCOUNT_ID;
  const whole = Number(process.argv[3] ?? "100");
  if (!target) {
    console.error("no target account: pass one or set DEMO_BUYER_ACCOUNT_ID");
    process.exit(1);
  }

  const scale = 10 ** CREDITS_DECIMALS;
  const amount = Math.round(whole * scale);
  const treasury = operatorAccountId();
  const client = getOperatorClient();

  const shareholders = [
    process.env.HBAR402_SHAREHOLDER_A,
    process.env.HBAR402_SHAREHOLDER_B,
  ].filter((s): s is string => Boolean(s));

  console.log(`token    : ${CREDITS_ASSET}`);
  console.log(`sending  : ${whole} credits  ${treasury} -> ${target}\n`);

  const before = await Promise.all(
    shareholders.map((s) => balanceOf(s, CREDITS_ASSET)),
  );

  const response = await new TransferTransaction()
    .addTokenTransfer(CREDITS_ASSET, treasury, -amount)
    .addTokenTransfer(CREDITS_ASSET, target, amount)
    .execute(client);
  await response.getReceipt(client);

  const txId = response.transactionId.toString();
  const net = NETWORK.split(":")[1] ?? "testnet";
  console.log(`tx       : ${txId}`);
  console.log(
    `hashscan : https://hashscan.io/${net}/transaction/${txId.replace("@", "-").replace(/\.(\d+)$/, "-$1")}`,
  );

  // Give the mirror node a moment to catch up before reading balances back.
  await new Promise((r) => setTimeout(r, 6000));

  const targetBalance = await balanceOf(target, CREDITS_ASSET);
  console.log(`\nbuyer balance: ${targetBalance / scale} credits`);

  const after = await Promise.all(
    shareholders.map((s) => balanceOf(s, CREDITS_ASSET)),
  );
  console.log("shareholder fees collected by this transfer:");
  shareholders.forEach((s, i) => {
    console.log(`  ${s}: +${(after[i] - before[i]) / scale} credits`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
