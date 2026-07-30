/**
 * Creates the public HCS receipt topic.
 *
 *   pnpm hcs:topic
 *
 * Then put the printed id in .env.local as HCS_RECEIPT_TOPIC_ID.
 */

import { createReceiptTopic, topicId } from "../lib/hcs";
import { NETWORK } from "../lib/config";

async function main() {
  const existing = topicId();
  if (existing) {
    console.log(`HCS_RECEIPT_TOPIC_ID is already set to ${existing}`);
    console.log("Unset it first if you really want a new topic.");
    return;
  }

  console.log(`creating receipt topic on ${NETWORK} ...`);
  const created = await createReceiptTopic("hbar402 x402 settlement receipts v1");
  const net = NETWORK.split(":")[1] ?? "testnet";

  console.log(`\ntopic id : ${created}`);
  console.log(`hashscan : https://hashscan.io/${net}/topic/${created}`);
  console.log(`\nAdd to .env.local:\n  HCS_RECEIPT_TOPIC_ID=${created}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
