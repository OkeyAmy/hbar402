# hbar402

**Pay-per-query Hedera data with a receipt you don't have to trust the seller for.**

Hedera-native market and network data, sold by the call over the [x402](https://x402.org)
standard. Settles in HBAR, USDC or publisher credits for fractions of a cent — no
account, no API key, no subscription, no minimum spend. Every purchase writes an
immutable receipt to a public Hedera Consensus Service topic, so the entire
business is auditable from HashScan without touching this server.

Built on Hedera testnet for the Hedera x402 bounty.

---

## The idea

x402 solves payment. It does **not** solve receipts.

When an x402 payment settles, the buyer gets a `PAYMENT-RESPONSE` header and the
seller writes a row in its own database. There is no shared record. A third party
cannot audit what was sold, to whom, or at what price — and for machine-to-machine
commerce with no human in the loop, that is precisely the part you need. You cannot
dispute a header, meter against it, or prove usage with it.

Hedera closes that gap with a primitive no other x402 chain has. HCS gives ordered,
consensus-timestamped, immutable messages at a **fixed $0.0001** — cheap enough to
receipt a $0.0014 query without distorting the unit economics.

So every settled payment here produces **two independent on-chain artifacts**:

1. the settlement transfer itself, and
2. an HCS receipt naming the product, price, asset, payer and the settlement
   transaction id.

Neither requires trusting this server. The numbers on the site are recomputed from
the topic on every request — there is no database anywhere in this repo.

## Live on testnet

| | |
| --- | --- |
| Network | `hedera:testnet` |
| Facilitator | `https://x402.org/facilitator` (fee payer `0.0.9185802`) |
| Receipt topic | [`0.0.9840930`](https://hashscan.io/testnet/topic/0.0.9840930) |
| Revenue account (`payTo`) | [`0.0.9841120`](https://hashscan.io/testnet/account/0.0.9841120) |
| Credits token | [`0.0.9840995`](https://hashscan.io/testnet/token/0.0.9840995) |
| Shareholders | [`0.0.9840993`](https://hashscan.io/testnet/account/0.0.9840993) · [`0.0.9840994`](https://hashscan.io/testnet/account/0.0.9840994) |
| USDC | `0.0.429274` |

Example settlements:

- HBAR — [`0.0.9185802-1785400626-453816926`](https://hashscan.io/testnet/transaction/0.0.9185802-1785400626-453816926)
- Credits, with the shareholder split — [`0.0.9185802-1785407010-684908862`](https://hashscan.io/testnet/transaction/0.0.9185802-1785407010-684908862)

## Two things that only work on Hedera

### 1. Receipts on consensus

Every settled payment is appended to a public HCS topic from the `onAfterSettle`
hook, so a receipt can never exist for a payment that did not land. Sequence
numbers are assigned by consensus and gapless — a suppressed sale would show up as
a missing number.

```json
{"v":1,"product":"whale-watch","asset":"0.0.0","amount":"5000000",
 "payer":"0.0.5865529","payTo":"0.0.9841120",
 "tx":"0.0.9185802@1785405923.429549129","network":"hedera:testnet"}
```

The topic's submit key is the operator key, so only this service can append. Reads
are public regardless. That is what makes a receipt evidence rather than a claim.

### 2. Revenue sharing with no contract

The credits token carries HTS **fractional custom fees**. A cut of every transfer
is routed to shareholder accounts by consensus, inside the same transaction — no
splitter contract, no gas, no `claim()` step, no reentrancy surface.

One credits payment, on chain:

```
0.0.5865529   -2400    buyer pays price + fees
0.0.9840993    +200    shareholder A, 10%, automatic
0.0.9840994    +200    shareholder B, 10%, automatic
0.0.9841120   +2000    seller receives exactly the quoted price
```

Making this compatible with x402 took two details:

- The fees are assessed **net of transfers** (`FeeAssessmentMethod.Exclusive`), so
  they are charged to the sender on top rather than skimmed out of the transfer.
  The seller still receives the exact quoted price, which the facilitator requires.
- Custom fees are applied by the network at execution, so they never appear in the
  transaction body the buyer signs. The facilitator inspects that body and sees a
  single clean transfer.

Net effect: a protocol-level revenue split that is invisible to x402 verification
and cannot be replicated on Base or Solana.

**Gotcha worth knowing:** Hedera exempts a token's treasury from that token's own
custom fees. Paying into the treasury *silently disables the split* — the transfer
succeeds, the seller is paid, and shareholders get nothing. Verified both ways on
testnet. That is why `payTo` is a dedicated revenue account and not the treasury.

## Endpoints

Four real endpoints. Data comes from the Hedera mirror node and CoinGecko — nothing
is mocked.

| endpoint | HBAR | USDC | H402 | returns |
| --- | --- | --- | --- | --- |
| `/api/v1/hbar-spot` | 0.01 | $0.001 | 0.001 | HBAR/USD, 24h change, volume, market cap |
| `/api/v1/network-pulse` | 0.02 | $0.002 | 0.002 | observed TPS over the live transaction window, success rate, supply |
| `/api/v1/token-snapshot?tokenId=` | 0.03 | $0.003 | 0.003 | HTS supply, decimals, treasury, freeze posture, top holders |
| `/api/v1/whale-watch?accountId=&minHbar=` | 0.05 | $0.005 | 0.005 | large transfers ranked by size, with counterparties |

A single 402 advertises all three assets and the buyer picks whichever it holds.
Requests that fail validation return 4xx and are **not** settled, so a malformed
call costs nothing.

`network-pulse` and `whale-watch` do work the buyer avoids — aggregating 100
transactions to derive throughput, or scanning and ranking 50 transfers. The mirror
node is public, so what is being sold is the aggregation and the reliability, not
secret data.

## Buying

The buyer pays **no gas**. Under the Hedera exact scheme the facilitator is the fee
payer and submits the transaction, so the buyer is debited exactly the quoted price
and nothing else — verified on chain:

```
0.0.5865529  -1000000 tinybars   buyer, exactly 0.01 HBAR
0.0.9841120  +1000000 tinybars   seller
0.0.9185802   -294984 tinybars   facilitator pays every network fee
```

```ts
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";

const signer = createClientHederaSigner(
  "0.0.1234",
  PrivateKey.fromStringDer(process.env.HEDERA_PRIVATE_KEY!),
  { network: "hedera:testnet" },
);

const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "hedera:testnet", client: new ExactHederaScheme(signer) }],
  paymentRequirementsSelector: (_v, reqs) =>
    reqs.find((r) => r.asset === "0.0.0") ?? reqs[0],
});

const res = await payingFetch("http://localhost:3000/api/v1/network-pulse");
```

`lib/x402-hedera-client.ts` wraps this into a `buy()` helper that also decodes the
receipt. See `/docs` on the running site.

## Running it

```bash
pnpm install
cp .env.example .env.local     # fill in HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY
pnpm dev
```

First-time setup of the on-chain pieces:

```bash
pnpm hcs:topic          # create the public receipt topic
pnpm account:revenue    # create the payTo account (must not be the token treasury)
pnpm hts:credits        # mint the credits token with fractional fees
pnpm credits:fund       # send credits to the demo buyer
```

Then buy something:

```bash
pnpm buy                                            # list the catalog
pnpm buy hbar-spot
pnpm buy token-snapshot --tokenId 0.0.429274 --asset credits
pnpm spike                                          # every product, every asset
pnpm customer --loop 60                             # autonomous buyer, on a loop
```

Get a testnet account at [portal.hedera.com](https://portal.hedera.com/). For USDC
use the [Circle faucet](https://faucet.circle.com/), select **Hedera Testnet**, and
paste your **account id** (`0.0.x`) — not the EVM address.

## Notes for the x402 and Hedera teams

Two issues found while building this, both reproducible on `@x402/next@2.20.0`.

### 1. `withX402` can deliver an empty body after charging the buyer

`withX402` buffers the response body for settlement hooks and then reuses the
original stream for the outgoing response:

```js
responseBody = Buffer.from(await response.clone().arrayBuffer())
// ...
new NextResponse(response.body, { ... })
```

That tee races. Roughly **one request in four** arrived with an empty body *after*
settlement had completed — so the buyer was charged and received nothing. On other
paths the original is consumed instead, and reading it throws
`Body is unusable: Body has already been read`.

This is the worst possible failure mode for a payment library: the money moves and
the goods do not. Suggested fix is to construct the outgoing response from the
already-buffered bytes rather than from the original stream.

Worked around in `app/api/v1/[product]/route.ts`: read the body once, treat a throw
the same as an empty body, and regenerate the payload if it is gone. Regeneration is
safe here because every product is an idempotent read — the buyer paid, so they are
owed the data, and they must not be charged twice for our bug.

### 2. A failed `initialize()` poisons the resource server permanently

`getResourceServer()` naturally memoises a promise, and `initialize()` fetches
supported kinds over the network. When that fetch fails transiently, the rejected
promise stays cached and **every subsequent request fails instantly with the same
stale error** until the process restarts — an outage that never self-heals on a warm
serverless instance.

```
Failed to fetch supported kinds from facilitator: TypeError: fetch failed
GET /api/v1/hbar-spot 500 in 8.0s
GET /api/v1/hbar-spot 500 in 110ms   <- cached failure
```

Worked around in `lib/x402-server.ts` by clearing the memo on rejection and retrying
`initialize()` up to three times. It would be worth doing this inside the library, or
documenting that callers must not cache the promise across failures.

### 3. Smaller things

- The public facilitator's `/verify` intermittently returns a fresh 402 under
  sequential load, which shows up as a payment that silently does not go through.
  A distinguishable error would help clients tell "you cannot pay" from
  "try again".
- `@x402/core/server` does not re-export the `PaymentOption` type, so route configs
  have to derive it from `RouteConfig["accepts"]`.
- `@x402/hedera`'s warning about importing `@hiero-ledger/sdk` directly is real and
  worth repeating loudly — the failure surfaces as `t.startsWith is not a function`,
  which gives no hint that the cause is a duplicate install. Pinning the SDK to the
  exact version `@x402/hedera` depends on keeps pnpm to a single instance.

## Architecture

```
buyer  ──HTTP 402──►  Next.js route
                        │  accepts: [ HBAR 0.0.0 | USDC 0.0.429274 | H402 0.0.9840995 ]
                        │  prices resolved per product from the request path
                        ▼
              x402.org/facilitator          verifies the partially-signed
                        │                   TransferTransaction, signs as fee
                        │                   payer, submits it
                        ▼
                  Hedera testnet
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
  payTo 0.0.9841120              HCS topic 0.0.9840930
  (+ automatic fractional         (receipt, $0.0001)
   fees to shareholders
   when paying in H402)
```

| file | role |
| --- | --- |
| `app/api/v1/[product]/route.ts` | the paid endpoint; multi-asset `accepts`, drained-body guard |
| `lib/x402-server.ts` | resource server, Hedera scheme, `onAfterSettle` receipt hook |
| `lib/x402-hedera-client.ts` | reference buyer — copy this to integrate |
| `lib/hcs.ts` | receipt topic: create, submit, read back from the mirror node |
| `lib/providers.ts` | the four data products |
| `lib/mirror.ts` | mirror node client, used for data *and* as the ledger |
| `lib/stats.ts` | business metrics, derived entirely from consensus |
| `scripts/reference-customer.ts` | autonomous agent that buys its own feed on a loop |

## Licence

MIT
