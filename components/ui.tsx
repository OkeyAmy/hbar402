import type { ReactNode } from "react";

export function Section({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule py-12">
      <p className="label">{label}</p>
      {title ? (
        <h2 className="display mt-3 text-xl text-fg">{title}</h2>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel panel-lit p-5 ${className}`}>{children}</div>
  );
}

/** Big numeric readout with a caption underneath. */
export function Metric({
  value,
  caption,
  tone = "default",
}: {
  value: string;
  caption: string;
  tone?: "default" | "violet" | "teal";
}) {
  const color =
    tone === "violet" ? "text-violet" : tone === "teal" ? "text-teal" : "text-fg";
  return (
    <Panel>
      <p className={`readout text-2xl ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-soft">{caption}</p>
    </Panel>
  );
}

/** Fenced code block. `lines` keeps copy/paste clean without a client component. */
export function Code({ children }: { children: string }) {
  return (
    <pre className="panel overflow-x-auto p-4 text-xs leading-relaxed text-muted">
      <code>{children}</code>
    </pre>
  );
}

export function Pip({ live }: { live: boolean }) {
  return <span className={`pip ${live ? "pip-live" : "pip-idle"}`} />;
}

/** External link that renders a Hedera id as a HashScan link. */
export function ScanLink({
  href,
  children,
  mono = true,
}: {
  href: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`link ${mono ? "hashish" : ""}`}
    >
      {children}
    </a>
  );
}
