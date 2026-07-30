import Nav from "@/components/nav";
import { Code, Panel, ScanLink, Section } from "@/components/ui";
import { PRODUCTS, creditsPrice, hbarPrice, usdcPrice } from "@/lib/catalog";
import {
  CREDITS_ASSET,
  FACILITATOR_URL,
  HBAR_ASSET,
  NETWORK,
  PAY_TO,
  USDC_ASSET,
  hashscanAccount,
} from "@/lib/config";
import { topicHashscan, topicId } from "@/lib/hcs";

export const metadata = {
  title: "hbar402 — docs",
  description: "How to buy from hbar402 over x402 on Hedera.",
};

const INSTALL = `pnpm add @x402/core @x402/fetch @x402/hedera`;

const CLIENT = `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";

// Import PrivateKey from @x402/hedera, not @hiero-ledger/sdk. The SDK relies on
// internal instanceof checks and two copies on disk fail at runtime with
// "t.startsWith is not a function".
const signer = createClientHederaSigner(
  "0.0.1234",
  PrivateKey.fromStringDer(process.env.HEDERA_PRIVATE_KEY!),
  { network: "hedera:testnet" },
);

const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "hedera:testnet", client: new ExactHederaScheme(signer) }],

  // Optional. hbar402 offers HBAR, USDC and H402 in one 402; without a selector
  // the client takes the first option.
  paymentRequirementsSelector: (_v, reqs) =>
    reqs.find((r) => r.asset === "0.0.0") ?? reqs[0],
});

const res = await payingFetch("https://hbar402.vercel.app/api/v1/network-pulse");
const data = await res.json();`;

const RECEIPT = `import { decodePaymentResponseHeader } from "@x402/fetch";

// v2 dropped the x- prefix: it is PAYMENT-RESPONSE, matching PAYMENT-REQUIRED
// on the 402 itself.
const settled = decodePaymentResponseHeader(res.headers.get("payment-response")!);

// The generic SettleResponse field is 'transaction'; on Hedera it holds the
// Hedera transaction id, e.g. "0.0.9185802@1785406701.936622066".
console.log(settled.transaction, settled.payer, settled.success);`;

const CURL = `# Unpaid: returns 402 with the catalog entry and all accepted assets
curl -i https://hbar402.vercel.app/api/v1/hbar-spot

# The PAYMENT-REQUIRED header is base64 JSON. Decode it to see the options:
curl -sD - -o /dev/null https://hbar402.vercel.app/api/v1/hbar-spot \\
  | grep -i '^payment-required:' | cut -d' ' -f2 | base64 -d | jq`;

export default function DocsPage() {
  const topic = topicId();

  return (
    <>
      <Nav current="/docs" />

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="py-12">
          <p className="label">docs</p>
          <h1 className="display mt-4 text-3xl">Integrating</h1>
          <p className="mt-5 max-w-2xl text-muted">
            hbar402 is an ordinary HTTP API that answers{" "}
            <span className="text-fg">402 Payment Required</span> until you pay.
            Any x402 v2 client with the Hedera scheme registered can buy from it.
            There is no signup, no API key and no minimum spend.
          </p>
        </section>

        <Section label="1" title="Get a funded Hedera testnet account">
          <div className="space-y-3 text-muted">
            <p>
              Create one at{" "}
              <a className="link" href="https://portal.hedera.com/">
                portal.hedera.com
              </a>{" "}
              and claim testnet HBAR. Either key type works for paying —{" "}
              <span className="text-fg">ED25519</span> keys come DER-encoded,{" "}
              <span className="text-fg">ECDSA</span> keys as raw hex.
            </p>
            <p>
              For USDC, use the{" "}
              <a className="link" href="https://faucet.circle.com/">
                Circle faucet
              </a>{" "}
              and select Hedera Testnet. Paste your{" "}
              <span className="text-fg">account id</span> (
              <code>0.0.x</code>), not the EVM address. If your account has
              unlimited automatic token associations you do not need a separate{" "}
              <code>TokenAssociateTransaction</code>.
            </p>
            <p>
              You do <span className="text-fg">not</span> need HBAR for gas to
              buy. Under the Hedera exact scheme the facilitator is the fee payer
              and submits the transaction, so you are debited exactly the quoted
              price. You only need a balance of the asset you are paying in.
            </p>
          </div>
        </Section>

        <Section label="2" title="Install">
          <Code>{INSTALL}</Code>
        </Section>

        <Section label="3" title="Build a paying fetch">
          <Code>{CLIENT}</Code>
        </Section>

        <Section label="4" title="Read the settlement receipt">
          <Code>{RECEIPT}</Code>
          <p className="mt-4 text-sm text-muted-soft">
            Independently of that header, every settled purchase is also appended
            to our public HCS topic{" "}
            {topic ? <ScanLink href={topicHashscan()!}>{topic}</ScanLink> : null} —
            so you have a consensus-ordered record of the transaction that neither
            side can alter after the fact.
          </p>
        </Section>

        <Section label="5" title="Or just use curl">
          <Code>{CURL}</Code>
        </Section>

        <Section label="reference" title="Endpoints">
          <div className="space-y-4">
            {PRODUCTS.map((p) => (
              <Panel key={p.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-fg">GET /api/v1/{p.id}</p>
                  <p className="readout text-xs">
                    <span className="text-fg">{hbarPrice(p)}</span>
                    <span className="text-muted-soft"> · </span>
                    <span className="text-muted">{usdcPrice(p)}</span>
                    {CREDITS_ASSET ? (
                      <>
                        <span className="text-muted-soft"> · </span>
                        <span className="text-teal">{creditsPrice(p)}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <p className="mt-2 text-muted">{p.description}</p>

                {p.params.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs">
                    {p.params.map((s) => (
                      <p key={s.name}>
                        <span className="text-fg">{s.name}</span>
                        <span className="text-muted-soft">
                          {s.required ? " (required)" : " (optional)"} —{" "}
                          {s.description}, e.g. {s.example}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-muted-soft">
                  returns: {p.returns}
                </p>
              </Panel>
            ))}
          </div>

          <p className="mt-4 text-sm text-muted-soft">
            Requests that fail validation return 4xx and are{" "}
            <span className="text-fg">not</span> settled, so a malformed call
            costs nothing.
          </p>
        </Section>

        <Section label="settlement" title="Accepted assets">
          <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
            <Row label="network">{NETWORK}</Row>
            <Row label="facilitator">{FACILITATOR_URL}</Row>
            <Row label="payTo">
              <ScanLink href={hashscanAccount(PAY_TO)}>{PAY_TO}</ScanLink>
            </Row>
            <Row label="HBAR asset">{HBAR_ASSET} (tinybars)</Row>
            <Row label="USDC asset">{USDC_ASSET} (6dp)</Row>
            {CREDITS_ASSET ? (
              <Row label="H402 asset">{CREDITS_ASSET} (6dp)</Row>
            ) : null}
          </div>

          <p className="mt-5 max-w-2xl text-sm text-muted">
            Paying in <span className="text-teal">H402</span> also pays our
            shareholders: the token carries fractional custom fees, so consensus
            routes a cut of your transfer to collector accounts inside the same
            transaction. The fees are charged on top of the price, so the amount
            debited from you is slightly higher than the quoted figure while the
            seller still receives exactly the quote.
          </p>
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
