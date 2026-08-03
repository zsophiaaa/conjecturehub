import type { CumulativeSeries } from "@/lib/corpus";

/**
 * Cumulative multi-series line chart, rendered as inline SVG on the server.
 *
 * Every line is labelled at its right-hand end with its name and running total,
 * so the chart never asks the reader to match a hue against a legend in the
 * corner. Colour is a second channel, not the only one, which matters both for
 * colour-blind readers and for anyone printing the page.
 *
 * There is no hover state and no tooltip. That is a real limitation and a
 * deliberate one: keeping this a server component means the whole page stays in
 * the static build with no client JavaScript, and the underlying numbers are
 * published at /index/series.json for anyone who wants to read exact values.
 */

const W = 760;
const H = 300;
const PAD = { left: 44, right: 176, top: 14, bottom: 36 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Minimum vertical gap between two end labels before they start to collide. */
const LABEL_GAP = 17;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** Smallest round step that keeps the axis under about six gridlines. */
function axisScale(dataMax: number) {
  const step = STEPS.find((s) => dataMax / s <= 6) ?? STEPS[STEPS.length - 1];
  return { step, max: Math.max(Math.ceil(dataMax / step) * step, step) };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonth(iso: string): string {
  const [year, m] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} '${String(year).slice(2)}`;
}

function seriesColor(index: number): string {
  return `var(--ch-series-${(index % 6) + 1})`;
}

export function CumulativeLines({ series }: { series: CumulativeSeries }) {
  const { keys, points } = series;
  if (keys.length === 0 || points.length === 0) {
    return <p className="text-sm text-ink-faint">No dated records to plot yet.</p>;
  }

  const dataMax = Math.max(...points.flatMap((p) => p.values), 1);
  const axis = axisScale(dataMax);

  const x = (i: number) =>
    points.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (points.length - 1)) * PLOT_W;
  const y = (value: number) => PAD.top + PLOT_H - (value / axis.max) * PLOT_H;

  const gridValues: number[] = [];
  for (let v = 0; v <= axis.max; v += axis.step) gridValues.push(v);

  // Thin the x labels so they never overlap: at 13px a month label needs about
  // 54px, and the plot is 540px wide.
  const maxXLabels = Math.floor(PLOT_W / 62);
  const xLabelEvery = Math.max(1, Math.ceil(points.length / maxXLabels));

  const last = points[points.length - 1];

  // Place each end label at its line's final value, then separate any that
  // collide. Two passes: the first pushes overlapping labels down, the second
  // pulls back anything the first shoved past the bottom of the plot. Doing
  // only the first pass and then sliding the whole stack up, which is the
  // obvious approach, drives the topmost label off the canvas whenever several
  // series finish bunched together near zero.
  const labels = keys
    .map((key, index) => ({ key, index, value: last.values[index]!, anchorY: y(last.values[index]!) }))
    .sort((a, b) => a.anchorY - b.anchorY)
    .map((entry) => ({ ...entry, labelY: entry.anchorY }));

  const top = PAD.top;
  const bottom = PAD.top + PLOT_H;

  let cursor = top;
  for (const l of labels) {
    l.labelY = Math.max(l.labelY, cursor);
    cursor = l.labelY + LABEL_GAP;
  }

  let floor = bottom;
  for (let i = labels.length - 1; i >= 0; i -= 1) {
    labels[i]!.labelY = Math.max(top, Math.min(labels[i]!.labelY, floor));
    floor = labels[i]!.labelY - LABEL_GAP;
  }

  const summary = keys.map((k) => `${k.label}: ${k.total}`).join(", ");

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${series.title}. Cumulative from ${formatMonth(points[0].date)} to ${formatMonth(last.date)}. Totals — ${summary}.`}
        // Never scale below 1:1, so the axis and end labels keep their declared
        // size and the chart scrolls sideways on a phone instead of shrinking
        // into illegibility.
        style={{ minWidth: `${W}px`, height: "auto" }}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(value)}
              y2={y(value)}
              style={{ stroke: value === 0 ? "var(--color-border-strong)" : "var(--color-border)" }}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={13}
              className="tabular-nums"
              style={{ fill: "var(--color-ink-faint)" }}
            >
              {value.toLocaleString("en-US")}
            </text>
          </g>
        ))}

        {points.map((point, i) =>
          i % xLabelEvery === 0 || i === points.length - 1 ? (
            <text
              key={point.date}
              x={x(i)}
              y={H - 14}
              textAnchor="middle"
              fontSize={13}
              style={{ fill: "var(--color-ink-faint)" }}
            >
              {formatMonth(point.date)}
            </text>
          ) : null,
        )}

        {keys.map((key, index) => (
          <path
            key={key.key}
            d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.values[index]).toFixed(1)}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ stroke: seriesColor(index) }}
          />
        ))}

        {labels.map((entry) => {
          const endX = x(points.length - 1);
          const textX = PAD.left + PLOT_W + 22;
          return (
            <g key={entry.key.key}>
              <circle cx={endX} cy={entry.anchorY} r={3} style={{ fill: seriesColor(entry.index) }} />
              <path
                d={`M${endX + 4},${entry.anchorY} L${textX - 8},${entry.labelY}`}
                fill="none"
                strokeWidth={1}
                style={{ stroke: seriesColor(entry.index) }}
              />
              <text
                x={textX}
                y={entry.labelY}
                dominantBaseline="middle"
                fontSize={13}
                style={{ fill: "var(--color-ink)" }}
              >
                {entry.key.label}
                <tspan className="tabular-nums" style={{ fill: "var(--color-ink-faint)" }}>
                  {" "}
                  {entry.value.toLocaleString("en-US")}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
