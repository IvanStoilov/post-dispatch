// Next.js enforces `import "server-only"` itself. Plain Node (tests, tsx
// scripts and the publishing worker) has no such module, so map it to an
// empty file. Loaded with: tsx --import ./scripts/server-only-hook.mjs …
import { registerHooks } from "node:module";

const empty = new URL("./server-only-empty.cjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: empty, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
