import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".codex-checkpoints/**",
      "coverage/**"
    ]
  },
  {
    files: [
      "src/**/*.ts",
      "webview-ui/src/**/*.ts",
      "webview-ui/src/**/*.tsx",
      "test/**/*.ts"
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "off",
      "no-console": "error",
      "prefer-const": "error"
    }
  }
];
