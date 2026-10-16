import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// Domain modules are imported only through their index.ts (shared helpers
// in src/domain/shared are the exception).
const domainDeepImport = {
  regex: "(^@/|/src/|^(\\.\\./)+)domain/(?!shared/)[^/]+/",
  message:
    "Import domain modules through their index (@/domain/<module>), never their internal files.",
};

// <module>SystemService skips user authorization. Routers, pages and
// components act for a user and must use <module>Service instead; only
// workers (queue and cron routes) and other domain modules may use it.
const systemServiceImport = {
  regex: "(^@/|/src/|^(\\.\\./)+)domain/",
  importNamePattern: "SystemService$",
  message:
    "System services skip user authorization. Use the module's user service (for example projectsService) with the request's actor.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierRecommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      curly: ["error", "all"],
      "import/newline-after-import": ["error", { count: 1 }],
      "import/first": ["error"],
      "import/no-duplicates": ["error"],
      "import/order": ["error"],
    },
  },
  {
    files: ["src/**", "scripts/**", "tests/**"],
    ignores: ["src/domain/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [domainDeepImport] }],
    },
  },
  {
    files: ["src/server/**", "src/app/**", "src/components/**"],
    ignores: ["src/app/api/queues/**", "src/app/api/cron/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [domainDeepImport, systemServiceImport] },
      ],
    },
  },
  {
    // Inside the domain, other modules are reached through ../<module>.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./(?!shared/)[^/]+/",
              message:
                "Import other domain modules through their index (../<module>), never their internal files.",
            },
          ],
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
  ]),
]);

export default eslintConfig;
