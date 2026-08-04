// Drives the regression pages in a real Chromium via the DevTools protocol, polling each
// page's data-status until it settles. Unlike --virtual-time-budget + --dump-dom, this waits
// in real wall-clock time, so pages doing real-time async work (OCR via Tesseract's WASM
// worker) complete instead of being fast-forwarded past. Requires Node with global fetch +
// WebSocket (Node 22+). Usage: node cdp-run.mjs <debugBase> <baseUrl> <timeoutMs> <page...>
const [debugBase, baseUrl, timeoutArg, ...pages] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg);
const TERMINAL = new Set(["passed", "failed", "error"]);

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const targets = await (await fetch(`${debugBase}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // devtools endpoint not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Kein Chromium-DevTools-Ziel gefunden.");
}

const target = await findTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let messageId = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const id = (messageId += 1);
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
};
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve) => ws.addEventListener("open", resolve));
await send("Runtime.enable");
await send("Page.enable");

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

let anyFailed = false;
for (const page of pages) {
  await send("Runtime.evaluate", { expression: "document.body.dataset.status='nav'" });
  await send("Page.navigate", { url: `${baseUrl}/test/${page}` });
  await new Promise((r) => setTimeout(r, 800));

  const start = Date.now();
  let status = "running";
  let text = "";
  while (Date.now() - start < timeoutMs) {
    const snapshot = await evaluate(
      "JSON.stringify({s:document.body.dataset.status,t:(document.querySelector('#result')||{}).textContent||''})",
    );
    try {
      const parsed = JSON.parse(snapshot);
      status = parsed.s;
      text = parsed.t;
    } catch {
      // page mid-navigation
    }
    if (TERMINAL.has(status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  const ok = status === "passed";
  if (!ok) anyFailed = true;
  process.stdout.write(`\n=== ${page} -> ${status} (${Math.round((Date.now() - start) / 1000)}s) ===\n${text}\n`);
}

ws.close();
process.exit(anyFailed ? 1 : 0);
