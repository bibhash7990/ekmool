import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // k6 scripts run inside k6's own JS runtime, not Node and not the
    // browser. `export default function` is how k6 declares the VU body,
    // and __ENV / __VU / __ITER / open() are its globals — linting them
    // against web-vitals rules only produces false positives.
    "scripts/k6/**",
  ]),
]);

export default eslintConfig;
