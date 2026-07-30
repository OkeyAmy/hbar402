import Link from "next/link";

const LINKS = [
  { href: "/", label: "overview" },
  { href: "/receipts", label: "receipts" },
  { href: "/docs", label: "docs" },
];

export default function Nav({ current }: { current: string }) {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="display text-base tracking-tight">
          hbar<span className="text-violet">402</span>
        </Link>

        <div className="flex items-center gap-5">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                current === link.href
                  ? "text-fg"
                  : "text-muted-soft transition-colors hover:text-muted"
              }
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://github.com/fritzschoff/hbar402"
            className="text-muted-soft transition-colors hover:text-muted"
          >
            source
          </a>
        </div>
      </nav>
    </header>
  );
}
