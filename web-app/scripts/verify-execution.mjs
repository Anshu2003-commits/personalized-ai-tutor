// Headless proof that the Tier-1 "runs on the user's machine" WASM model works
// end-to-end -- here for Python via Pyodide, the exact runtime the repo already
// uses in app/workers/pyodide.worker.ts. Pyodide ships prebuilt and runs under
// Node, so this is a faithful stand-in for the browser Worker.
//
// Usage (after `npm i -D pyodide@0.27.7` or pointing PYODIDE_PKG at an install):
//   node scripts/verify-execution.mjs
//
// The other Tier-1 runtimes (Yaegi/Go, clang/C-C++, dotnet/C#) need their WASM
// artifacts built with toolchains absent from this environment, so they are
// covered by docs + glue rather than this harness. See CLIENT_SIDE_EXECUTION.md.

const PYODIDE_PKG = process.env.PYODIDE_PKG || "pyodide";

async function main() {
  const { loadPyodide } = await import(PYODIDE_PKG);
  const t0 = Date.now();
  const py = await loadPyodide();
  console.log(`[ok] Pyodide booted in ${((Date.now() - t0) / 1000).toFixed(2)}s`);

  // A DSA-shaped program: read stdin, compute, print stdout -- the same I/O
  // contract Judge0 uses, so results are interchangeable across tiers.
  const code = `
import sys
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
data = sys.stdin.read().split()
target = int(data[0]); nums = list(map(int, data[1:]))
print(*two_sum(nums, target))
`;
  const stdin = "9 2 7 11 15";

  let stdout = "";
  py.setStdout({ batched: (t) => (stdout += t + "\n") });
  py.globals.set("_stdin_text", stdin);
  await py.runPython("import sys, io\nsys.stdin = io.StringIO(_stdin_text)");
  await py.runPythonAsync(code);

  const got = stdout.trim();
  const expected = "0 1";
  console.log(`[python] stdin="${stdin}" -> stdout="${got}" (expected "${expected}")`);
  if (got !== expected) {
    console.error("[FAIL] Python client-side execution produced wrong output");
    process.exit(1);
  }
  console.log("[PASS] Python runs entirely client-side via WASM.");

  // --- numpy + pandas: the DS-track scientific stack, prebuilt WASM wheels ---
  // Read the value via the last-expression return (not stdout) to avoid catching
  // Pyodide's package-loader log lines.
  const sci = `
import numpy as np, pandas as pd
df = pd.DataFrame({"x": np.arange(1, 6)})
df["sq"] = df["x"] ** 2
int(df["sq"].sum())
`;
  const tSci = Date.now();
  await py.loadPackagesFromImports(sci); // resolves numpy + pandas WASM wheels on demand
  const sciVal = await py.runPythonAsync(sci);
  console.log(
    `[numpy+pandas] sum of squares 1..5 -> ${sciVal} (expected 55), loaded+ran in ${((Date.now() - tSci) / 1000).toFixed(1)}s`,
  );
  if (Number(sciVal) !== 55) {
    console.error("[FAIL] numpy/pandas client-side execution produced wrong output");
    process.exit(1);
  }
  console.log("[PASS] numpy + pandas run client-side via prebuilt WASM wheels.");

  // --- PyTorch: confirm it is NOT available client-side (expected failure) ---
  try {
    await py.loadPackagesFromImports("import torch"); // no Pyodide package -> no-op
    await py.runPythonAsync("import torch");
    console.log("[pytorch] UNEXPECTED: torch imported?!");
  } catch (e) {
    const first =
      String(e?.message || e)
        .split("\n")
        .find((l) => l.includes("Error")) || "ModuleNotFoundError";
    console.log(`[pytorch] import torch FAILS client-side (expected): ${first.trim()}`);
  }

  console.log(
    "[DONE] numpy/pandas: client-side YES. pytorch: NO -> tinygrad/micrograd or ONNX Runtime Web.",
  );
}

main().catch((e) => {
  console.error("[ERROR]", e?.message || e);
  process.exit(1);
});
