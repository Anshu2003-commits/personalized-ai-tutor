#!/usr/bin/env bash
# Build the Yaegi Go interpreter to WASM for Tier-1 client-side Go execution.
# Run from web-app/runtimes/go. Requires the Go toolchain (1.21+).
# Produces: public/wasm/go/yaegi.wasm + public/wasm/go/wasm_exec.js
set -euo pipefail

OUT_DIR="../../public/wasm/go"
mkdir -p "$OUT_DIR"

go mod tidy
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUT_DIR/yaegi.wasm" .

# Go's JS runtime shim. Path moved in Go 1.21.
SHIM="$(go env GOROOT)/lib/wasm/wasm_exec.js"
[ -f "$SHIM" ] || SHIM="$(go env GOROOT)/misc/wasm/wasm_exec.js"
cp "$SHIM" "$OUT_DIR/wasm_exec.js"

echo "Built: $OUT_DIR/yaegi.wasm ($(du -h "$OUT_DIR/yaegi.wasm" | cut -f1))"
echo "Copied: $OUT_DIR/wasm_exec.js"
