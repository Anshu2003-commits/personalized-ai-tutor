// End-to-end verification of the function-mode drivers for the two runtimes we
// can run here: Python (via the system python3) and JavaScript (via the pure
// js-runtime core, the same code the worker uses). For every DSA question with a
// structured, non-void output it generates the driver, wraps a type-appropriate
// dummy function, feeds a real test-case stdin, and asserts the program runs,
// emits the RESULT_MARKER, and produces parseable canonical output - i.e. the
// readers don't crash on real input formats and serialization works. Then a set
// of hand-written round-trip cases (return arg / a+b) checks the parsed values
// are actually correct. See EXECUTION_V2.md.
//
//   node scripts/verify-driver.mjs

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webApp = join(__dirname, "..");
const root = join(webApp, "..");

function transpile(file, rewrites = []) {
  const src = readFileSync(join(webApp, file), "utf8");
  let out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
  }).outputText;
  for (const [from, to] of rewrites) out = out.split(from).join(to);
  return out;
}

const dir = mkdtempSync(join(tmpdir(), "driver-"));
writeFileSync(join(dir, "value.mjs"), transpile("lib/execution/value.ts"));
writeFileSync(
  join(dir, "io.mjs"),
  transpile("lib/execution/io.ts", [['from "./value"', 'from "./value.mjs"']]),
);
writeFileSync(
  join(dir, "judge.mjs"),
  transpile("lib/execution/judge.ts", [['from "./value"', 'from "./value.mjs"']]),
);
writeFileSync(
  join(dir, "boilerplate.mjs"),
  transpile("lib/boilerplate.ts", [['from "./execution/io"', 'from "./io.mjs"']]),
);
writeFileSync(join(dir, "js-runtime.mjs"), transpile("lib/execution/js-runtime.ts"));

const { generateDriver, generateStub, generateBoilerplate } = await import(
  pathToFileURL(join(dir, "boilerplate.mjs")).href
);
const { judge } = await import(pathToFileURL(join(dir, "judge.mjs")).href);
const { parseInputsForDisplay, extractResult } = await import(
  pathToFileURL(join(dir, "io.mjs")).href
);
const { runJsProgram } = await import(pathToFileURL(join(dir, "js-runtime.mjs")).href);

let failures = 0;
const fail = (m) => {
  failures++;
  if (failures <= 25) console.error("[FAIL] " + m);
};

function dummyReturn(lang, type) {
  const t = (type || "void").trim();
  if (t.startsWith("list<")) return "[]";
  if (t === "ListNode" || t === "TreeNode") return lang === "python" ? "None" : "null";
  if (t === "int") return "0";
  if (t === "float" || t === "double") return lang === "python" ? "0.0" : "0";
  if (t === "bool") return lang === "python" ? "True" : "true";
  return lang === "python" ? "''" : "''";
}

function buildFn(lang, name, argNames, bodyExpr) {
  const args = argNames.join(", ");
  return lang === "python"
    ? `def ${name}(${args}):\n    return ${bodyExpr}\n`
    : `function ${name}(${args}) { return ${bodyExpr}; }\n`;
}

function runProgram(lang, program, stdin) {
  if (lang === "python") {
    try {
      const out = execFileSync("python3", ["-c", program], {
        input: stdin,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { ok: true, stdout: out };
    } catch (e) {
      return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message };
    }
  }
  const r = runJsProgram(program, stdin);
  return { ok: r.status_id === 3, stdout: r.stdout, stderr: r.stderr };
}

// ---- hand-written round-trips (value correctness) ------------------------
const roundTrips = [
  { sig: { function_name: "f", input_fields: [{ type: "list<int>", name: "a" }], output_fields: [{ type: "list<int>", name: "r" }] }, body: "a", stdin: "3\n1 2 3", expect: "[1, 2, 3]" },
  { sig: { function_name: "f", input_fields: [{ type: "int", name: "a" }, { type: "int", name: "b" }], output_fields: [{ type: "int", name: "r" }] }, body: "a + b", stdin: "10\n20", expect: "30" },
  { sig: { function_name: "f", input_fields: [{ type: "list<list<int>>", name: "m" }], output_fields: [{ type: "list<list<int>>", name: "r" }] }, body: "m", stdin: "2 2\n1 2\n3 4", expect: "[[1, 2], [3, 4]]" },
  { sig: { function_name: "f", input_fields: [{ type: "ListNode", name: "h" }], output_fields: [{ type: "ListNode", name: "r" }] }, body: "h", stdin: "3\n0 1 2", expect: "[0, 1, 2]" },
  { sig: { function_name: "f", input_fields: [{ type: "TreeNode", name: "t" }], output_fields: [{ type: "TreeNode", name: "r" }] }, body: "t", stdin: "3\n1 2 3", expect: "[1, 2, 3]" },
  { sig: { function_name: "f", input_fields: [{ type: "string", name: "s" }], output_fields: [{ type: "string", name: "r" }] }, body: "s", stdin: "hello", expect: "hello" },
];
for (const lang of ["python", "javascript"]) {
  for (const rt of roundTrips) {
    const d = generateDriver(lang, rt.sig);
    const fn = buildFn(lang, "f", rt.sig.input_fields.map((f) => f.name), rt.body);
    const res = runProgram(lang, d.prefix + fn + d.suffix, rt.stdin);
    if (!res.ok) {
      fail(`${lang} round-trip ${JSON.stringify(rt.stdin)} errored: ${(res.stderr || "").slice(0, 120)}`);
      continue;
    }
    const { answer } = extractResult(res.stdout);
    if (!judge(answer, rt.expect)) {
      fail(`${lang} round-trip ${JSON.stringify(rt.stdin)} => ${JSON.stringify(answer)}, want ${rt.expect}`);
    }
  }
}

// ---- catalog soundness (readers don't crash; output parseable) -----------
const data = JSON.parse(readFileSync(join(root, "data/courses/dsa/questions.json"), "utf8"));
const qs = Array.isArray(data) ? data : (data.questions ?? []);
const counts = { python: 0, javascript: 0 };
for (const lang of ["python", "javascript"]) {
  for (const q of qs) {
    const s = q.structure;
    const outType = s?.output_fields?.[0]?.type;
    if (!s || !outType || outType === "void") continue; // function mode only
    const tc = (q.test_cases ?? [])[0];
    if (!tc) continue;
    const stdin = typeof tc.input === "string" ? tc.input : String(tc.input);
    const d = generateDriver(lang, s);
    const fn = buildFn(lang, s.function_name, s.input_fields.map((f) => f.name), dummyReturn(lang, outType));
    const res = runProgram(lang, d.prefix + fn + d.suffix, stdin);
    counts[lang]++;
    if (!res.ok) {
      fail(`${lang} ${q.question_title}: driver errored - ${(res.stderr || "").trim().split("\n").pop()}`);
      continue;
    }
    const { answer } = extractResult(res.stdout);
    if (!answer.length && answer !== "") fail(`${lang} ${q.question_title}: no marker output`);
  }
}

// sanity: the display parser shouldn't throw on real inputs
let displayChecked = 0;
for (const q of qs) {
  const s = q.structure;
  if (!s) continue;
  const tc = (q.test_cases ?? [])[0];
  if (!tc || typeof tc.input !== "string") continue;
  try {
    parseInputsForDisplay(s, tc.input);
    displayChecked++;
  } catch (e) {
    fail(`display parse ${q.question_title}: ${e.message}`);
  }
}

// ---- C++ (compiled + run with g++) ---------------------------------------
// The function-mode driver logic is identical whether g++ or clang-wasm
// compiles it, so g++ verifies the readers + serialization end-to-end. Catalog
// coverage is deduped by signature shape (one compile per unique type combo)
// and capped, since each g++ compile of <bits/stdc++.h> is ~1-2s.
const CPP_SHAPE_CAP = Number(process.env.CPP_SHAPE_CAP ?? 80);

function cppProgram(sig, body) {
  const d = generateDriver("cpp", sig);
  let fn = generateStub("cpp", sig);
  if (body != null)
    fn = fn.replace("    // Your code here\n    return {};", `    return ${body};`);
  return d.prefix + "\n" + fn + "\n" + d.suffix;
}
function runCpp(program, stdin) {
  const src = join(dir, "p.cpp");
  writeFileSync(src, program);
  try {
    execFileSync("g++", ["-std=c++17", "-O0", "-w", "-o", join(dir, "p_exe"), src], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    return {
      ok: false,
      stderr: "compile: " + (e.stderr || e.message || "").toString().split("\n").filter(Boolean).slice(0, 2).join(" | "),
    };
  }
  try {
    return { ok: true, stdout: execFileSync(join(dir, "p_exe"), { input: stdin, encoding: "utf8" }) };
  } catch (e) {
    return { ok: false, stdout: e.stdout ?? "", stderr: (e.stderr || e.message).toString() };
  }
}

let cppRt = 0;
for (const rt of roundTrips) {
  const res = runCpp(cppProgram(rt.sig, rt.body), rt.stdin);
  if (!res.ok) {
    fail(`cpp round-trip ${JSON.stringify(rt.stdin)}: ${(res.stderr || "").slice(0, 140)}`);
    continue;
  }
  const { answer } = extractResult(res.stdout);
  if (!judge(answer, rt.expect))
    fail(`cpp round-trip ${JSON.stringify(rt.stdin)} => ${JSON.stringify(answer)}, want ${rt.expect}`);
  cppRt++;
}

const seenShapes = new Set();
let cppCatalog = 0;
for (const q of qs) {
  const s = q.structure;
  const outType = s?.output_fields?.[0]?.type;
  if (!s || !outType || outType === "void") continue;
  const shape = JSON.stringify([(s.input_fields || []).map((f) => f.type), outType]);
  if (seenShapes.has(shape)) continue;
  seenShapes.add(shape);
  if (cppCatalog >= CPP_SHAPE_CAP) continue;
  const tc = (q.test_cases ?? [])[0];
  if (!tc) continue;
  const stdin = typeof tc.input === "string" ? tc.input : String(tc.input);
  const res = runCpp(cppProgram(s, null), stdin);
  cppCatalog++;
  if (!res.ok) {
    fail(`cpp ${q.question_title} [${shape}]: ${(res.stderr || "").slice(0, 160)}`);
    continue;
  }
  const { answer } = extractResult(res.stdout);
  if (answer == null) fail(`cpp ${q.question_title}: no marker output`);
}

// ---- Go (run the generated stdio program through the actual yaegi.wasm) ----
// Gated on the built asset (skipped on a fresh checkout). Guards the fmt.Scan
// reader + the run-once fix in runtimes/go/main.go against regression.
const GO_WASM = join(webApp, "public/wasm/go/yaegi.wasm");
const GO_SHIM = join(webApp, "public/wasm/go/wasm_exec.js");
let goRan = 0;
let goSkipped = "";
if (existsSync(GO_WASM) && existsSync(GO_SHIM)) {
  vm.runInThisContext(readFileSync(GO_SHIM, "utf8")); // defines globalThis.Go
  const go = new globalThis.Go();
  const { instance } = await WebAssembly.instantiate(readFileSync(GO_WASM), go.importObject);
  go.run(instance);
  let t = 0;
  while (typeof globalThis.__yaegiRun === "undefined" && t++ < 600)
    await new Promise((r) => setTimeout(r, 15));
  if (typeof globalThis.__yaegiRun === "undefined") {
    fail("go: yaegi.wasm never published __yaegiRun");
  } else {
    const inject = (prog, body) =>
      prog.replace(/\t\/\/ Your code here\n(\treturn [^\n]*\n)?/, `\t${body}\n`);
    // Go is stdio mode; nodes aren't parsed there, so cover scalar/list/matrix/string.
    const goCases = [
      { sig: { function_name: "f", input_fields: [{ type: "int", name: "a" }, { type: "int", name: "b" }], output_fields: [{ type: "int", name: "r" }] }, body: "return a + b", stdin: "10\n20", exp: "30" },
      { sig: { function_name: "f", input_fields: [{ type: "list<int>", name: "a" }, { type: "int", name: "k" }], output_fields: [{ type: "list<int>", name: "r" }] }, body: "return append(a, k)", stdin: "3\n1 2 3\n9", exp: "[1, 2, 3, 9]" },
      { sig: { function_name: "f", input_fields: [{ type: "list<list<int>>", name: "m" }], output_fields: [{ type: "int", name: "r" }] }, body: "s:=0; for _,row:=range m { for _,x:=range row { s+=x } }; return s", stdin: "2 2\n1 2\n3 4", exp: "10" },
      { sig: { function_name: "f", input_fields: [{ type: "string", name: "s" }], output_fields: [{ type: "string", name: "r" }] }, body: 'return s + "!"', stdin: "hi", exp: "hi!" },
    ];
    for (const c of goCases) {
      const res = globalThis.__yaegiRun(inject(generateBoilerplate("go", c.sig), c.body), c.stdin);
      if (!res.ok || !judge((res.stdout || "").trim(), c.exp))
        fail(`go ${JSON.stringify(c.stdin)} => ${JSON.stringify((res.stdout || "").trim())} (ok=${res.ok}), want ${c.exp}`);
      else goRan++;
    }
  }
} else {
  goSkipped = " (skipped: build runtimes/go first)";
}

console.log(
  `\nRound-trips: python+js ${roundTrips.length * 2}, cpp ${cppRt}. ` +
    `Catalog drivers run: python ${counts.python}, js ${counts.javascript}, ` +
    `cpp ${cppCatalog} unique shapes (cap ${CPP_SHAPE_CAP}). ` +
    `Go programs: ${goRan}${goSkipped}. ` +
    `Display parses: ${displayChecked}. Failures: ${failures}.`,
);
process.exit(failures === 0 ? 0 : 1);
