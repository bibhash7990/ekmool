/**
 * Resolves the `@/` path alias for scripts run directly under Node.
 *
 * tsconfig's `paths` is a compiler fiction — TypeScript rewrites nothing at
 * runtime, and Node has never heard of `@/db/pool`. Until now the test
 * scripts worked around that by talking to MySQL themselves, which meant
 * they exercised SQL written in the test rather than the SQL the
 * application actually runs. That is the weakest kind of green tick.
 *
 * Twenty lines of resolve hook and the query modules become directly
 * testable. No dependency, no build step.
 *
 * Use it with the `react-server` condition, which is what makes
 * `import "server-only"` resolve to the empty module instead of the one
 * whose entire job is to throw:
 *
 *   node --conditions react-server --import ./scripts/register-alias.mjs …
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

/** Node needs a real file; `@/db/pool` names one four different ways. */
const CANDIDATES = ["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

/**
 * Next subpaths its package exports map for a bundler but that Node cannot
 * resolve on its own. `next/cache` is the one that matters: every cached
 * query module imports `unstable_cache` from it, so without this line a
 * script can reach src/lib but not src/db/queries — which is most of the
 * application.
 *
 * Mapped to the real file rather than stubbed. A stub would let a test go
 * green while the caching behaviour underneath it went unexercised, and
 * the tag a query registers under is exactly the sort of thing worth
 * getting wrong loudly.
 */
const NEXT_SUBPATHS = new Map([["next/cache", "next/cache.js"]]);

export async function resolve(specifier, context, next) {
  const mapped = NEXT_SUBPATHS.get(specifier);
  if (mapped) return next(mapped, context);

  if (!specifier.startsWith("@/")) return next(specifier, context);

  const stem = specifier.slice(2);
  for (const suffix of CANDIDATES) {
    const candidate = new URL(`${stem}${suffix}`, SRC);
    if (existsSync(fileURLToPath(candidate))) {
      return next(candidate.href, context);
    }
  }

  // Fall through rather than invent a path: a genuine typo should fail
  // with Node's own message, which names the specifier.
  return next(specifier, context);
}
