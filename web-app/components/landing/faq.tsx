import { Plus } from "lucide-react";

const FAQS = [
  {
    q: "Is Onlearn free?",
    a: "Yes. All content, in-browser code execution, and your full progress and streak are free forever. The AI mentor is metered at 100 messages a week on the free plan; upgrade for unlimited.",
  },
  {
    q: "How is this different from LeetCode?",
    a: "LeetCode is a wall of problems you grind alone. Onlearn is a curated curriculum - problems ordered into a roadmap - with a Socratic AI mentor on every single one. You build a habit, not just a solved-count.",
  },
  {
    q: "What does the AI mentor actually do?",
    a: "It guides you Socratically: asking questions, offering hints before solutions, reviewing your code, and reasoning about test failures with you. It's there to help you understand, not to hand you the answer.",
  },
  {
    q: "What can I practice?",
    a: "Two tracks at launch: Data Structures & Algorithms (440 problems) and Data Science (631 problems), ordered from fundamentals to advanced. More tracks are on the way.",
  },
  {
    q: "Which languages can I use?",
    a: "Python runs in your browser for free. A paid plan unlocks multi-language code execution against full test suites for the DSA track.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. Sign up and start solving immediately. You only pay when you choose to upgrade for unlimited AI mentoring and multi-language execution.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Questions, answered.
        </h2>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="pb-4 text-sm leading-6 text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
