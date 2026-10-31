// Sanity-checks the multi-language starter-code generator against the real DSA
// catalog: every question with a `structure` must produce non-empty, balanced,
// signature-bearing code in every supported language. It cannot compile the
// output (no toolchains here) - it guards against generator regressions
// (unbalanced braces/parens, missing function name, empty output, throws).
//
//   node scripts/verify-boilerplate.mjs            # check
//   SHOW_SAMPLES=1 node scripts/verify-boilerplate.mjs   # also print one sample/lang
//
// Dependency-free: transpiles lib/boilerplate.ts with the installed `typescript`
// package (type-only imports are erased), then imports the emitted module.

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webApp = join(__dirname, "..");
const root = join(webApp, "..");

const LANGS = ["python", "cpp", "c", "go", "java"];

function balanced(code, open, close) {
  let d = 0;
  for (const ch of code) {
    if (ch === open) d++;
    else if (ch === close) d--;
    if (d < 0) return false;
  }
  return d === 0;
}

// Transpile boilerplate.ts + its runtime deps (io -> value) to ESM and import.
function transpile(file, rewrites = []) {
  let out = ts.transpileModule(readFileSync(join(webApp, file), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
  }).outputText;
  for (const [from, to] of rewrites) out = out.split(from).join(to);
  return out;
}
const dir = mkdtempSync(join(tmpdir(), "boil-"));
writeFileSync(join(dir, "value.mjs"), transpile("lib/execution/value.ts"));
writeFileSync(
  join(dir, "io.mjs"),
  transpile("lib/execution/io.ts", [['from "./value"', 'from "./value.mjs"']]),
);
writeFileSync(
  join(dir, "boilerplate.mjs"),
  transpile("lib/boilerplate.ts", [['from "./execution/io"', 'from "./io.mjs"']]),
);
const { generateBoilerplate } = await import(
  pathToFileURL(join(dir, "boilerplate.mjs")).href
);

const data = JSON.parse(
  readFileSync(join(root, "data/courses/dsa/questions.json"), "utf8"),
);
const questions = Array.isArray(data) ? data : (data.questions ?? []);

let checked = 0;
let failures = 0;
const sampleByLang = {};

for (const q of questions) {
  const s = q.structure;
  if (!s) continue;
  for (const lang of LANGS) {
    let code;
    try {
      code = generateBoilerplate(lang, s);
    } catch (e) {
      failures++;
      console.error(`[THROW] ${lang} / ${q.question_title}: ${e.message}`);
      continue;
    }
    checked++;
    const problems = [];
    if (!code || code.trim().length === 0) problems.push("empty");
    if (!code.includes(s.function_name)) problems.push("missing fn name");
    if (lang !== "python" && !balanced(code, "{", "}"))
      problems.push("unbalanced {}");
    if (!balanced(code, "(", ")")) problems.push("unbalanced ()");
    if (problems.length) {
      failures++;
      if (failures <= 20)
        console.error(
          `[FAIL] ${lang} / ${q.question_title} (${(s.input_fields ?? [])
            .map((f) => f.type)
            .join(",")} -> ${s.output_fields?.[0]?.type ?? "void"}): ${problems.join(", ")}`,
        );
    }
    if (!sampleByLang[lang]) sampleByLang[lang] = code;
  }
}

console.log(
  `\nGenerated ${checked} stubs across ${LANGS.length} languages; ${failures} failure(s).`,
);

if (process.env.SHOW_SAMPLES) {
  for (const lang of LANGS) {
    console.log(`\n================ ${lang} ================`);
    console.log(sampleByLang[lang]);
  }
}

process.exit(failures === 0 ? 0 : 1);
