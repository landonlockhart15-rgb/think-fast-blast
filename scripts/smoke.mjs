// Boot smoke test — the gate that catches blank-screen / crash-on-load regressions.
//
// Why this exists: the unit suite (node --test) covers game *logic* in isolation
// but never mounts <App/>. A crash inside App's render (e.g. a hook-ordering /
// temporal-dead-zone error) compiles fine and passes every unit test, yet ships a
// blank screen. This test boots the real built app in a real browser and asserts
// it actually rendered and logged no errors. Run it in `npm test` so the Time Stone
// rollback gate can catch this entire class of failure.
//
// Zero extra deps: a tiny static server (node http) + the already-installed
// `playwright` chromium.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// Static file server over dist/, with SPA fallback to index.html.
function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = normalize(join(DIST, urlPath));
      if (!filePath.startsWith(DIST)) { res.statusCode = 403; return res.end("forbidden"); }
      let info = await stat(filePath).catch(() => null);
      if (info && info.isDirectory()) { filePath = join(filePath, "index.html"); info = await stat(filePath).catch(() => null); }
      if (!info) { filePath = join(DIST, "index.html"); } // SPA fallback
      const body = await readFile(filePath);
      res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  // Fail loudly if the build is missing — the gate must not pass on a stale/absent dist.
  if (!(await stat(join(DIST, "index.html")).catch(() => null))) {
    throw new Error("dist/index.html not found — run `vite build` before the smoke test");
  }

  const { server, port } = await serveDist();
  const url = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  let failure = null;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    // The real assertion: React actually mounted content into #root.
    await page.waitForFunction(() => {
      const r = document.getElementById("root");
      return r && r.children.length > 0;
    }, { timeout: 15000 });

    const rootChildren = await page.evaluate(() => document.getElementById("root")?.children.length ?? 0);
    if (rootChildren === 0) failure = "App rendered nothing into #root (blank screen).";
    if (pageErrors.length) failure = `Uncaught error on load: ${pageErrors.join(" | ")}`;
    // Ignore benign noise; fail on the kinds of console errors that indicate a real crash.
    const fatal = consoleErrors.filter((t) => /Cannot access|is not defined|is not a function|Minified React error|Maximum update depth|before initialization/i.test(t));
    if (fatal.length) failure = `Fatal console error on load: ${fatal.join(" | ")}`;
  } catch (err) {
    failure = `App failed to boot: ${err.message}`;
  } finally {
    await browser.close();
    server.close();
  }

  if (failure) {
    console.error(`✘ smoke: ${failure}`);
    if (consoleErrors.length) console.error("  console errors:", consoleErrors.slice(0, 5));
    process.exit(1);
  }
  console.log("✔ smoke: app boots and renders into #root with no fatal console errors");
}

main().catch((err) => { console.error("✘ smoke: harness error:", err); process.exit(1); });
