import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * `npm run lint` used to be `next lint`, which Next 16 removed — so the script
 * failed with "Invalid project directory: .../lint" and there was no ESLint
 * configuration in the repository at all (AUDIT.md D9).
 */
export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // TypeScript resolves identifiers itself, and `no-undef` does not know
      // about Node's globals or ambient types — it only produces noise here.
      "no-undef": "off",
      // `format.ts` matches the narrow no-break space (U+202F) that Intl emits in
      // en-IN time output and replaces it with a normal space. That character
      // inside the regex literal is the point, not a typo.
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
    },
  },
);
