import type { Metadata } from "next";
import { Browser } from "@/components/Browser";
import { getStats } from "@/lib/corpus";

export const metadata: Metadata = {
  title: "Browse conjectures",
  description: "Search and filter the full conjecture index by name, subject, status and formalization.",
};

export default function BrowsePage() {
  const stats = getStats();

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <h1 className="font-serif text-3xl text-ink">Browse conjectures</h1>
        <p className="mt-3 leading-relaxed text-ink-muted">
          {stats.total.toLocaleString("en-US")} records merged from formal-conjectures, the Erdős problem database and
          Wikidata. Status labels are derived from recorded claims, so an unlabelled conjecture means nobody has filed a
          claim here — not that nobody has worked on it.
        </p>
      </header>

      <Browser tags={stats.topTags} />
    </div>
  );
}
