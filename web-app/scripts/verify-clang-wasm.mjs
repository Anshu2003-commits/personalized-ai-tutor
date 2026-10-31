// Smoke-test generated C++ function-mode programs against binji/wasm-clang.
//
// This is runtime coverage, not algorithm correctness: each question gets a
// type-correct dummy function body, then we verify clang can compile/link/run
// the hidden driver and produce the ONLEARN_RESULT marker.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webApp = join(__dirname, "..");
const root = join(webApp, "..");
const clangRoot = join(webApp, "public/wasm/clang");
const RESULT_MARKER = "\x01ONLEARN_RESULT\x01";

const limit = Number(process.env.CLANG_WASM_LIMIT ?? 40);
const shapeCap = Number(process.env.CLANG_WASM_SHAPE_CAP ?? 1);

for (const file of ["shared.js", "clang", "lld", "memfs", "sysroot.tar"]) {
  const p = join(clangRoot, file);
  if (!existsSync(p)) {
    console.error(`Missing ${p}`);
    process.exit(1);
  }
}

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

const dir = mkdtempSync(join(tmpdir(), "clang-wasm-"));
writeFileSync(join(dir, "io.mjs"), `export const RESULT_MARKER = ${JSON.stringify(RESULT_MARKER)};\n`);
writeFileSync(
  join(dir, "boilerplate.mjs"),
  transpile("lib/boilerplate.ts", [['from "./execution/io"', 'from "./io.mjs"']]),
);

const { generateDriver } = await import(pathToFileURL(join(dir, "boilerplate.mjs")).href);

vm.runInThisContext(
  readFileSync(join(clangRoot, "shared.js"), "utf8") + "\nglobalThis.__WasmClangAPI = API;\n",
  { filename: "shared.js" },
);

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

const api = new globalThis.__WasmClangAPI({
  async readBuffer(name) {
    const bytes = readFileSync(join(clangRoot, name));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  },
  async compileStreaming(name) {
    return WebAssembly.compile(readFileSync(join(clangRoot, name)));
  },
  hostWrite() {},
});
await api.ready;

let seq = 0;

async function compileRun(source, stdin) {
  const id = seq++;
  const input = `verify_${id}.cc`;
  const obj = `verify_${id}.o`;
  const wasm = `verify_${id}.wasm`;
  let phase = "compile";
  let compilerLog = "";
  let output = "";
  const capture = (text) => {
    const clean = stripAnsi(text);
    if (phase === "run") {
      if (clean.startsWith("> ")) compilerLog += clean;
      else output += clean;
    } else {
      compilerLog += clean;
    }
  };
  api.hostWrite = capture;
  api.memfs.hostWrite = capture;

  try {
    api.memfs.addFile(input, source);
    const clang = await api.getModule("clang");
    await api.run(
      clang,
      "clang",
      "-cc1",
      "-emit-obj",
      ...api.clangCommonArgs,
      "-std=c++17",
      "-O2",
      "-o",
      obj,
      "-x",
      "c++",
      input,
    );
    await api.link(obj, wasm);
    api.memfs.setStdinStr(stdin);
    const mod = await WebAssembly.compile(new Uint8Array(api.memfs.getFileContents(wasm)));
    phase = "run";
    await api.run(mod, wasm);
    return { ok: output.includes(RESULT_MARKER), output, compilerLog };
  } catch (error) {
    return {
      ok: false,
      output,
      compilerLog,
      error: error instanceof Error ? error.message : String(error),
      phase,
    };
  }
}

function parseType(raw) {
  const t = raw.trim();
  if (t.startsWith("list<") && t.endsWith(">")) return { kind: "list", of: parseType(t.slice(5, -1)) };
  if (t === "ListNode" || t === "TreeNode") return { kind: "node", name: t };
  return { kind: "scalar", name: t };
}

function cppType(t) {
  if (t.kind === "node") return `${t.name}*`;
  if (t.kind === "list") return `vector<${cppType(t.of)}>`;
  if (t.name === "string") return "string";
  if (t.name === "bool") return "bool";
  if (t.name === "float") return "float";
  if (t.name === "double") return "double";
  if (t.name === "char") return "char";
  return "int";
}

function zeroValue(t) {
  if (t.kind === "node") return "nullptr";
  if (t.kind === "list") return "{}";
  if (t.name === "string") return '""';
  if (t.name === "bool") return "false";
  if (t.name === "char") return "'\\0'";
  if (t.name === "float" || t.name === "double") return "0.0";
  return "0";
}

function functionBody(sig) {
  const ret = parseType(sig.output_fields?.[0]?.type ?? "int");
  const inputs = sig.input_fields ?? [];
  const matching = inputs.find((f) => f.type === sig.output_fields?.[0]?.type);
  const params = inputs.map((f) => `${cppType(parseType(f.type))} ${f.name}`).join(", ");
  return [
    `${cppType(ret)} ${sig.function_name}(${params}) {`,
    `  return ${matching ? matching.name : zeroValue(ret)};`,
    "}",
    "",
  ].join("\n");
}

const data = JSON.parse(readFileSync(join(root, "data/courses/dsa/questions.json"), "utf8"));
const questions = Array.isArray(data) ? data : data.questions ?? [];
const seenShapes = new Map();
const selected = [];

for (const q of questions) {
  const sig = q.structure;
  const outType = sig?.output_fields?.[0]?.type;
  const tc = q.test_cases?.[0];
  if (!sig || !outType || outType === "void" || !tc) continue;
  const shape = JSON.stringify([(sig.input_fields ?? []).map((f) => f.type), outType]);
  const n = seenShapes.get(shape) ?? 0;
  if (n >= shapeCap) continue;
  seenShapes.set(shape, n + 1);
  selected.push({ q, shape });
  if (selected.length >= limit) break;
}

let passed = 0;
const failures = [];

for (const [i, { q, shape }] of selected.entries()) {
  const driver = generateDriver("cpp", q.structure);
  const source = `${driver.prefix}\n${functionBody(q.structure)}\n${driver.suffix}`;
  const input = String(q.test_cases[0].input ?? "");
  const result = await compileRun(source, input);
  if (result.ok) {
    passed++;
    console.log(`[PASS] ${i + 1}/${selected.length} ${q.question_id} ${q.question_title}`);
  } else {
    failures.push({ q, shape, result });
    const msg = result.error ? `${result.phase}: ${result.error}` : "missing result marker";
    console.log(`[FAIL] ${i + 1}/${selected.length} ${q.question_id} ${q.question_title} - ${msg}`);
    const detail = (result.phase === "run" ? result.output : result.compilerLog).trim();
    if (detail) console.log(detail.split("\n").slice(-6).join("\n"));
  }
}

console.log(`\nclang-wasm smoke: ${passed}/${selected.length} passed, ${failures.length} failed.`);
if (failures.length) {
  console.log("Failed shapes:");
  for (const f of failures.slice(0, 20)) {
    console.log(`- ${f.q.question_id}: ${f.shape}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
