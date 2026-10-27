import { describe, expect, it } from "vitest";
import generalTranslationKeys from "./general-translation-keys.json";

const librarySources = import.meta.glob<string>(["/lib/**/*.{ts,tsx}", "!/lib/**/*.test.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
});

const RELATIVE_IMPORT = /from\s+["'](\.{1,2}\/[^"']+)["']/g;

/**
 * Resolves a relative import of a library file to the key of the imported file in `librarySources`
 *
 * @param importer key of the importing file
 * @param specifier relative import specifier
 * @returns key of the imported file, or `undefined` if it is no library source
 */
function resolveImport(importer: string, specifier: string): string | undefined {
    const segments = importer.split("/").slice(0, -1);
    for (const segment of specifier.split("/")) {
        if (segment === "..") segments.pop();
        else if (segment !== ".") segments.push(segment);
    }
    const base = segments.join("/");
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
        (candidate) => candidate in librarySources,
    );
}

/**
 * Collects the Wizard engine's sources: everything in `lib/wizard` and every library file it imports, transitively.
 * Imports of the `main.ts` barrel (e.g. `useDesign` in `button.tsx`) are not followed, as it re-exports the whole
 * library; a component the engine renders must be imported from its own file to be covered.
 *
 * @returns keys of the engine's files in `librarySources`
 */
function engineFiles(): Set<string> {
    const files = new Set(Object.keys(librarySources).filter((file) => file.startsWith("/lib/wizard/")));
    for (const file of files) {
        for (const [, specifier] of librarySources[file].matchAll(RELATIVE_IMPORT)) {
            const imported = resolveImport(file, specifier);
            if (imported && imported !== "/lib/main.ts") files.add(imported);
        }
    }
    return files;
}

const KEY_LITERAL = /["']((?:heading|label|button|description|error|toast|accessibility)\.[a-z0-9-]+)["']/g;

describe("general-translation-keys.json", () => {
    it("lists exactly the general keys the Wizard engine and the components it renders use", () => {
        const used = new Set(
            [...engineFiles()].flatMap((file) => [...librarySources[file].matchAll(KEY_LITERAL)].map((m) => m[1])),
        );

        expect([...used].sort()).toEqual([...generalTranslationKeys].sort());
    });
});
