const POINTS = [
  {
    title: "A curated curriculum, not a grind",
    body: "440 DSA and 631 Data Science problems, ordered step by step from fundamentals up. You always know what to do next - unlike a wall of unsorted problems.",
  },
  {
    title: "A mentor, not an answer key",
    body: "The AI is Socratic by default: it asks before it explains, offers hints before solutions, and reasons through test failures with you. Closer to a senior engineer than a chatbot.",
  },
  {
    title: "Real code, real tests",
    body: "Run Python in your browser for free. Upgrade for multi-language execution against full test suites - the same way your code gets judged for real.",
  },
  {
    title: "Progress that compounds",
    body: "Every problem solved fills in your roadmap and feeds your streak. Show up daily; watch consistency turn into mastery.",
  },
];

export default function WhyOnlearn() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Not Duolingo. Not LeetCode. Not Coursera.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Open-ended sessions on real problems, a guided path, and a mentor
            who actually teaches. We took the good parts and left the rest.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {POINTS.map((p) => (
            <div key={p.title} className="border-l border-border pl-5">
              <h3 className="text-base font-medium tracking-tight">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
