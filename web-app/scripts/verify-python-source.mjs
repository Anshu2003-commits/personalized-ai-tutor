// Guards the Python source hygiene used before editor display and Pyodide runs.
// The main regression: catalog starter code may use tabs, while students type
// spaces. Python can reject that mixed indentation even when it looks aligned.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webApp = join(__dirname, "..");

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

const dir = mkdtempSync(join(tmpdir(), "py-source-"));
writeFileSync(
  join(dir, "python-source.mjs"),
  transpile("lib/execution/python-source.ts"),
);
writeFileSync(join(dir, "value.mjs"), transpile("lib/execution/value.ts"));
writeFileSync(
  join(dir, "io.mjs"),
  transpile("lib/execution/io.ts", [['from "./value"', 'from "./value.mjs"']]),
);
writeFileSync(
  join(dir, "boilerplate.mjs"),
  transpile("lib/boilerplate.ts", [['from "./execution/io"', 'from "./io.mjs"']]),
);
writeFileSync(
  join(dir, "editor-languages.mjs"),
  transpile("lib/execution/editor-languages.ts"),
);
writeFileSync(
  join(dir, "program.mjs"),
  transpile("lib/execution/program.ts", [
    ['from "@/lib/boilerplate"', 'from "./boilerplate.mjs"'],
    ['from "./editor-languages"', 'from "./editor-languages.mjs"'],
    ['from "./python-source"', 'from "./python-source.mjs"'],
  ]),
);

const {
  appendPythonIndentationHint,
  isPythonCompileError,
  normalizePythonSourceWhitespace,
} = await import(pathToFileURL(join(dir, "python-source.mjs")).href);
const { prepareProgram, starterFor } = await import(
  pathToFileURL(join(dir, "program.mjs")).href
);

function assertPythonCompiles(source) {
  execFileSync("python3", ["-c", `compile(${JSON.stringify(source)}, "<student>", "exec")`]);
}

const mixedIndent = "def f():\n\tpass\n    return 1\n";
const normalized = normalizePythonSourceWhitespace(mixedIndent);
assert.equal(normalized, "def f():\n    pass\n    return 1\n");
assertPythonCompiles(normalized);

assert.equal(
  starterFor("python", { track: "ds", starterCode: mixedIndent }),
  normalized,
);

const functionStructure = {
  function_name: "f",
  input_fields: [],
  output_fields: [{ type: "int", name: "result" }],
};
const prepared = prepareProgram(
  "python",
  { track: "dsa", structure: functionStructure },
  mixedIndent,
  "",
);
assert.ok(!prepared.program.includes("\tpass"));
assertPythonCompiles(prepared.program);

assert.equal(
  normalizePythonSourceWhitespace("def f():\n\u00a0\u00a0return 1\r\n"),
  "def f():\n  return 1\n",
);
assert.equal(
  normalizePythonSourceWhitespace("value = 'a\tb'\n"),
  "value = 'a\tb'\n",
);
assert.equal(
  normalizePythonSourceWhitespace("\uFEFFdef f():\n\u200B    return 1\n"),
  "def f():\n    return 1\n",
);

assert.equal(isPythonCompileError("SyntaxError: invalid syntax"), true);
assert.equal(isPythonCompileError("IndentationError: unexpected indent"), true);
assert.equal(isPythonCompileError("TabError: inconsistent use of tabs and spaces"), true);
assert.equal(isPythonCompileError("ValueError: bad value"), false);

const hinted = appendPythonIndentationHint("IndentationError: unexpected indent");
assert.ok(hinted.includes("Onlearn hint:"));
assert.equal(appendPythonIndentationHint("ValueError: bad value"), "ValueError: bad value");

console.log("Python source normalization verified.");
