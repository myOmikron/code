// Local labelling tool: shows each photo and lets a printing be picked for it via Scryfall.
//
// The scanner's accuracy could only be measured against a decklist so far, which answers "is
// this answer somewhere in the deck" rather than "is it the card in this picture". Per-photo
// labels turn every metric exact, and they are the only way to tell a confusion between two
// printings of one card from a photo that was simply of a different card.
//
// Labels are written after every pick, so an interrupted session keeps everything done so far.
// Scryfall is called from the browser, not from here, which keeps this file free of any HTTP
// client and puts the request rate under the hand of whoever is typing.
//
// Usage: node scripts/label-server.mjs <photoDir> [labelFile] [--port 8730] [--deck <decklist>]
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

function option(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

const positional = process.argv.slice(2).filter((value, index, all) => {
  if (value.startsWith("--")) return false;
  return !all[index - 1]?.startsWith("--");
});
const photoDir = resolve(positional[0] ?? "");
const labelFile = resolve(positional[1] ?? join(photoDir, "labels.json"));
const deckFile = option("--deck", null);
const port = Number(option("--port", "8730"));

const IMAGE_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

/**
 * Reads the labels written so far, keyed by file name
 */
async function readLabels() {
  try {
    const rows = JSON.parse(await readFile(labelFile, "utf8"));
    return new Map(rows.map((row) => [row.file, row]));
  } catch {
    return new Map();
  }
}

/**
 * Parses a decklist into quick-pick entries, so a known deck needs no searching at all
 */
async function readDeck() {
  if (!deckFile) return [];
  const text = await readFile(resolve(deckFile), "utf8").catch(() => "");
  const entries = [];
  for (const line of text.split("\n")) {
    if (/^sideboard\b/i.test(line.trim())) break;
    const match = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+?)(\s+\*F\*)?\s*$/.exec(line.trim());
    if (!match) continue;
    entries.push({ name: match[2], set: match[3].toLowerCase(), number: match[4], foil: Boolean(match[5]) });
  }
  return entries;
}

const labels = await readLabels();
const deck = await readDeck();
const files = (await readdir(photoDir)).filter((file) => IMAGE_TYPES[extname(file).toLowerCase()]).sort();

/**
 * Writes every label back to disk in file order
 */
async function persist() {
  const rows = files.map((file) => labels.get(file)).filter(Boolean);
  await writeFile(labelFile, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

const page = `<!doctype html>
<html lang="de" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Karten etikettieren</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: "class" }</script>
</head>
<body class="bg-neutral-950 text-neutral-100 font-sans">
<div id="app" class="mx-auto max-w-[1500px] p-5"></div>
<script type="module">
const state = { files: [], labels: {}, deck: [], index: 0, results: [], busy: false, query: "" };
const app = document.getElementById("app");

// Card and set names are Scryfall's text, file names are the filesystem's; neither is ours and
// both land in markup. Apostrophes alone break attributes, so this is correctness before safety.
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const api = (path, init) => fetch(path, init).then((r) => r.json());

async function load() {
  const data = await api("/state");
  Object.assign(state, data);
  const firstOpen = state.files.findIndex((f) => !state.labels[f]);
  state.index = firstOpen === -1 ? 0 : firstOpen;
  render();
}

async function scryfall(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
}

async function searchPrintings(name) {
  state.busy = true; render();
  const query = encodeURIComponent('!"' + name.replace(/"/g, "") + '"');
  const data = await scryfall("https://api.scryfall.com/cards/search?q=" + query + "&unique=prints&include_extras=true&order=released");
  state.results = data && data.data ? data.data : [];
  state.busy = false; render();
}

async function suggest(text) {
  const data = await scryfall("https://api.scryfall.com/cards/autocomplete?q=" + encodeURIComponent(text));
  return data && data.data ? data.data.slice(0, 8) : [];
}

async function save(entry) {
  const file = state.files[state.index];
  await api("/label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file, ...entry }) });
  state.labels[file] = { file, ...entry };
  next();
}

function next() {
  state.results = [];
  state.query = "";
  if (state.index < state.files.length - 1) state.index += 1;
  render();
}

function pick(card) {
  save({
    name: card.name,
    set: card.set,
    number: card.collector_number,
    scryfallId: card.id,
    foil: card.finishes && card.finishes.length === 1 && card.finishes[0] === "foil",
    status: "ok",
  });
}

function cardImage(card) {
  if (card.image_uris) return card.image_uris.small;
  if (card.card_faces && card.card_faces[0].image_uris) return card.card_faces[0].image_uris.small;
  return "";
}

function render() {
  const file = state.files[state.index];
  const done = Object.keys(state.labels).length;
  const label = state.labels[file];
  app.innerHTML = \`
    <header class="mb-4 flex items-center gap-4">
      <h1 class="text-lg font-semibold">Karten etikettieren</h1>
      <span class="text-sm text-neutral-400">\${done}/\${state.files.length} erledigt</span>
      <span class="ml-auto text-sm text-neutral-500">\${esc(file ?? "fertig")}</span>
    </header>
    <div class="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div class="space-y-3">
        <img src="/image/\${encodeURIComponent(file ?? "")}" class="w-full rounded-xl border border-neutral-800">
        <div class="flex flex-wrap gap-2">
          <button data-act="prev" class="rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">Zurück</button>
          <button data-act="skip" class="rounded-lg bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700">Überspringen</button>
          <button data-act="unusable" class="rounded-lg bg-red-900/70 px-3 py-2 text-sm hover:bg-red-800">Unbrauchbar</button>
        </div>
        \${label ? \`<p class="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm">gesetzt: \${label.status === "unbrauchbar" ? "unbrauchbar" : esc(label.name) + " (" + esc((label.set ?? "").toUpperCase()) + ") " + esc(label.number ?? "")}</p>\` : ""}
      </div>
      <div class="space-y-4">
        <input id="q" value="\${esc(state.query)}" placeholder="Kartenname eingeben, Enter für Drucke" autofocus
          class="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-500">
        <div id="suggest" class="flex flex-wrap gap-2"></div>
        \${state.deck.length ? \`<div><p class="mb-2 text-xs uppercase tracking-wide text-neutral-500">Aus der Deckliste</p>
          <div class="flex flex-wrap gap-1.5">\${state.deck.map((d, i) => \`<button data-deck="\${i}" class="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">\${esc(d.name)} <span class="text-neutral-500">\${esc(d.set.toUpperCase())} \${esc(d.number)}</span></button>\`).join("")}</div></div>\` : ""}
        \${state.busy ? '<p class="text-sm text-neutral-400">suche…</p>' : ""}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          \${state.results.map((card, i) => \`
            <button data-pick="\${i}" class="rounded-lg border border-neutral-800 p-2 text-left hover:border-neutral-500">
              <img src="\${esc(cardImage(card))}" class="mb-1.5 w-full rounded" loading="lazy">
              <p class="text-xs font-medium">\${esc(card.set.toUpperCase())} \${esc(card.collector_number)}</p>
              <p class="text-[11px] text-neutral-400">\${esc(card.set_name)}</p>
            </button>\`).join("")}
        </div>
      </div>
    </div>\`;

  const input = document.getElementById("q");
  if (input) {
    input.focus();
    let timer;
    input.oninput = () => {
      state.query = input.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const names = input.value.length > 1 ? await suggest(input.value) : [];
        const box = document.getElementById("suggest");
        if (box) box.innerHTML = names.map((n) => \`<button data-name="\${esc(n)}" class="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">\${esc(n)}</button>\`).join("");
      }, 250);
    };
    input.onkeydown = (event) => { if (event.key === "Enter" && input.value.trim()) searchPrintings(input.value.trim()); };
  }
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.pick !== undefined) return pick(state.results[Number(target.dataset.pick)]);
  if (target.dataset.name !== undefined) { document.getElementById("q").value = target.dataset.name; return searchPrintings(target.dataset.name); }
  if (target.dataset.deck !== undefined) {
    const entry = state.deck[Number(target.dataset.deck)];
    const card = await scryfall("https://api.scryfall.com/cards/" + entry.set + "/" + encodeURIComponent(entry.number));
    if (card) return pick(card);
    return;
  }
  const action = target.dataset.act;
  if (action === "prev" && state.index > 0) { state.index -= 1; state.results = []; render(); }
  if (action === "skip") next();
  if (action === "unusable") save({ status: "unbrauchbar" });
});

load();
</script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);

  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }

  if (url.pathname === "/state") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ files, deck, labels: Object.fromEntries(labels) }));
    return;
  }

  if (url.pathname.startsWith("/image/")) {
    const file = decodeURIComponent(url.pathname.slice("/image/".length));
    if (!files.includes(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": IMAGE_TYPES[extname(file).toLowerCase()] });
    createReadStream(join(photoDir, file)).pipe(response);
    return;
  }

  if (url.pathname === "/label" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const entry = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    labels.set(entry.file, entry);
    await persist();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, done: labels.size }));
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `${files.length} Bilder aus ${photoDir}\n` +
      `${labels.size} bereits etikettiert, Ziel: ${labelFile}\n` +
      `${deck.length ? `${deck.length} Deck-Einträge als Schnellauswahl\n` : ""}` +
      `\n  http://localhost:${port}\n`,
  );
});
