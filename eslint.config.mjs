// @ts-check
import globals from "globals";
import pluginJs from "@eslint/js";
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ["src/**/*.{js,mjs,cjs,ts}"],
	languageOptions: {
		globals: {...globals.browser, ...globals.node},
		parserOptions: { projectService: true },
 },
	extends: [
    eslint.configs.recommended,
		pluginJs.configs.recommended,
	  ...tseslint.configs.strict,
	  ...tseslint.configs.stylistic,
	],
  rules: {
		"semi": "error",
		"prefer-const": "error",
// 		"@typescript-eslint/no-slow-types": "error",
		"@typescript-eslint/switch-exhaustiveness-check": "error",
		}
	}
);
