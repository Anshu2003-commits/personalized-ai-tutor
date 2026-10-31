import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Design-system guard: enforce token-only color usage (see DESIGN.md).
// Flags Tailwind arbitrary color values (e.g. text-[#fff], bg-[oklch(...)]),
// the main vector for palette drift. Colors must come from semantic token
// classes; raw token values live only in app/globals.css. Conservative: does
// not touch arbitrary non-color brackets (spacing, sizing, clamp).
const ARBITRARY_COLOR = "/-\\[(#|rgb|hsl|oklch|color)/";
const COLOR_MESSAGE =
  "Use a semantic theme token (bg-background, text-foreground, the sanctioned accents) instead of an arbitrary color value. Define new tokens in app/globals.css. See DESIGN.md.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: `Literal[value=${ARBITRARY_COLOR}]`,
          message: COLOR_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=${ARBITRARY_COLOR}]`,
          message: COLOR_MESSAGE,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored browser runtime assets (Go wasm shim, binji/wasm-clang glue).
    "public/wasm/**",
  ]),
]);

export default eslintConfig;
