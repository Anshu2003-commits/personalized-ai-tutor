// Exercises the structural judge against the real catalog. It can't run user
// code, so it proves the judge is *sound*: the canonical display of every
// expected_output judges equal to that expected_output (no false negatives on a
// correct, canonically-formatted answer), nothing throws (the old `.trim()`
// crash on ~53 non-string outputs is gone), and a battery of hand-written cases
// pass/fail as intended.
//
//   node scripts/verify-judge.mjs
//
// Dependency-free: transpiles value.ts + judge.ts with the installed typescript.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webApp = join(__dirname, "..");
const root = join(webApp, "..");

function transpile(file) {
  const src = readFileSync(join(webApp, file), "utf8");
  return ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
  }).outputText;
}

const dir = mkdtempSync(join(tmpdir(), "judge-"));
writeFileSync(join(dir, "value.mjs"), transpile("lib/execution/value.ts"));
writeFileSync(
  join(dir, "judge.mjs"),
  // fix the extensionless relative import for Node ESM
  transpile("lib/execution/judge.ts").replace(/from "\.\/value"/g, 'from "./value.mjs"'),
);
const { judge } = await import(pathToFileURL(join(dir, "judge.mjs")).href);
const { toDisplay, parseValue } = await import(
  pathToFileURL(join(dir, "value.mjs")).href
);

let failures = 0;
const fail = (msg) => {
  failures++;
  if (failures <= 30) console.error("[FAIL] " + msg);
};

// ---- hand-written cases --------------------------------------------------
const cases = [
  // [actual, expected, shouldPass]
  ["30", "30", true],
  ["30", 30, true],
  ["[1, 2, 3]", "1 2 3", true], // Python print(*list) vs bracketed
  ["1 2 3", [1, 2, 3], true], // space-sep vs already-parsed array
  ["[[1, 0, 1], [0, 0, 0]]", "[[1, 0, 1], [0, 0, 0]]", true],
  ["True", true, true],
  ["false", false, true],
  ['["No", "Yes"]', ["No", "Yes"], true],
  ["null", null, true],
  ["3.0000001", 3, true], // within 1e-6
  ["First Number: 10\nSum: 30", "First Number: 10\nSum: 30", true], // free text
  // negatives
  ["[1, 2, 4]", [1, 2, 3], false],
  ["3.1", 3, false],
  ["oops", [1, 2, 3], false],
  ["True", false, false],
  ["hello", "world", false],
];
for (const [actual, expected, want] of cases) {
  let got;
  try {
    got = judge(actual, expected);
  } catch (e) {
    fail(`threw on (${JSON.stringify(actual)}, ${JSON.stringify(expected)}): ${e.message}`);
    continue;
  }
  if (got !== want) {
    fail(`judge(${JSON.stringify(actual)}, ${JSON.stringify(expected)}) = ${got}, want ${want}`);
  }
}

// ---- catalog soundness ---------------------------------------------------
let checked = 0;
let structural = 0;
let nonString = 0;
for (const trk of ["dsa", "ds"]) {
  const data = JSON.parse(
    readFileSync(join(root, `data/courses/${trk}/questions.json`), "utf8"),
  );
  const qs = Array.isArray(data) ? data : (data.questions ?? []);
  for (const q of qs) {
    for (const tc of q.test_cases ?? []) {
      const expected = tc.expected_output;
      if (typeof expected !== "string") nonString++;
      let display, ok;
      try {
        display = toDisplay(expected); // must not throw on non-strings
        ok = judge(display, expected); // canonical answer must be accepted
      } catch (e) {
        fail(`catalog ${trk}/${q.question_title}: threw - ${e.message}`);
        continue;
      }
      checked++;
      if (parseValue(expected).type !== "text") structural++;
      if (!ok) {
        fail(
          `catalog ${trk}/${q.question_title}: canonical ${JSON.stringify(display).slice(0, 60)} not accepted`,
        );
      }
    }
  }
}

console.log(
  `\nHand-written cases: ${cases.length}. Catalog expected outputs: ${checked} ` +
    `(${structural} structural, ${nonString} non-string). Failures: ${failures}.`,
);
process.exit(failures === 0 ? 0 : 1);
