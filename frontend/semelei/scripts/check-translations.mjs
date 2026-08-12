#!/usr/bin/env node
// Fails when a component uses a translation key that no locale file defines.
//
// The plain grep in run-ci.sh only finds keys whose *value* still looks like a
// key (an untranslated placeholder). A key that was never added at all slips
// through it and shows up as raw `label.pickup-date` on the page — this closes
// that gap.
//
// Per the project's i18n rules a component binds at most two namespaces:
// `t` to the page-specific one named in `useTranslation("ns")`, and `tg` to
// the default namespace.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const LOCALES = "public/locales";
const DEFAULT_NAMESPACE = "translation";
/** i18next appends these to a key when the string has plural forms */
const PLURAL_SUFFIXES = ["", "_one", "_other", "_zero", "_two", "_few", "_many"];

/**
 * Every file below a directory, recursively.
 *
 * @param dir the directory to walk
 *
 * @returns the file paths
 */
function walk(dir) {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

/**
 * Load one language's namespace into a set of "group.key" strings.
 *
 * @param language the language directory name
 * @param namespace the namespace file name without extension
 *
 * @returns the defined keys, or undefined if the namespace does not exist
 */
function loadKeys(language, namespace) {
    let raw;
    try {
        raw = readFileSync(join(LOCALES, language, `${namespace}.json`), "utf8");
    } catch {
        return undefined;
    }
    const keys = new Set();
    for (const [group, entries] of Object.entries(JSON.parse(raw))) {
        for (const key of Object.keys(entries)) keys.add(`${group}.${key}`);
    }
    return keys;
}

const languages = readdirSync(LOCALES);
const cache = new Map();

/**
 * The keys defined for a namespace in a language, cached.
 *
 * @param language the language directory name
 * @param namespace the namespace file name without extension
 *
 * @returns the defined keys, or undefined if the namespace does not exist
 */
function keysOf(language, namespace) {
    const id = `${language}/${namespace}`;
    if (!cache.has(id)) cache.set(id, loadKeys(language, namespace));
    return cache.get(id);
}

const missing = [];

for (const file of walk(SRC)) {
    if (!/\.tsx?$/.test(file) || file.includes("/api/generated/")) continue;
    const source = readFileSync(file, "utf8");

    const namespace = source.match(/useTranslation\(\s*"([^"]+)"\s*\)/)?.[1] ?? DEFAULT_NAMESPACE;

    // Only literal keys can be checked; a template literal is resolved at runtime
    for (const [, fn, key] of source.matchAll(/\b(tg?)\(\s*"([a-z-]+\.[a-zA-Z0-9-]+)"/g)) {
        const target = fn === "tg" ? DEFAULT_NAMESPACE : namespace;
        for (const language of languages) {
            const defined = keysOf(language, target);
            if (!defined) {
                missing.push(`${file}: namespace "${target}" missing for language "${language}"`);
                continue;
            }
            if (!PLURAL_SUFFIXES.some((suffix) => defined.has(`${key}${suffix}`))) {
                missing.push(`${file}: ${language}/${target}.json has no "${key}"`);
            }
        }
    }
}

if (missing.length > 0) {
    console.error([...new Set(missing)].join("\n"));
    console.error(`\n${new Set(missing).size} undefined translation keys found`);
    process.exit(1);
}
