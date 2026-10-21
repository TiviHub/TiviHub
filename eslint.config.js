import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Only rules that catch real bugs. Rules the existing code still breaks are warnings, so the
// gate cannot fail on old code; raise a rule to "error" once its warning count reaches zero.
export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src-tauri/**", "scripts/perf/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  // Node scripts and config files
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,ts}", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  // Rules the existing code still breaks. Each one is a warning until its count reaches zero.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "no-control-regex": "warn",
      "no-useless-escape": "warn",
      "preserve-caught-error": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
);
