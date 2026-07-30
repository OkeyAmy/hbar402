import Nav from "@/components/nav";
import { Panel, Pip, ScanLink, Section } from "@/components/ui";
import { NETWORK, hashscanAccount } from "@/lib/config";
import { topicHashscan, topicId } from "@/lib/hcs";
import { assetAmount, assetLabel, fmt, getStats, relativeAge } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const revalidate = 3;

/** Rebuilds a HashScan transaction link from a mirror-style transaction id. */
function txLink(transactionId: string): string {
  const net = NETWORK.split(":")[1] ?? "testnet";
  const normalized = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `https://hashscan.io/${net}/transaction/${normalized}`;
}

export default async function ReceiptsPage() {
  const stats = await getStats(200);
  const topic = topicId();

  return (
    <>
      <Nav current="/receipts" />

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="py-12">
          <div className="flex items-center gap-2">
            <Pip live={stats.live} />
            <p className="label">consensus ledger</p>
          </div>

          <h1 className="display mt-4 text-3xl">Every sale, on the public record</h1>

          <p className="mt-5 max-w-2xl text-muted">
            Each row is a message on HCS topic{" "}
            {topic ? (
              <ScanLink href={topicHashscan()!}>{topic}</ScanLink>
            ) : (
              <span className="text-muted-soft">(not configured)</span>
            )}
            , written when a payment settled. Sequence numbers are assigned by
            consensus and are gapless, so a missing sale would be visible as a
            missing number. Each receipt carries the settlement transaction id, so
            you can verify the money moved independently of both the receipt and
            this page.
          </p>

          <p className="mt-4 max-w-2xl text-sm text-muted-soft">
            This table is fetched from the mirror node on every request. There is no
            database behind it.
          </p>
        </section>

        <Section label="totals">
          <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
            <Total label="queries sold" value={String(stats.totalCalls)} />
            <Total label="distinct buyers" value={String(stats.uniqueBuyers)} />
            <Total label="HBAR collected" value={fmt(stats.revenue.hbar, 6)} />
            <Total label="USDC collected" value={fmt(stats.revenue.usdc, 6)} />
            <Total
              label="H402 collected"
              value={fmt(stats.revenue.credits, 6)}
            />
            <Total
              label="asset mix (hbar/usdc/h402)"
              value={`${stats.callsByAsset.hbar}/${stats.callsByAsset.usdc}/${stats.callsByAsset.credits}`}
            />
          </div>
        </Section>

        <Section label="by product">
          <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
            {Object.entries(stats.callsByProduct)
              .sort((a, b) => b[1] - a[1])
              .map(([product, count]) => (
                <Total key={product} label={product} value={String(count)} />
              ))}
            {Object.keys(stats.callsByProduct).length === 0 ? (
              <p className="text-muted-soft">nothing sold yet</p>
            ) : null}
          </div>
        </Section>

        <Section label="receipts">
          {stats.latest.length === 0 ? (
            <Panel>
              <p className="text-muted-soft">
                No receipts on the topic yet.
              </p>
            </Panel>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-soft">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">seq</th>
                    <th className="px-4 py-3 font-medium">product</th>
                    <th className="px-4 py-3 font-medium">paid</th>
                    <th className="px-4 py-3 font-medium">payer</th>
                    <th className="px-4 py-3 font-medium">consensus</th>
                    <th className="px-4 py-3 font-medium">verify</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.latest.map((r) => (
                    <tr
                      key={r.sequenceNumber}
                      className="border-b border-rule last:border-0"
                    >
                      <td className="px-4 py-3 text-muted-soft">
                        {r.sequenceNumber}
                      </td>
                      <td className="px-4 py-3 text-fg">{r.product}</td>
                      <td className="readout px-4 py-3 whitespace-nowrap text-teal">
                        {fmt(assetAmount(r.asset, r.amount))}{" "}
                        {assetLabel(r.asset)}
                      </td>
                      <td className="px-4 py-3">
                        <ScanLink href={hashscanAccount(r.payer)}>
                          {r.payer}
                        </ScanLink>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-soft">
                        {relativeAge(r.consensusAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ScanLink href={r.hashscan}>msg</ScanLink>
                        {" · "}
                        <ScanLink href={txLink(r.tx)}>tx</ScanLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="hair flex items-baseline justify-between gap-4 py-2">
      <span className="text-muted-soft">{label}</span>
      <span className="readout text-fg">{value}</span>
    </div>
  );
}
