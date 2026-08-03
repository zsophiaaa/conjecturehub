import Link from "next/link";
import { getStats } from "@/lib/corpus";

export const metadata = { title: "Not found" };

/**
 * Most 404s here are a mistyped or renamed conjecture slug, so the page offers
 * the search rather than an apology.
 */
export default function NotFound() {
  const total = getStats().total;

  return (
    <div className="max-w-2xl">
      <p className="font-mono text-sm text-ink-3">404</p>
      <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">No page here</h1>
      <p className="mt-4 text-ink-2">
        If you were after a conjecture, the identifier may have changed or been merged into another
        record. All {total.toLocaleString()} of them are searchable.
      </p>
      <p className="mt-6 flex flex-wrap gap-4">
        <Link href="/conjectures/">Browse the index</Link>
        <Link href="/">Front page</Link>
      </p>
    </div>
  );
}
