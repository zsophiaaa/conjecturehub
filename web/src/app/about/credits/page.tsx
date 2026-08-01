import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

export const metadata: Metadata = {
  title: "Sources and credits",
  description: "Attribution for data sources, verification tooling, and platform inspiration.",
};

export default function CreditsPage() {
  const md = readFileSync(
    path.join(process.cwd(), "..", "docs", "ATTRIBUTIONS.md"),
    "utf8",
  );
  const html = marked.parse(md) as string;

  return (
    <article className="prose-comment max-w-3xl space-y-4 leading-relaxed">
      <h1 className="font-serif text-3xl text-ink">Sources and credits</h1>
      <div
        className="text-ink-muted [&_a]:text-ink [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-ink [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-left"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
