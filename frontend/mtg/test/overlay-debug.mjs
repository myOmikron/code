// Renders the live scan overlay (crop / perspective / OCR shapes) for every labeled dataset
// photo and saves a screenshot of the viewfinder, so the card-detection geometry can be
// inspected visually — the dataset harness only checks the recognized text, not where the
// algorithm thinks the card is. Drives the real app via the DevTools protocol (Node 22+).
// Usage: node test/overlay-debug.mjs <debugBase> <appUrl> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [debugBase, appUrl, outDir] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, "dataset", "images");
const labels = JSON.parse((await import("node:fs")).readFileSync(join(here, "dataset", "labels.json"), "utf8"));
mkdirSync(outDir, { recursive: true });

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
// The chromium --window-size=1400,1000 flag already gives the app its desktop layout (large
// viewfinder). We deliberately do NOT use Emulation.setDeviceMetricsOverride — in headless it
// interferes with the module worker and the index never finishes loading.
await send("Page.navigate", { url: appUrl });
const t0 = Date.now();
const log = (m) => process.stdout.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}\n`);
const ev = async (ex) => (await send("Runtime.evaluate", { expression: ex, returnByValue: true })).result?.result?.value;
log("navigated, waiting for index…");
let ready = false;
for (let i = 0; i < 240; i += 1) {
  if (await ev("(()=>{const b=document.querySelector('.gallery-button');return b&&!b.disabled;})()")) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 500));
}
log(ready ? "app ready" : "app NOT ready (timed out) — continuing anyway");

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : labels.length;
const selected = (only ? labels.filter((L) => only.has(L.file)) : labels).slice(0, limit);
for (const L of selected) {
  log(`scan ${L.file}…`);
  await ev("(()=>{const c=document.querySelector('.icon-button');if(c)c.click();})()");
  await new Promise((r) => setTimeout(r, 400));
  const objectId = (await send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]:not([capture])')" })).result.result.objectId;
  await send("DOM.setFileInputFiles", { objectId, files: [join(imagesDir, L.file)] });
  const start = Date.now();
  let done = false;
  while (Date.now() - start < 30000) {
    done = await ev("(()=>document.querySelector('.scan-screen')?.dataset.scanPhase==='done')()");
    if (done) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  log(`  ${done ? "done" : "TIMEOUT"} after ${((Date.now() - start) / 1000).toFixed(1)}s`);
  await new Promise((r) => setTimeout(r, 500)); // let the overlay animation settle
  const rect = await ev("(()=>{const v=document.querySelector('.viewfinder');if(!v)return null;const r=v.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  if (!rect) continue;
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  });
  const name = L.file.replace(/\.[^.]+$/, "") + ".png";
  writeFileSync(join(outDir, name), Buffer.from(shot.result.data, "base64"));
  process.stdout.write(`shot ${name}  (${L.set}#${L.number} ${L.name})\n`);
}
process.stdout.write(`\nsaved overlays to ${outDir}\n`);
ws.close();
process.exit(0);
