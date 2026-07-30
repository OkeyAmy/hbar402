import Nav from "@/components/nav";
import { Code, Metric, Panel, Pip, ScanLink, Section } from "@/components/ui";
import {
  PRODUCTS,
  creditsPrice,
  hbarPrice,
  usdcPrice,
} from "@/lib/catalog";
import {
  CREDITS_ASSET,
  FACILITATOR_URL,
  NETWORK,
  PAY_TO,
  USDC_ASSET,
  hashscanAccount,
  shareholders,
} from "@/lib/config";
import { topicHashscan, topicId } from "@/lib/hcs";
import { assetLabel, assetAmount, fmt, getStats, relativeAge } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const revalidate = 5;

const QUICKSTART = `import { buy } from "hbar402/client";

const { data, receipt } = await buy(
  "https://hbar402.vercel.app/api/v1/network-pulse",
  { accountId: "0.0.1234", privateKey: process.env.HEDERA_KEY!, prefer: "hbar" },
);

console.log(data.observedTps);      // 13.27
console.log(receipt.hashscan);      // verifiable settlement`;

export default async function Home() {
  const stats = await getStats(100);
  const topic = topicId();
  const collectors = shareholders();

  return (
    <>
      <Nav current="/" />

      <main className="mx-auto max-w-5xl px-6 pb-24">
        {/* Hero */}
        <section className="py-16">
          <div className="flex items-center gap-2">
            <Pip live={stats.live} />
            <p className="label">{NETWORK}</p>
          </div>

          <h1 className="display mt-5 max-w-3xl text-4xl leading-[1.1] sm:text-5xl">
            Pay-per-query data with a{" "}
            <span className="text-violet">receipt you don&apos;t have to trust us for</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-muted">
            Hedera-native market and network data, sold by the call over the x402
            standard. Settles in HBAR, USDC or credits for fractions of a cent —
            no account, no subscription, no minimum. Every purchase writes an
            immutable receipt to a public consensus log, so the whole business is
            auditable without touching this server.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              value={String(stats.totalCalls)}
              caption="queries receipted on consensus"
              tone="violet"
            />
            <Metric
              value={`${fmt(stats.revenue.hbar, 4)}`}
              caption="HBAR revenue"
            />
            <Metric
              value={`${fmt(stats.revenue.credits, 4)}`}
              caption="H402 revenue (auto-split)"
              tone="teal"
            />
            <Metric
              value={String(stats.uniqueBuyers)}
              caption="distinct paying accounts"
            />
          </div>
        </section>

        {/* The gap */}
        <Section
          label="the gap"
          title="x402 settles payments. It does not produce receipts."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Panel>
              <p className="text-muted">
                When an x402 payment settles, the buyer gets a{" "}
                <code className="text-fg">PAYMENT-RESPONSE</code> header and the
                seller writes a row in its own database. There is no shared record.
                A third party cannot audit what was sold, to whom, or at what
                price — and for machine-to-machine commerce with no human in the
                loop, that is the part you actually need.
              </p>
            </Panel>
            <Panel>
              <p className="text-muted">
                Hedera Consensus Service closes it. Every settled payment is
                appended to a public topic as an ordered, consensus-timestamped,
                immutable message for a fixed{" "}
                <span className="text-fg">$0.0001</span> — cheap enough to receipt
                a $0.0014 query without distorting the economics.
              </p>
              {topic ? (
                <p className="mt-4 text-xs">
                  <span className="text-muted-soft">topic </span>
                  <ScanLink href={topicHashscan()!}>{topic}</ScanLink>
                </p>
              ) : null}
            </Panel>
          </div>

          <p className="mt-4 text-sm text-muted-soft">
            Every figure on this page is recomputed from that topic on each
            request. Nothing is cached in a database, so what you see is what an
            independent auditor would derive from HashScan alone.
          </p>
        </Section>

        {/* The split */}
        <Section
          label="the split"
          title="Revenue sharing with no contract, enforced inside the payment"
        >
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-3">
              <Panel>
                <p className="text-muted">
                  The credits token carries HTS{" "}
                  <span className="text-fg">fractional custom fees</span>, so a cut
                  of every transfer is routed to shareholder accounts by consensus —
                  no splitter contract, no gas, no{" "}
                  <code className="text-fg">claim()</code> step, no reentrancy
                  surface.
                </p>
                <p className="mt-4 text-muted">
                  The fees are assessed{" "}
                  <span className="text-fg">net of transfers</span>, charged to the
                  sender on top, so the seller still receives the exact quoted
                  price. And because custom fees are applied by the network at
                  execution, they never appear in the transaction body the buyer
                  signs — which is what keeps this compliant with the facilitator&apos;s
                  verification rules.
                </p>
              </Panel>
            </div>

            <div className="md:col-span-2">
              <Code>{`one credits payment, on chain:

 0.0.5865529   -2400  buyer
 0.0.9840993    +200  holder 10%
 0.0.9840994    +200  holder 10%
 0.0.9841120   +2000  seller

seller receives exactly
the quoted price.`}</Code>
            </div>
          </div>

          {collectors.length > 0 ? (
            <p className="mt-4 text-xs text-muted-soft">
              collectors{" "}
              {collectors.map((c, i) => (
                <span key={c}>
                  {i > 0 ? " · " : ""}
                  <ScanLink href={hashscanAccount(c)}>{c}</ScanLink>
                </span>
              ))}
            </p>
          ) : null}
        </Section>

        {/* Catalog */}
        <Section label="catalog" title="Four endpoints, three ways to pay">
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-soft">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">endpoint</th>
                  <th className="px-4 py-3 font-medium">HBAR</th>
                  <th className="px-4 py-3 font-medium">USDC</th>
                  <th className="px-4 py-3 font-medium">H402</th>
                  <th className="px-4 py-3 font-medium">returns</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTS.map((p) => (
                  <tr key={p.id} className="border-b border-rule last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="text-fg">/api/v1/{p.id}</p>
                      <p className="mt-1 max-w-sm text-muted-soft">
                        {p.description}
                      </p>
                      {p.params.length > 0 ? (
                        <p className="mt-2 text-muted-soft">
                          params:{" "}
                          {p.params
                            .map(
                              (s) =>
                                `${s.name}${s.required ? "" : "?"}=${s.example}`,
                            )
                            .join(" ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="readout px-4 py-3 align-top whitespace-nowrap text-fg">
                      {hbarPrice(p)}
                    </td>
                    <td className="readout px-4 py-3 align-top whitespace-nowrap text-muted">
                      {usdcPrice(p)}
                    </td>
                    <td className="readout px-4 py-3 align-top whitespace-nowrap text-teal">
                      {creditsPrice(p)}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-soft">
                      {p.returns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-soft">
            A single 402 advertises all three assets and the buyer picks whichever
            it holds. HBAR needs no token association; USDC is Circle-issued; H402
            additionally pays shareholders on transfer.
          </p>
        </Section>

        {/* Quickstart */}
        <Section label="quickstart" title="Buying is one function call">
          <Code>{QUICKSTART}</Code>
          <p className="mt-4 text-sm text-muted-soft">
            The 402 handshake, the partially-signed{" "}
            <code className="text-fg">TransferTransaction</code> and the retry all
            happen underneath. Note the buyer pays no gas — under the Hedera exact
            scheme the facilitator is the fee payer and submits the transaction, so
            the buyer spends exactly the quoted price and nothing else. Full
            walkthrough in <a className="link" href="/docs">the docs</a>.
          </p>
        </Section>

        {/* Recent receipts */}
        <Section label="live ledger" title="Most recent settlements">
          {stats.latest.length === 0 ? (
            <Panel>
              <p className="text-muted-soft">
                No receipts yet. Buy something and it will appear here within a
                few seconds of consensus.
              </p>
            </Panel>
          ) : (
            <div className="panel divide-y divide-rule">
              {stats.latest.slice(0, 6).map((r) => (
                <div
                  key={r.sequenceNumber}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-xs"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-muted-soft">#{r.sequenceNumber}</span>
                    <span className="text-fg">{r.product}</span>
                    <span className="readout text-teal">
                      {fmt(assetAmount(r.asset, r.amount))} {assetLabel(r.asset)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="hashish">{r.payer}</span>
                    <span className="text-muted-soft">
                      {relativeAge(r.consensusAt)}
                    </span>
                    <ScanLink href={r.hashscan}>receipt</ScanLink>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm">
            <a className="link" href="/receipts">
              Full consensus ledger
            </a>
          </p>
        </Section>

        {/* Footer / addresses */}
        <Section label="on chain">
          <div className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
            <Row label="network">{NETWORK}</Row>
            <Row label="facilitator">{FACILITATOR_URL}</Row>
            <Row label="revenue (payTo)">
              <ScanLink href={hashscanAccount(PAY_TO)}>{PAY_TO}</ScanLink>
            </Row>
            {topic ? (
              <Row label="receipt topic">
                <ScanLink href={topicHashscan()!}>{topic}</ScanLink>
              </Row>
            ) : null}
            <Row label="USDC">{USDC_ASSET}</Row>
            {CREDITS_ASSET ? (
              <Row label="credits token">{CREDITS_ASSET}</Row>
            ) : null}
          </div>
        </Section>
      </main>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hair flex items-baseline justify-between gap-4 py-2">
      <span className="text-muted-soft">{label}</span>
      <span className="hashish text-right">{children}</span>
    </div>
  );
}
