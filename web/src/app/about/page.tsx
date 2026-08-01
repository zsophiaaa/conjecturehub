import type { Metadata } from "next";
import { SITE } from "@/lib/corpus";

export const metadata: Metadata = {
  title: "Why this exists",
  description:
    "Why ConjectureHub records claims instead of a solved flag, how AI is changing mathematical progress, and what each evidence tier means.",
};

const TIERS = [
  {
    name: "unverified claim",
    glyph: "!",
    meaning: "Someone said so, and we have a link. A rumour with a citation. Nobody has checked it.",
  },
  {
    name: "preprint",
    glyph: "§",
    meaning: "A paper exists and can be read. It has not been refereed.",
  },
  {
    name: "published",
    glyph: "▣",
    meaning:
      "It appeared in a refereed venue. Worth noting that refereed proofs of famous conjectures have been retracted after publication.",
  },
  {
    name: "community accepted",
    glyph: "◈",
    meaning: "Experts in the area endorse it. Requires a named human reviewer here.",
  },
  {
    name: "machine-verified",
    glyph: "⛨",
    meaning:
      "A proof assistant kernel checked the proof against our canonical statement, with an axiom allowlist and a second independent kernel. This is the only tier no human opinion can grant.",
  },
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 font-serif text-2xl text-ink">{children}</h2>;
}

export default function AboutPage() {
  return (
    <article className="max-w-3xl space-y-4 leading-relaxed">
      <h1 className="font-serif text-3xl text-ink sm:text-4xl">Why this exists</h1>

      <p className="text-lg text-ink-muted">
        {SITE.name} has no <code className="bg-surface-2 px-1.5 py-0.5 font-mono text-sm">solved</code> column. That is
        deliberate. Mathematics is speeding up — machines search papers, models propose counterexamples, labs announce
        batches of results — and <strong className="text-ink">a single checkbox cannot carry what is happening</strong>.
        This site records claims in public so <strong className="text-ink">the history stays legible</strong>.
      </p>

      <H2>A year that changed the pace</H2>

      <p className="text-ink-muted">
        <strong className="text-ink">October 2025.</strong> An AI lab announced that a model had solved ten open Erdős
        problems. It had not. It had run a literature search and surfaced existing published proofs that the database
        curator had never catalogued. The posts were deleted. The deeper lesson: &ldquo;open&rdquo; in that database meant{" "}
        <em>the curator is unaware of a published solution,</em> and the announcement was{" "}
        <strong className="text-ink">mistaken</strong> for <em>no solution exists.</em>
      </p>

      <p className="text-ink-muted">
        <strong className="text-ink">July 2026.</strong> A compact counterexample to the Jacobian conjecture spread from
        social media across the mathematical world in days — discovered with{" "}
        <strong className="text-ink">AI assistance</strong>, checked by hand almost immediately, and widely treated as a
        breakthrough in how machines can participate in hard problems. It refutes the conjecture in three dimensions and
        above; dimension two is still open.
      </p>

      <p className="text-ink-muted">
        <strong className="text-ink">August 2026.</strong> OpenAI announced ten new results in mathematics and theoretical
        computer science in a single release — sphere-packing bounds, a non-sofic group, a counterexample to
        Connes&rsquo;s rigidity conjecture, and more, collected in{" "}
        <a href="https://github.com/openai/ten-proofs">openai/ten-proofs</a>. Unlike October 2025, these are claimed new
        results, not rediscoveries of old papers. <strong className="text-ink">The scale is what matters</strong>: one
        system producing serious mathematics across unrelated fields at once.
      </p>

      <p className="text-ink-muted">
        These three episodes are <strong className="text-ink">not the same kind of event</strong>. A literature lookup, a
        viral counterexample, and a batch of model-generated proofs should not share one status field — and they will keep
        arriving <strong className="text-ink">faster than any single curator can update a spreadsheet</strong>.
      </p>

      <H2>Claims, not statuses</H2>

      <p className="text-ink-muted">
        Each conjecture holds an <strong className="text-ink">append-only list of claims</strong>. A claim records who
        asserted what, where, when, over which scope, and how strongly it is evidenced. Nothing is ever edited or
        deleted: to withdraw a claim we mark it retracted and append a new one, so a correction shows up as{" "}
        <strong className="text-ink">history rather than a silent rewrite</strong>. The label you see on a conjecture page
        is computed from that list every time the site is built.
      </p>

      <p className="text-ink-muted">
        <strong className="text-ink">Finding an existing proof is its own claim type.</strong> A literature lookup is
        recorded as <em>resolved by prior literature</em>, never as <em>proved</em>. Both are useful; conflating them is
        what caused the October 2025 mess.
      </p>

      <H2>Evidence tiers</H2>

      <ul className="mt-2 space-y-3">
        {TIERS.map((tier) => (
          <li key={tier.name} className="ui-panel p-4">
            <p className="text-ink">
              <span aria-hidden="true" className="mr-2">
                {tier.glyph}
              </span>
              {tier.name}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{tier.meaning}</p>
          </li>
        ))}
      </ul>

      <H2>Why there is no tier for &ldquo;an AI checked it&rdquo;</H2>

      <p className="text-ink-muted">
        There is deliberately <strong className="text-ink">no evidence tier</strong> meaning &ldquo;a language model read
        the proof and thought it was fine.&rdquo; In 2026 benchmarking, the best-performing LLM proof judge passed{" "}
        <strong className="text-ink">38% of proofs that human experts judged flawed</strong>, and the characteristic
        failure mode is that the judge mentally repairs a missing step and then gives credit for it. Weaker judges were
        far worse.
      </p>

      <p className="text-ink-muted">
        Language models are used here to triage incoming sources, match claims to conjectures, and screen low-quality
        submissions. They can file a claim at the <em>unverified</em> tier. They{" "}
        <strong className="text-ink">cannot promote one</strong>, and they can{" "}
        <strong className="text-ink">never fill in the reviewer field</strong>.
      </p>

      <H2>What machine verification does and does not mean</H2>

      <p className="text-ink-muted">
        When a proof is <strong className="text-ink">machine-verified</strong>, a submitted Lean file was compiled in a
        sandbox and checked against our canonical statement using an allowlist of exactly three axioms —{" "}
        <code className="font-mono text-sm">propext</code>, <code className="font-mono text-sm">Quot.sound</code> and{" "}
        <code className="font-mono text-sm">Classical.choice</code> — with the resulting environment replayed through the
        kernel and an <strong className="text-ink">independent second kernel</strong>.
      </p>

      <p className="text-ink-muted">
        An <strong className="text-ink">allowlist rather than a blocklist</strong> matters. Blocking known-bad axiom names
        stopped working in Lean 4.29, which emits a uniquely-named axiom per native evaluation, and text-level filtering
        never worked at all: one benchmark submission smuggled in an axiom by{" "}
        <strong className="text-ink">building the word out of string concatenation</strong> so it never appeared in the
        source.
      </p>

      <p className="text-ink-muted">
        <strong className="text-ink">What it does not mean:</strong> that our statement says what you think it says. The
        formal statement is the real trusted base, and an audit of five widely-used formalization benchmarks found{" "}
        <strong className="text-ink">398 mechanically certified defects</strong> — vacuous theorems, missing hypotheses,
        mistranslated domains. So every formal statement here records whether a human has reviewed it, and unreviewed
        statements do not gate a verified proof.
      </p>

      <p className="text-ink-muted">
        One case can <strong className="text-ink">never be automated</strong>. If a challenge asks the solver to supply a
        definition, they can define that hole to be the conjecture itself and close the goal with{" "}
        <code className="font-mono text-sm">rfl</code>. Those are flagged and{" "}
        <strong className="text-ink">always require a human</strong>.
      </p>

      <H2>What &ldquo;open&rdquo; means here</H2>

      <p className="text-ink-muted">
        Before investing serious effort in anything listed as open, search the literature yourself. The future of the field
        is likely an <strong className="text-ink">ongoing conversation between papers, machines, and people</strong> who
        care about getting the statement right — moving faster than any one database can track, but still{" "}
        <strong className="text-ink">accountable to what was claimed and when</strong>. {SITE.name} is built for that
        conversation.
      </p>
    </article>
  );
}
