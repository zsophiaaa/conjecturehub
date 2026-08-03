import type { ReactNode } from "react";

/**
 * Wrapper every chart on /stats is drawn inside.
 *
 * The footer is the point of it. A chart of 775 claims and a chart of 30 look
 * identical once they are normalised into bars, and the difference decides
 * whether the reader should believe the shape. So the count plotted and the
 * count excluded are part of the chart, printed underneath it, not tucked into
 * a tooltip or left out because the number is embarrassing.
 */
export function ChartFrame({
  title,
  description,
  plotted,
  excluded,
  excludedNote,
  unit,
  children,
}: {
  title: string;
  description: string;
  plotted: number;
  excluded: number;
  excludedNote: string | null;
  /** Plural noun for what is being counted, e.g. "claims". */
  unit: string;
  children: ReactNode;
}) {
  const n = (value: number) => value.toLocaleString("en-US");

  return (
    <figure className="ui-panel p-5">
      <figcaption>
        <h3 className="font-serif text-xl text-ink">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
      </figcaption>

      <div className="mt-5">{children}</div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-ink-faint">
        <span className="tabular-nums text-ink-muted">{n(plotted)}</span> {unit} plotted.{" "}
        {excluded > 0 ? (
          <>
            <span className="tabular-nums text-ink-muted">{n(excluded)}</span> excluded
            {excludedNote ? <> — {excludedNote.replace(/\.$/, "")}.</> : "."}
          </>
        ) : (
          <>Nothing excluded.</>
        )}
      </p>
    </figure>
  );
}
