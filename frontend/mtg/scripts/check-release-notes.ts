/**
 * Validates every Release note fragment and `release.yaml` under `release-notes/`.
 *
 * Usage: `pnpm run release-notes:check [release-notes dir]`. Prints every problem
 * and exits non-zero when there is one.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseReleaseNotes } from "../src/utils/release-notes";

const root = process.argv[2] ?? "release-notes";

const files: Record<string, string> = {};
const strays: Array<string> = [];
for (const folder of readdirSync(root)) {
    if (!statSync(join(root, folder)).isDirectory()) continue;
    for (const file of readdirSync(join(root, folder))) {
        if (file.endsWith(".yaml")) {
            files[`${folder}/${file}`] = readFileSync(join(root, folder, file), "utf-8");
        } else if (file !== ".gitkeep") {
            strays.push(`${folder}/${file}: is no .yaml file, the page and the release never see it`);
        }
    }
}

const errors = [...strays, ...parseReleaseNotes(files).errors];
for (const error of errors) console.error(`${root}/${error}`);
if (errors.length > 0) {
    console.error(`${errors.length} problems in the Release notes`);
    process.exit(1);
}
console.log(`${Object.keys(files).length} Release note files are valid`);
