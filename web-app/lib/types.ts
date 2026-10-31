// Track slugs are first-class N-extensible identifiers
// (see [[onlearn-track-expansion-plan]] memory).
// Launch with "dsa" + "ds"; more added post-launch.
export type TrackSlug = "dsa" | "ds";

export const TRACKS: { slug: TrackSlug; title: string; tagline: string }[] = [
  { slug: "dsa", title: "DSA", tagline: "Data Structures & Algorithms" },
  { slug: "ds", title: "Data Science", tagline: "Data Science" },
];

export type Difficulty = "easy" | "medium" | "hard";

export type TestCase = {
  input: string;
  expected_output: string;
  is_sample: boolean;
};

export type FunctionSignature = {
  problem_name: string;
  function_name: string;
  input_fields: { type: string; name: string }[];
  output_fields: { type: string; name: string }[];
};

// DS catalog stores `example` as an object; one question uses `explanation`
// instead of `reasoning`. DSA questions have no example field at all.
export type QuestionExample = {
  input?: string;
  output?: string;
  reasoning?: string;
  explanation?: string;
};

export type SolutionApproach = {
  approach_name?: string;
  explanation?: string;
};

export type Question = {
  question_id: string;
  track: TrackSlug;
  step_no: number;
  step_title: string;
  sub_step_no: number;
  sub_step_title: string;
  sl_no: number;
  question_title: string;
  difficulty: Difficulty;
  question: string;
  question_topic?: string;
  concepts?: string[];
  standard_concepts?: string[];
  sub_concepts?: string[];
  test_cases?: TestCase[];
  solution_approaches?: SolutionApproach[];
  // DSA coding questions carry a function signature; conceptual / implementation
  // questions and DS questions do not.
  structure?: FunctionSignature;
  has_code?: boolean;
  // DS-specific (and a few DSA implementation problems): seed the editor with
  // this code rather than generating from structure.
  starter_code?: string;
  // DS-specific: reference solution. Blur-gated in the Solutions tab.
  solution?: string;
  example?: QuestionExample | string;
};

// Lightweight per-question metadata the server passes to client views so
// navigation UI can show real titles without fetching every question body.
export type QuestionMeta = {
  id: string;
  title: string;
  difficulty: Difficulty;
};

export type Topic = {
  slug: string;
  track: TrackSlug;
  step_no: number;
  sub_step_no: number;
  step_title: string;
  title: string;
  question_ids: string[];
};
