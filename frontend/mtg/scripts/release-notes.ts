/**
 * Reads the release-notes directory at build time: for the vite plugin that
 * bundles the Release notes as plain data, and for the check script.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import { displayedReleases } from "../src/utils/release-notes";
import type { Release } from "../src/utils/release-notes";
import { parseReleaseNotes } from "../src/utils/release-notes-parse";

/** The Releases in a release-notes directory, and everything wrong with it */
export type ReleaseNotesDirectory = {
    /** Every Release with its valid notes */
    releases: Array<Release>;
    /** One message per problem, naming the file relative to the directory */
    errors: Array<string>;
};

/**
 * Reads and validates a release-notes directory.
 *
 * @param root the release-notes directory
 *
 * @returns the Releases and every problem at once, including files that are no `.yaml`
 */
export function readReleaseNotes(root: string): ReleaseNotesDirectory {
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
    const { releases, errors } = parseReleaseNotes(files);
    return { releases, errors: [...strays, ...errors] };
}

const VIRTUAL_ID = "virtual:release-notes";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Bundles the displayed Releases as `virtual:release-notes`, already parsed.
 * Invalid Release notes fail the build; the dev server reloads when a fragment changes.
 *
 * @param directory the release-notes directory, relative to the vite root
 *
 * @returns the vite plugin
 */
export function releaseNotes(directory = "release-notes"): Plugin {
    let root = "";
    let dev = false;

    return {
        name: "release-notes",
        configResolved(config) {
            root = resolve(config.root, directory);
            dev = Boolean(config.env.DEV);
        },
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
        },
        load(id) {
            if (id !== RESOLVED_ID) return undefined;
            const { releases, errors } = readReleaseNotes(root);
            if (errors.length > 0) this.error(`Invalid Release notes in ${root}:\n${errors.join("\n")}`);
            return `export default ${JSON.stringify(displayedReleases(releases, dev))};`;
        },
        configureServer(server) {
            server.watcher.add(root);
            server.watcher.on("all", (_event, file) => {
                if (!file.startsWith(root + sep)) return;
                const graph = server.environments.client.moduleGraph;
                const module = graph.getModuleById(RESOLVED_ID);
                if (module === undefined) return;
                graph.invalidateModule(module);
                server.ws.send({ type: "full-reload" });
            });
        },
    };
}
