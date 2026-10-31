//go:build js && wasm

// Yaegi-in-the-browser entrypoint for Onlearn's Tier-1 client-side Go execution.
//
// Build (needs the Go toolchain; this sandbox has none -- run in CI):
//
//	cd web-app/runtimes/go
//	go mod tidy
//	GOOS=js GOARCH=wasm go build -o ../../public/wasm/go/yaegi.wasm .
//	cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" ../../public/wasm/go/   # Go 1.21+
//	# (older Go: $(go env GOROOT)/misc/wasm/wasm_exec.js)
//
// Exposes globalThis.__yaegiRun(src, stdin) -> {stdout, stderr, ok}, consumed by
// app/workers/go-yaegi.worker.ts. See docs/CLIENT_SIDE_EXECUTION.md.
package main

import (
	"bytes"
	"strings"
	"syscall/js"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

func result(stdout, stderr string, ok bool) map[string]any {
	return map[string]any{"stdout": stdout, "stderr": stderr, "ok": ok}
}

// runGo interprets a full `package main` program and invokes main().
func runGo(_ js.Value, args []js.Value) any {
	src := args[0].String()
	stdin := ""
	if len(args) > 1 {
		stdin = args[1].String()
	}

	var out, errBuf bytes.Buffer
	i := interp.New(interp.Options{
		Stdout: &out,
		Stderr: &errBuf,
		Stdin:  strings.NewReader(stdin),
	})
	if err := i.Use(stdlib.Symbols); err != nil {
		return result(out.String(), "init: "+err.Error(), false)
	}

	// Evaluate the program. yaegi runs `func main` as part of evaluating a
	// `package main` source, so we must NOT also call main() explicitly (that
	// re-runs it and drains the single-use stdin reader on the later passes).
	if _, err := i.Eval(src); err != nil {
		return result(out.String(), errBuf.String()+err.Error(), false)
	}
	return result(out.String(), errBuf.String(), true)
}

func main() {
	js.Global().Set("__yaegiRun", js.FuncOf(runGo))
	select {} // keep the Go runtime alive for repeated __yaegiRun calls
}
