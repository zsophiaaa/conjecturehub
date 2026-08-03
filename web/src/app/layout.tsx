import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SITE } from "@/lib/corpus";
import { AuthMenu } from "@/components/AuthMenu";
import { Providers } from "@/components/Providers";
import { ThemeScript } from "@/components/ThemeScript";
import { moderationAutoApprove } from "@/lib/moderation-mode";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description:
    "An open, continuously-updated index of mathematical conjectures. Status is recorded as sourced, timestamped claims rather than a solved flag, and Lean proofs are machine-checked.",
};

const NAV = [
  { href: "/conjectures/", label: "Browse" },
  { href: "/stats/", label: "Stats" },
  { href: "/agents/", label: "Agents" },
  { href: "/about/", label: "About" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <Providers>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>

        <header className="border-b border-border bg-surface-1">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
            <Link href="/" className="font-serif text-lg text-ink no-underline hover:text-ink">
              {SITE.name}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-ink-muted no-underline hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <a
                href={SITE.repo}
                className="text-ink-muted no-underline hover:text-ink"
                title="Contribute on GitHub"
              >
                GitHub
              </a>
              <AuthMenu />
            </div>
          </div>
        </header>

        {moderationAutoApprove() ? (
          <div className="border-b border-border bg-surface-2 px-5 py-2 text-center text-sm text-ink-muted">
            <strong className="text-ink">Open testing mode</strong> — comments and difficulty tags publish
            immediately. Claim and proof proposals appear as unverified until a curator verifies them.
          </div>
        ) : null}

        <main id="main" className="mx-auto max-w-6xl px-5 py-10">
          {children}
        </main>

        <footer className="mt-16 border-t border-border bg-surface-1">
          <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-ink-muted">
            <p className="max-w-3xl">
              Every status on this site is derived from sourced, timestamped claims. &ldquo;Open&rdquo; usually means
              only that a named curator is unaware of a published solution — it is not a proof that none exists. Search
              the literature before investing effort.
            </p>
            <p className="mt-4">
              Data is mixed-licence with per-field provenance. Code is Apache-2.0.{" "}
              <Link href="/about/credits/" className="font-medium">
                Sources and credits
              </Link>
              {" · "}
              <Link href="/about/privacy/">Privacy &amp; security</Link>
              {" · "}
              <a href={SITE.repo}>Contribute on GitHub</a>.
            </p>
          </div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
