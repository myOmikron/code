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
        ignores: ["src/api/generated/**", "src/api/graph-generated/**", "src/components/base/**", "eslint.config.js", "src/index.css"],
    },
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: { project: ["./tsconfig.json"] },
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
                        ClassDeclaration: true,
                        ClassExpression: true,
                        // The rule defaults this to true, so it has to be turned off explicitly —
                        // dropping the key is not enough. Non-components are required back via
                        // the selector in `contexts`.
                        FunctionDeclaration: false,
                        FunctionExpression: true,
                        MethodDefinition: true,
                    },
                    // use https://typescript-eslint.io/play/ to figure out the ast layout
                    // TSPropertySignature dropped: noisy on inline anonymous types used in
                    // destructured React-component param signatures. Top-level types still
                    // require docs via TSTypeAliasDeclaration / TSInterfaceDeclaration.
                    contexts: [
                        // React components are exempt: the name and the props type already say
                        // what they render. PascalCase is the marker — that is what makes a
                        // function a component to React in the first place.
                        "FunctionDeclaration:not([id.name=/^[A-Z]/])",
                        "TSTypeAliasDeclaration",
                        "TSInterfaceDeclaration",
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
                        // ignore react components: PascalCase, or `(props: T)` / `({ ... }: T)`
                        'FunctionDeclaration:not([id.name=/^[A-Z]/], :has(Identifier.params[name="props"]:first-child:last-child), :has(ObjectPattern.params:first-child:last-child))',
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
                        // ignore react components: PascalCase, or `(props: T)` / `({ ... }: T)`.
                        // PascalCase replaces the old special case for the single name
                        // `RouteComponent`, which missed every other component without props.
                        'FunctionDeclaration:not([id.name=/^[A-Z]/], :has(Identifier.params[name="props"]:first-child:last-child), :has(ObjectPattern.params:first-child:last-child))',
                        "FunctionExpression",
                        "TSMethodSignature",
                    ],
                },
            ],

            "@typescript-eslint/switch-exhaustiveness-check": "error",

            "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],

            // its just syntactically nicer and consistent to use `type ...Props = {};` and extend it later
            "@typescript-eslint/no-empty-object-type": "off",

            // Note: disable the base rule as it can report incorrect errors
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                // https://typescript-eslint.io/rules/no-unused-vars/#what-benefits-does-this-rule-have-over-typescript
                {
                    args: "all",
                    argsIgnorePattern: "^_|props", // mimic rust behaviour and ignore the props argument of functional components
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],

            // The presence of @param / @returns tags is enforced above (require-param /
            // require-returns) — but a description per tag is optional. Most React props are
            // self-documenting via their TypeScript type alias.
            "jsdoc/require-param-description": "off",
            "jsdoc/require-returns-description": "off",
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
