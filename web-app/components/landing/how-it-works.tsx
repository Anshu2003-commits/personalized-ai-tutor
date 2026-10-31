import Screenshot from "@/components/landing/screenshot";

const STEPS = [
  {
    n: "01",
    title: "Pick a topic",
    body: "Open the roadmap and choose a topic, or pick up where you left off. No diagnostic, no setup - you're solving in seconds.",
    src: "/landing/step-roadmap.png",
    shot: "Roadmap - pick a topic",
  },
  {
    n: "02",
    title: "Solve real problems",
    body: "Real coding problems, ordered into a curriculum instead of a random pile. Write code and run it against real test cases.",
    src: "/landing/step-editor-tests.png",
    shot: "Editor - code running against tests",
  },
  {
    n: "03",
    title: "Never get stuck alone",
    body: "A Socratic AI mentor nudges you toward the answer instead of handing it over. The moment you're stuck, it's already there.",
    src: "/landing/step-mentor.png",
    shot: "Mentor - a hint, not the answer",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One question. Day done.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The daily ritual is simple: open the roadmap, solve at least one
            problem, keep the streak alive.
          </p>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex flex-col bg-background p-6">
              <span className="font-mono text-xs text-muted-foreground">
                {s.n}
              </span>
              <h3 className="mt-4 text-base font-medium tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {s.body}
              </p>
              <Screenshot
                className="mt-5"
                src={s.src}
                alt={s.shot}
                width={1916}
                height={961}
                ratio="1916 / 961"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
