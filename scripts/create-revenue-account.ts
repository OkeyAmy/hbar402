/**
 * Creates the revenue account that receives x402 payments.
 *
 *   pnpm account:revenue
 *
 * Why this is separate from the treasury
 * -------------------------------------
 * Hedera exempts a token's treasury from that token's own custom fees. Since the
 * credits token pays shareholders through fractional fees, routing payments to
 * the treasury silently disables the split — the transfer succeeds, the seller is
 * paid, and the shareholders get nothing. Verified on testnet: a credits transfer
 * into the treasury assessed zero fees, while the same transfer into a neutral
 * account assessed the full 10% to each collector.
 *
 * So the roles are deliberately split:
 *
 *   treasury account  issues credits, holds unsold supply
 *   revenue account   receives every x402 payment (payTo), not exempt from fees
 */

import { AccountCreateTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { getOperatorClient } from "../lib/hedera-operator";
import { NETWORK } from "../lib/config";

async function main() {
  if (process.env.HBAR402_REVENUE_ACCOUNT_ID) {
    console.log(
      `HBAR402_REVENUE_ACCOUNT_ID already set to ${process.env.HBAR402_REVENUE_ACCOUNT_ID}`,
    );
    return;
  }

  const client = getOperatorClient();
  const key = PrivateKey.generateED25519();

  const receipt = await (
    await new AccountCreateTransaction()
      .setKeyWithoutAlias(key.publicKey)
      .setInitialBalance(new Hbar(5))
      // Unlimited auto-association so USDC and credits land without a separate
      // TokenAssociateTransaction for each.
      .setMaxAutomaticTokenAssociations(-1)
      .setAccountMemo("hbar402 revenue — x402 payTo")
      .execute(client)
  ).getReceipt(client);

  const accountId = receipt.accountId;
  if (!accountId) throw new Error("account creation returned no account id");

  const net = NETWORK.split(":")[1] ?? "testnet";
  console.log(`revenue account : ${accountId.toString()}`);
  console.log(`hashscan        : https://hashscan.io/${net}/account/${accountId.toString()}`);
  console.log("\nAdd to .env.local (and point PAY_TO_ACCOUNT at it):");
  console.log(`  HBAR402_REVENUE_ACCOUNT_ID=${accountId.toString()}`);
  console.log(`  HBAR402_REVENUE_PRIVATE_KEY=${key.toStringDer()}`);
  console.log(`  PAY_TO_ACCOUNT=${accountId.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
