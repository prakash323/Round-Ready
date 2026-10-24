import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The suite runs against `src/lib` only — the pure layer. Those modules take
 * plain objects and return plain objects, and the current time is always passed
 * in rather than read from ambient scope, which is what makes the cases
 * deterministic and cheap enough to write exhaustively.
 *
 * The `@/` alias is why the ported files needed no edits: the tests already
 * imported `@/lib/engine`, and that now resolves to `backend/src/lib/engine`.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/engine/**",
        "src/lib/jd/**",
        "src/lib/schemas.ts",
        "src/lib/ics.ts",
        "src/lib/format.ts",
      ],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
