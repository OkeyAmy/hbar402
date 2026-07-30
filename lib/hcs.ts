/**
 * Consensus receipt log — the piece x402 itself does not specify.
 *
 * The x402 standard settles a payment and hands the buyer an
 * `PAYMENT-RESPONSE` header. Nothing in the standard produces a *shared*
 * record: buyer and seller each keep their own private log, and a third party
 * has no way to audit what was sold, to whom, or at what price.
 *
 * Hedera Consensus Service closes that gap. Every settled payment is written to
 * a public topic as an ordered, consensus-timestamped, immutable message for a
 * fixed $0.0001 — cheap enough to receipt a $0.0014 query without distorting
 * the unit economics. Anyone can then reconstruct the entire ledger from
 * HashScan or the mirror node without trusting this server at all.
 *
 * That is the difference between claiming revenue and proving it.
 */

import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { getOperatorClient, operatorAccountId, parseKey } from "./hedera-operator";
import { MIRROR_URL, NETWORK } from "./config";

/** Receipt schema version, so consumers can evolve with us. */
export const RECEIPT_VERSION = 1;

export type Receipt = {
  v: number;
  /** Product id, e.g. "network-pulse". */
  product: string;
  /** Settlement asset: "0.0.0" for HBAR, otherwise an HTS token id. */
  asset: string;
  /** Price paid, in atomic units of `asset`. */
  amount: string;
  payer: string;
  payTo: string;
  /** Hedera transaction id of the settlement transfer. */
  tx: string;
  network: string;
  /** Server-side timestamp; the authoritative time is the HCS consensus stamp. */
  ts: string;
};

export function topicId(): string | null {
  return process.env.HCS_RECEIPT_TOPIC_ID || null;
}

/**
 * Creates the receipt topic.
 *
 * The submit key is set to the operator key so only this service can append
 * receipts — that is what makes a receipt evidence rather than a claim. Reads
 * stay fully public regardless.
 */
export async function createReceiptTopic(memo: string): Promise<string> {
  const client = getOperatorClient();
  const key = parseKey(process.env.HEDERA_PRIVATE_KEY!);

  const receipt = await (
    await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(key.publicKey)
      .setSubmitKey(key.publicKey)
      .execute(client)
  ).getReceipt(client);

  const created = receipt.topicId;
  if (!created) throw new Error("topic creation returned no topic id");
  return created.toString();
}

/**
 * Appends a receipt to the topic.
 *
 * Deliberately does not wait for consensus: `execute` returns once a node has
 * accepted the transaction, which keeps the added latency on a paid request in
 * the low hundreds of milliseconds. Consensus follows within a few seconds and
 * the mirror node surfaces it. Failures are swallowed — a receipt problem must
 * never cost a buyer the data they already paid for.
 */
export async function submitReceipt(receipt: Receipt): Promise<string | null> {
  const topic = topicId();
  if (!topic) return null;

  try {
    const client = getOperatorClient();
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topic)
      .setMessage(JSON.stringify(receipt))
      .execute(client);
    return response.transactionId.toString();
  } catch (err) {
    console.error(
      "[hcs] receipt submit failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export type ConsensusReceipt = Receipt & {
  /** Sequence number assigned by consensus — gapless and ordered. */
  sequenceNumber: number;
  /** Consensus timestamp, the authoritative time for this receipt. */
  consensusAt: string;
  /** Link to the message on HashScan. */
  hashscan: string;
};

type MirrorTopicMessage = {
  consensus_timestamp: string;
  message: string;
  sequence_number: number;
};

/**
 * Reads receipts back from the mirror node.
 *
 * Note this deliberately does not read from any local cache or database: the
 * ledger the site displays is reconstructed from consensus, so what a visitor
 * sees is exactly what an independent auditor would see.
 */
export async function readReceipts(limit = 50): Promise<ConsensusReceipt[]> {
  const topic = topicId();
  if (!topic) return [];

  const net = NETWORK.split(":")[1] ?? "testnet";
  const url = `${MIRROR_URL}/api/v1/topics/${topic}/messages?order=desc&limit=${limit}`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 3 },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { messages?: MirrorTopicMessage[] };

  return (body.messages ?? [])
    .map((m): ConsensusReceipt | null => {
      try {
        const decoded = JSON.parse(
          Buffer.from(m.message, "base64").toString("utf8"),
        ) as Receipt;
        const seconds = Number(m.consensus_timestamp.split(".")[0]);
        return {
          ...decoded,
          sequenceNumber: m.sequence_number,
          consensusAt: new Date(seconds * 1000).toISOString(),
          hashscan: `https://hashscan.io/${net}/topic/${topic}?mid=${m.sequence_number}`,
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is ConsensusReceipt => r !== null);
}

/** HashScan link for the topic itself. */
export function topicHashscan(): string | null {
  const topic = topicId();
  if (!topic) return null;
  const net = NETWORK.split(":")[1] ?? "testnet";
  return `https://hashscan.io/${net}/topic/${topic}`;
}
