// @ts-check

import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import tsEslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

const config = defineConfig(
    js.configs.recommended,
    tsEslint.configs.recommended,
    jsdoc.configs["flat/recommended-typescript"],
    {
        ignores: [
            "eslint.config.js",
            "vite.config.ts",
            "tailwind.config.js",
            "test",
        ],
    },
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: { project: ["./tsconfig.lib.json"] },
        },
        rules: {
            "no-alert": "warn",

            "no-case-declarations": "off", // potential errors are already caught by typescript

            "jsdoc/tag-lines": [
                "warn",
                "any",
                { startLines: 1 }, // Require one empty line, between description and tags
            ],

            "jsdoc/require-jsdoc": [
                "warn",
                {
                    require: {
                        ArrowFunctionExpression: true,
                        ClassDeclaration: true,
                        ClassExpression: true,
                        FunctionDeclaration: true,
                        FunctionExpression: true,
                        MethodDefinition: true,
                    },
                    // use https://typescript-eslint.io/play/ to figure out the ast layout
                    contexts: [
                        "TSTypeAliasDeclaration",
                        "TSInterfaceDeclaration",
                        "TSPropertySignature",
                        "TSMethodSignature",
                    ],
                },
            ],

            "jsdoc/require-param": [
                "warn",
                {
                    // use https://typescript-eslint.io/play/ to figure out the ast layout
                    contexts: [
                        "ArrowFunctionExpression",
                        'FunctionDeclaration:not(:has(Identifier.params[name="props"]:first-child:last-child))', // ignore react components
                        "FunctionExpression",
                        "TSMethodSignature",
                    ],
                },
            ],

            "jsdoc/require-returns": [
                "warn",
                {
                    // use https://typescript-eslint.io/play/ to figure out the ast layout
                    contexts: [
                        "ArrowFunctionExpression",
                        'FunctionDeclaration:not(:has(Identifier.params[name="props"]:first-child:last-child))', // ignore react components
                        "FunctionExpression",
                        "TSMethodSignature",
                    ],
                },
            ],

            "@typescript-eslint/switch-exhaustiveness-check": "error",

            "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],

            "@typescript-eslint/no-unsafe-function-type": "error", // bans `Function`
            "@typescript-eslint/no-wrapper-object-types": "error", // bans `Object`, `String`, `Number`, etc.
            "@typescript-eslint/no-empty-object-type": "off", // allows `{}`, since `type XxxProps = {};` is useful for consistency

            "@typescript-eslint/no-unused-vars": [
                "error",
                { varsIgnorePattern: "^_", argsIgnorePattern: "^_|props" }, // mimic rust behaviour and ignore the props argument of functional components
            ],
        },
    },
);
// disableAllBut("<some-rule>");
export default config;

/**
 * Disables all rules in `config` but the one passed as argument
 *
 * Can be used for debugging or to run `--fix` with a single rule.
 *
 * @param {string} rule
 */
function disableAllBut(rule) {
    for (const entry of config) {
        if ("rules" in entry) {
            if (rule in entry.rules) {
                entry.rules = {
                    [rule]: entry.rules[rule],
                };
            } else {
                entry.rules = {};
            }
        }
    }
}
