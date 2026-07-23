// Scans the labeled photo dataset (test/dataset/) through the REAL app path — the scan worker
// + main-thread OCR, driven via the DevTools protocol, exactly as a user would — and reports
// per-card pass/fail plus a summary. This measures end-to-end recognition on hard real-world
// photos (foil, sleeves, glare, borderless/retro frames, dark art), complementing the
// must-pass regression pages. Requires Node with global fetch + WebSocket (Node 22+).
// Usage: node test/dataset-scan.mjs <debugBase> <appUrl>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [debugBase, appUrl] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, "dataset", "images");
const labels = JSON.parse(readFileSync(join(here, "dataset", "labels.json"), "utf8"));
const norm = (v) => String(v).trim().toUpperCase().replace(/^0+(?=\d)/, "");

async function findTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const t = (await (await fetch(`${debugBase}/json/list`)).json()).find((x) => x.type === "page");
      if (t?.webSocketDebuggerUrl) return t;
    } catch {
      // devtools not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Kein Chromium-DevTools-Ziel gefunden.");
}

const target = await findTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const i = (id += 1);
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: appUrl });
const ev = async (ex) => (await send("Runtime.evaluate", { expression: ex, returnByValue: true })).result?.result?.value;
for (let i = 0; i < 240; i += 1) {
  if (await ev("(()=>{const b=document.querySelector('.gallery-button');return b&&!b.disabled;})()")) break;
  await new Promise((r) => setTimeout(r, 500));
}

let pass = 0;
const failures = [];
for (const L of labels) {
  await ev("(()=>{const c=document.querySelector('.icon-button');if(c)c.click();})()");
  await new Promise((r) => setTimeout(r, 400));
  const objectId = (await send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]:not([capture])')" })).result.result.objectId;
  await send("DOM.setFileInputFiles", { objectId, files: [join(imagesDir, L.file)] });
  let info = "";
  const start = Date.now();
  while (Date.now() - start < 60000) {
    // Wait for the FINAL (post-OCR) result: the scan surfaces a preliminary perceptual guess
    // live, so we must not read until the pipeline reports phase "done" (data-scan-phase).
    const done = await ev("(()=>document.querySelector('.scan-screen')?.dataset.scanPhase==='done')()");
    if (done) {
      info = await ev("(()=>{const c=document.querySelector('.match-card .match-copy');if(!c)return '';const s=[...c.querySelectorAll('span')].map(e=>e.textContent);const h=(c.querySelector('h3')||{}).textContent||'';return h+'|'+s.join('~');})()");
      if (info) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const m = info.match(/([A-Z0-9]+)\s*·\s*#([^~]+)/);
  const gotSet = m ? norm(m[1]) : "?";
  const gotNum = m ? norm(m[2]) : "?";
  const ok = gotSet === norm(L.set) && gotNum === norm(L.number);
  if (ok) pass += 1;
  else failures.push(`  ${L.file}  exp ${norm(L.set)}#${norm(L.number)} (${L.name})  got ${gotSet}#${gotNum} [${info.split("|")[0]}]`);
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${L.file}  ${norm(L.set)}#${norm(L.number)} (${L.name})${ok ? "" : `  -> ${gotSet}#${gotNum}`}\n`);
}
process.stdout.write(`\n${pass}/${labels.length} correct\n`);
if (failures.length) process.stdout.write(`\nfailures:\n${failures.join("\n")}\n`);
ws.close();
// The dataset is a measurement tool (hard real-world photos), not a strict gate — always
// exit 0 so it reports without failing CI. The must-pass guardrail is `pnpm test:image`.
process.exit(0);
