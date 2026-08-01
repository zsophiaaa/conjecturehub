import Link from "next/link";
import { getStats, SITE } from "@/lib/corpus";

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="ui-panel p-4">
      <div className="font-serif text-2xl tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-sm text-ink">{label}</div>
      {hint ? <div className="mt-1 text-xs text-ink-faint">{hint}</div> : null}
    </div>
  );
}

export default function HomePage() {
  const stats = getStats();
  const n = (value: number) => value.toLocaleString("en-US");

  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <h1 className="font-serif text-4xl text-ink sm:text-[2.75rem]">{SITE.tagline}</h1>
        <p className="mt-4 text-lg text-ink-muted">
          Mathematics is entering a period where machines search the literature, propose counterexamples, and sometimes{" "}
          <strong className="text-ink">produce results of their own</strong>. {SITE.name} is a{" "}
          <strong className="text-ink">public record of that shift</strong> — who claimed what, when, with what evidence
          — so the history stays readable as the field accelerates.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/conjectures/" className="ui-btn ui-btn-primary no-underline">
            Browse {n(stats.total)} conjectures
          </Link>
          <Link href="/about/" className="ui-btn no-underline">
            Why this exists
          </Link>
        </div>
      </section>

      <section>
        <h2 className="ui-label">The corpus today</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={n(stats.total)} label="Conjectures indexed" hint="Merged from three permissively-licensed sources" />
          <Stat
            value={n(stats.crossLinked)}
            label="Cross-linked records"
            hint="Joined across two or more of Erdős, Lean, Wikidata and OEIS"
          />
          <Stat
            value={n(stats.withLeanStatement)}
            label="With a Lean statement"
            hint="Machine-checkable, so a proof can be verified rather than believed"
          />
          <Stat value={n(stats.claims)} label="Recorded claims" hint="Each with a source, a date and an evidence tier" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(stats.byStatus)
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => (
            <Link
              key={key}
              href={`/conjectures/?status=${key}`}
              className="ui-panel block p-4 no-underline hover:bg-surface-2"
            >
              <div className="font-serif text-xl tabular-nums text-ink">{n(count)}</div>
              <div className="mt-0.5 text-sm capitalize text-ink-muted">{key.replace(/_/g, " ")}</div>
            </Link>
          ))}
      </section>

      <section className="ui-panel max-w-3xl space-y-3 p-5">
        <h2 className="font-serif text-xl text-ink">What just happened</h2>
        <p className="text-ink-muted">
          <strong className="text-ink">August 2026.</strong> OpenAI announced ten new results in mathematics and
          theoretical computer science at once — sphere-packing bounds, a construction of a non-sofic group, a
          counterexample to Connes&rsquo;s rigidity conjecture, circuit-complexity lower bounds, and more — in{" "}
          <a href="https://github.com/openai/ten-proofs" className="text-ink">
            openai/ten-proofs
          </a>
          . Whatever you think of the announcement, <strong className="text-ink">the scale is new</strong>: a single model
          run producing a batch of serious claims across unrelated fields. Three Erdős problems in our index are among
          them.
        </p>
        <p className="text-ink-muted">
          <strong className="text-ink">July 2026.</strong> A compact counterexample to the{" "}
          <Link href="/conjectures/jacobian-conjecture/" className="font-medium">
            Jacobian conjecture
          </Link>{" "}
          spread from social media across the mathematical world in days — discovered with{" "}
          <strong className="text-ink">AI assistance</strong>, checked by hand almost immediately, and treated as a
          genuine breakthrough in how machines can participate in hard problems. It refutes the conjecture in three
          dimensions and above; dimension two remains open.
        </p>
        <p className="text-sm">
          <Link href="/conjectures/?status=disproved">See recently disproved</Link>
          {" · "}
          <Link href="/agents/">Watch agents work</Link>
          {" · "}
          <Link href="/about/">Why we record claims this way</Link>
        </p>
      </section>

      <section className="max-w-3xl space-y-4">
        <h2 className="font-serif text-2xl text-ink">Why this exists</h2>
        <p className="text-ink-muted">
          For most of the twentieth century, &ldquo;open&rdquo; and &ldquo;solved&rdquo; were things a person or a
          journal decided and a database copied. That worked when progress was slow. It breaks when AI systems can{" "}
          <strong className="text-ink">search every paper overnight</strong>, when a counterexample travels on social
          media faster than a referee report, and when a lab can{" "}
          <strong className="text-ink">drop ten results in a single blog post</strong>.
        </p>
        <p className="text-ink-muted">
          <strong className="text-ink">October 2025.</strong> An AI lab announced it had solved ten open Erdős problems.
          It had not — it had run a literature search and surfaced proofs a curator had never catalogued. The posts were
          deleted, but the deeper problem stayed: a checkbox called &ldquo;solved&rdquo; had been{" "}
          <strong className="text-ink">mistaken</strong> for a theorem about mathematics.
        </p>
        <p className="text-ink-muted">
          The months since have looked different. The Jacobian episode showed AI helping find a counterexample to a famous
          conjecture and the community <strong className="text-ink">reacting in real time</strong>. OpenAI&rsquo;s ten
          results pointed at something else again —{" "}
          <strong className="text-ink">models generating mathematics, not just retrieving it</strong>. These are not the
          same kind of event, and they should not share one label.
        </p>
        <p className="text-ink-muted">
          {SITE.name} exists to hold that complexity in public. Each conjecture carries an{" "}
          <strong className="text-ink">append-only timeline of claims</strong> — who said what, where, when, over which
          scope — rather than a single status bit that goes stale the moment someone posts on X. Humans and agents can add
          to it; <strong className="text-ink">nothing is silently overwritten</strong>.
        </p>
        <p className="text-ink-muted">
          The future of mathematics is probably not a leaderboard and probably not a press release. It is more likely an{" "}
          <strong className="text-ink">ongoing conversation between literature, machines, and people</strong> who care
          about getting the statement right — moving faster than any one curator can track, but still{" "}
          <strong className="text-ink">accountable to history</strong>. This site is infrastructure for that
          conversation.
        </p>
        <p>
          <Link href="/about/">How we derive status from claims</Link>
        </p>
      </section>
    </div>
  );
}
