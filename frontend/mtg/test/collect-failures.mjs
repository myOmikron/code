// Collects the check images of every photo the run got wrong into one folder, so the failures
// can be looked through without picking them out of a hundred by hand. Two subfolders, because
// the two kinds fail for entirely different reasons: a wrong name is a recognition miss, a wrong
// printing means the card was found and only its edition was not.
// Usage: node test/collect-failures.mjs <verifyLog> [outputDir]
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [logPath, outputArgument] = process.argv.slice(2);
const outputDir = outputArgument ?? "test/detect-output/fehlschlaege";
const sourceDir = "test/detect-output/extrahiert";

const log = await import("node:fs/promises").then((fs) => fs.readFile(logPath, "utf8"));

const parse = (heading) => {
  const start = log.indexOf(heading);
  if (start === -1) return [];
  const rest = log.slice(start).split("\n").slice(1);
  const rows = [];
  for (const line of rest) {
    const match = /^ {2}(IMG\S+?)\.jpg\s+(.*)$/.exec(line);
    if (!match) break;
    rows.push({ file: match[1], detail: match[2].trim() });
  }
  return rows;
};

const groups = [
  { name: "name-falsch", rows: parse("Fehlschläge (") },
  { name: "druck-falsch", rows: parse("Name richtig, Druck falsch (") },
];

await rm(outputDir, { recursive: true, force: true });
const available = new Set(await readdir(sourceDir));
const lines = [];

for (const group of groups) {
  const target = join(outputDir, group.name);
  await mkdir(target, { recursive: true });
  for (const [index, row] of group.rows.entries()) {
    const source = `${row.file}-check.jpg`;
    if (!available.has(source)) continue;
    const label = row.detail.replace(/[^\wäöüÄÖÜß .()-]/g, "").slice(0, 70).trim().replace(/\s+/g, "_");
    await copyFile(join(sourceDir, source), join(target, `${String(index + 1).padStart(2, "0")}_${row.file}_${label}.jpg`));
    lines.push(`${group.name}\t${row.file}\t${row.detail}`);
  }
  console.log(`${group.name}: ${group.rows.length}`);
}

await writeFile(join(outputDir, "uebersicht.tsv"), `${lines.join("\n")}\n`, "utf8");
console.log(`Ausgabe: ${outputDir}`);
