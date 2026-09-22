// ESLint for the whole client, the shared package, the server, and the two standalone
// consoles (admin-portal, sales-desk) — which are not npm workspaces and so were outside
// every root check until 2026-09-22.
// Prettier owns formatting (eslint-config-prettier turns the style rules off).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "client/public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: [
      "client/src/**/*.ts",
      "client/src/**/*.tsx",
      "shared/src/**/*.ts",
      "server/src/**/*.ts",
      "admin-portal/src/**/*.ts",
      "admin-portal/src/**/*.tsx",
      "sales-desk/src/**/*.ts",
      "sales-desk/src/**/*.tsx"
    ],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-console": "warn"
    }
  },
  // React: hooks only at the top level of components and hooks; effect deps checked but advisory.
  {
    files: ["client/src/**/*.tsx", "client/src/**/*.ts", "admin-portal/src/**/*.tsx", "sales-desk/src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" }
  },
  // Server modules log by convention (boot messages, request failures, the seed CLI's report).
  { files: ["server/src/**/*.ts"], rules: { "no-console": "off" } }
);
