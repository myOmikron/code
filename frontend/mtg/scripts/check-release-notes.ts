/**
 * Validates every Release note fragment and `release.yaml` under `release-notes/`.
 *
 * Usage: `pnpm run release-notes:check [release-notes dir]`. Prints every problem
 * and exits non-zero when there is one.
 */

import { readReleaseNotes } from "./release-notes";

const root = process.argv[2] ?? "release-notes";

const { releases, errors } = readReleaseNotes(root);
for (const error of errors) console.error(`${root}/${error}`);
if (errors.length > 0) {
    console.error(`${errors.length} problems in the Release notes`);
    process.exit(1);
}
console.log(`The Release notes of ${releases.length} folders are valid`);
