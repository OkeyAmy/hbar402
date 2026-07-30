/**
 * Creates the hbar402 credits token — an HTS fungible token that splits its own
 * revenue at the protocol level.
 *
 *   pnpm hts:credits
 *
 * Why this exists
 * ---------------
 * The usual way to share revenue from payments is a contract: money lands in a
 * splitter, stakeholders call `claim()`, and you carry the gas, the reentrancy
 * surface and the claim UX forever.
 *
 * On Hedera the ledger itself can do it. An HTS token can carry `fractionalFee`
 * custom fees, so a cut of every transfer is routed to fee collector accounts
 * *inside the same transaction*, enforced by consensus, with no contract at all.
 *
 * The subtle part is making that compatible with x402. The facilitator's
 * verification rules require that the net amount credited to `payTo` equal the
 * quoted price exactly, and that no other party receive a net positive amount of
 * the asset (see specs/schemes/exact/scheme_exact_hedera.md §5). Two things make
 * it work:
 *
 *   1. The fees are EXCLUSIVE (`net_of_transfers` = true), so they are charged
 *      to the sender on top of the transfer rather than skimmed out of it —
 *      `payTo` receives the full quoted price.
 *   2. Custom fees are assessed by the network at execution time. They are not
 *      part of the transaction body the buyer signs, so the facilitator, which
 *      inspects that body, sees a single clean transfer.
 *
 * Net effect: a protocol-level revenue split that is invisible to x402
 * verification and impossible to replicate on Base or Solana.
 */

import {
  AccountCreateTransaction,
  CustomFractionalFee,
  FeeAssessmentMethod,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
} from "@hiero-ledger/sdk";
import { getOperatorClient, operatorAccountId, parseKey } from "../lib/hedera-operator";
import { NETWORK } from "../lib/config";

/** Percentage of every credits transfer routed to each shareholder. */
const SHAREHOLDER_FEE_PCT = 10;

const DECIMALS = 6;
const INITIAL_SUPPLY = 1_000_000 * 10 ** DECIMALS;

type Shareholder = { label: string; accountId: string; privateKey: string };

/**
 * Creates a shareholder account to receive fractional fees.
 *
 * `maxAutomaticTokenAssociations` matters here: fee collectors named at token
 * creation are associated with that token automatically, but giving them slots
 * keeps them usable for anything else we add later.
 */
async function createShareholder(label: string): Promise<Shareholder> {
  const client = getOperatorClient();
  const key = PrivateKey.generateED25519();

  const receipt = await (
    await new AccountCreateTransaction()
      .setKeyWithoutAlias(key.publicKey)
      .setInitialBalance(new Hbar(1))
      .setMaxAutomaticTokenAssociations(-1)
      .setAccountMemo(`hbar402 ${label}`)
      .execute(client)
  ).getReceipt(client);

  const accountId = receipt.accountId;
  if (!accountId) throw new Error(`failed to create ${label}`);

  return {
    label,
    accountId: accountId.toString(),
    privateKey: key.toStringDer(),
  };
}

async function main() {
  const client = getOperatorClient();
  const treasury = operatorAccountId();
  const operatorKey = parseKey(process.env.HEDERA_PRIVATE_KEY!);
  const net = NETWORK.split(":")[1] ?? "testnet";

  if (process.env.HBAR402_CREDITS_TOKEN_ID) {
    console.log(
      `HBAR402_CREDITS_TOKEN_ID already set to ${process.env.HBAR402_CREDITS_TOKEN_ID}`,
    );
    console.log("Unset it first if you really want a new token.");
    return;
  }

  // Reuse shareholders if they were already created, so a retry does not strand
  // more funded accounts. Keys are printed the moment each account exists.
  const shareholders: Shareholder[] = [];
  const reuseA = process.env.HBAR402_SHAREHOLDER_A;
  const reuseAKey = process.env.HBAR402_SHAREHOLDER_A_KEY;
  const reuseB = process.env.HBAR402_SHAREHOLDER_B;
  const reuseBKey = process.env.HBAR402_SHAREHOLDER_B_KEY;

  if (reuseA && reuseAKey && reuseB && reuseBKey) {
    console.log("reusing shareholder accounts from env");
    shareholders.push(
      { label: "shareholder-a", accountId: reuseA, privateKey: reuseAKey },
      { label: "shareholder-b", accountId: reuseB, privateKey: reuseBKey },
    );
  } else {
    console.log("creating shareholder accounts ...");
    for (const label of ["shareholder-a", "shareholder-b"]) {
      const s = await createShareholder(label);
      // Print immediately: if the token creation below fails, these accounts
      // already exist and we must not lose their keys.
      console.log(`  ${s.label}: ${s.accountId}`);
      console.log(`    key: ${s.privateKey}`);
      shareholders.push(s);
    }
  }

  console.log("\ncreating credits token with fractional custom fees ...");
  const customFees = shareholders.map((s) =>
    new CustomFractionalFee()
      .setFeeCollectorAccountId(s.accountId)
      .setNumerator(SHAREHOLDER_FEE_PCT)
      .setDenominator(100)
      // EXCLUSIVE: charged to the sender on top of the transfer, so the
      // recipient still receives the exact quoted amount.
      .setAssessmentMethod(FeeAssessmentMethod.Exclusive),
  );

  // Every fee collector must sign the creation to consent to collecting fees,
  // so the transaction has to be frozen and multi-signed rather than executed
  // straight off the builder. Without this the network rejects it with
  // INVALID_SIGNATURE.
  let tokenCreate = await new TokenCreateTransaction()
    .setTokenName("hbar402 credits")
    .setTokenSymbol("H402")
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(TokenSupplyType.Infinite)
    .setDecimals(DECIMALS)
    .setInitialSupply(INITIAL_SUPPLY)
    .setTreasuryAccountId(treasury)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)
    // Keeping a fee schedule key means the split can be renegotiated later
    // without reissuing the token.
    .setFeeScheduleKey(operatorKey.publicKey)
    .setCustomFees(customFees)
    .setTokenMemo("hbar402 pay-per-query credits — revenue splits on transfer")
    .freezeWith(client);

  tokenCreate = await tokenCreate.sign(operatorKey);
  for (const s of shareholders) {
    tokenCreate = await tokenCreate.sign(parseKey(s.privateKey));
  }

  const receipt = await (await tokenCreate.execute(client)).getReceipt(client);

  const tokenId = receipt.tokenId;
  if (!tokenId) throw new Error("token creation returned no token id");

  console.log(`\ntoken id : ${tokenId.toString()}`);
  console.log(`hashscan : https://hashscan.io/${net}/token/${tokenId.toString()}`);
  console.log(
    `split    : ${shareholders.length} collectors x ${SHAREHOLDER_FEE_PCT}% per transfer, charged to sender`,
  );

  console.log("\nAdd to .env.local:");
  console.log(`  HBAR402_CREDITS_TOKEN_ID=${tokenId.toString()}`);
  shareholders.forEach((s, i) => {
    const suffix = String.fromCharCode(65 + i);
    console.log(`  HBAR402_SHAREHOLDER_${suffix}=${s.accountId}`);
    console.log(`  HBAR402_SHAREHOLDER_${suffix}_KEY=${s.privateKey}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
