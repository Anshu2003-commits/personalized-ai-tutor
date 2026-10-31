import { cn } from "@/lib/utils";

// COPY: this is a placeholder exchange - replace with a real one (or swap the
// whole block for a screenshot via <Screenshot/>). The point is to *show* the
// mentor asking instead of answering, not to describe it.
const EXCHANGE: { role: "you" | "mentor"; text: string }[] = [
  { role: "you", text: "I think I need a nested loop here?" },
  {
    role: "mentor",
    text: "Before you write it - what's the cost of scanning the rest of the array for every element? Is there anything you're recomputing each pass?",
  },
  {
    role: "you",
    text: "Oh… I'm re-searching for the complement every time. A hash map would make it O(n).",
  },
  {
    role: "mentor",
    text: "Exactly. Want to try it? Think about what you'd store as the key and what you'd look up.",
  },
];

export default function MentorDemo() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:items-center">
        <div className="max-w-md">
          {/* COPY */}
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            A mentor that asks, not answers.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Get stuck and it doesn&apos;t hand you the solution - it asks the
            question that gets you there yourself. The way a good senior
            engineer would.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:p-6">
          {EXCHANGE.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "you" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                  m.role === "you"
                    ? "bg-foreground text-background"
                    : "border border-border bg-muted/20 text-foreground",
                )}
              >
                {m.role === "mentor" && (
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Mentor
                  </span>
                )}
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
