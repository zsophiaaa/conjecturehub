/**
 * Horizontal bars for a single categorical breakdown.
 *
 * Deliberately monochrome and built from HTML rather than SVG: there is one
 * series, so colour would carry no information, and real DOM text stays at its
 * declared size on a phone instead of scaling down with a viewBox.
 *
 * Bars are drawn relative to the largest category so the small ones stay
 * visible; the percentage next to each is of the total, which is the number a
 * reader actually wants. Those two denominators differ, so both numbers are
 * always shown rather than a bar length alone.
 *
 * Omit `total` when the bars are a measurement rather than a breakdown. A share
 * only means something if the categories partition a whole, and printing one
 * for a ranked list invites the reader to add the rows up.
 */
export function CategoryBars({
  data,
  total,
}: {
  data: { key: string; label: string; count: number }[];
  total?: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const share = total != null && total > 0 ? (d.count / total) * 100 : null;
        return (
          <li
            key={d.key}
            className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[13rem_1fr_auto]"
          >
            <span className="text-sm leading-tight text-ink">{d.label}</span>
            <span className="h-3 border border-border bg-surface-2" aria-hidden="true">
              <span
                className="block h-full bg-ink"
                style={{ width: `${Math.max((d.count / max) * 100, 1)}%` }}
              />
            </span>
            <span className="text-sm tabular-nums text-ink-muted">
              {d.count.toLocaleString("en-US")}
              {share != null ? (
                <span className="ml-2 text-ink-faint">
                  {share >= 1 ? Math.round(share) : share.toFixed(1)}%
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
