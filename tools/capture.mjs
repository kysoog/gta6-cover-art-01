#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const appRoot = resolve(root, "app");
const captureRoot = resolve(root, "screenshots");
const reportPath = resolve(root, "tools/capture-report.json");
const definitions = JSON.parse(readFileSync(resolve(root, "shots.json"), "utf8"));
mkdirSync(captureRoot, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local.invalid").pathname);
  const relative = normalize(pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  const filename = resolve(appRoot, relative);
  if (filename !== appRoot && !filename.startsWith(appRoot + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!statSync(filename).isFile()) throw new Error("not a file");
  } catch {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[extname(filename)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(filename).pipe(response);
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const appPort = server.address().port;

const reservation = createServer();
await new Promise((resolveListen) => reservation.listen(0, "127.0.0.1", resolveListen));
const debugPort = reservation.address().port;
await new Promise((resolveClose) => reservation.close(resolveClose));
const profile = mkdtempSync(join(root, ".chromium-capture-"));
const browser = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const browserErrors = [];
browser.stderr.on("data", (chunk) => browserErrors.push(String(chunk)));
let browserSocket;

async function browserJson(path, method = "GET") {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}${path}`, { method });
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw lastError;
}

class Protocol {
  constructor(socket) {
    this.socket = socket;
    this.serial = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? {})}`));
        else pending.resolve(message.result ?? {});
      } else {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result?.value;
  }
}

function pngDimensions(dataURL) {
  if (!dataURL?.startsWith("data:image/png;base64,")) throw new Error("Export did not return a PNG data URL.");
  const bytes = Buffer.from(dataURL.slice(dataURL.indexOf(",") + 1), "base64");
  if (bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("Exported PNG has no leading IHDR.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

async function waitUntilDrawn(protocol, name) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const ready = await protocol.evaluate("window.__shotReady === true");
    if (ready) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`${name}: window.__shotReady was not set.`);
}

const reports = [];
try {
  await browserJson("/json/version");
  const pages = await browserJson("/json/list");
  const page = pages.find((entry) => entry.type === "page") ?? await browserJson("/json/new?about:blank", "PUT");
  browserSocket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    browserSocket.addEventListener("open", resolveOpen, { once: true });
    browserSocket.addEventListener("error", rejectOpen, { once: true });
  });
  const protocol = new Protocol(browserSocket);
  await Promise.all([protocol.send("Page.enable"), protocol.send("Runtime.enable"), protocol.send("Log.enable")]);
  const runtimeExceptions = [];
  const errorLogs = [];
  protocol.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? "Unknown exception");
  });
  protocol.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error") errorLogs.push(`${entry.source}: ${entry.text}`);
  });

  for (const shot of definitions) {
    runtimeExceptions.length = 0;
    errorLogs.length = 0;
    await protocol.send("Emulation.setDeviceMetricsOverride", {
      width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false,
      screenWidth: shot.width, screenHeight: shot.height,
    });
    const target = `http://127.0.0.1:${appPort}/index.html?capture=${shot.mode}&scene=${shot.scene}`;
    await protocol.send("Page.navigate", { url: target });
    await waitUntilDrawn(protocol, shot.name);
    const exported = await protocol.evaluate("(async () => ({ url: await window.__coverStudio.exportAsDataURL(), expected: window.__coverStudio.dimensions() }))()");
    const png = pngDimensions(exported.url);
    if (png.width !== exported.expected.width || png.height !== exported.expected.height) {
      throw new Error(`${shot.name}: exported PNG dimensions do not match the selected post size.`);
    }
    let quality = 90;
    let captured = await protocol.send("Page.captureScreenshot", { format: "jpeg", quality, fromSurface: true, captureBeyondViewport: false });
    let bytes = Buffer.from(captured.data, "base64");
    while (bytes.length > 245760 && quality > 72) {
      quality -= 4;
      captured = await protocol.send("Page.captureScreenshot", { format: "jpeg", quality, fromSurface: true, captureBeyondViewport: false });
      bytes = Buffer.from(captured.data, "base64");
    }
    const exceptions = [...runtimeExceptions, ...errorLogs];
    if (exceptions.length) throw new Error(`${shot.name}: CDP exception log is not empty:\n${exceptions.join("\n")}`);
    if (bytes.length > 262144) throw new Error(`${shot.name}: ${bytes.length} bytes exceeds screenshot cap.`);
    writeFileSync(join(captureRoot, shot.name), bytes);
    const report = { name: shot.name, width: shot.width, height: shot.height, bytes: bytes.length, exportWidth: png.width, exportHeight: png.height, exportBytes: png.bytes, jpegQuality: quality, cdpExceptions: exceptions };
    reports.push(report);
    console.log(`${shot.name} ${shot.width}x${shot.height} ${bytes.length} bytes; export ${png.width}x${png.height} (${png.bytes} PNG bytes); JPEG quality ${quality}`);
    console.log(`CDP exceptions ${shot.name}: [] (empty)`);
  }
  writeFileSync(reportPath, `${JSON.stringify(reports, null, 2)}\n`);
  console.log(`Capture report: ${reportPath}`);
} finally {
  if (browserSocket?.readyState === WebSocket.OPEN) browserSocket.close();
  browser.kill("SIGTERM");
  server.close();
  for (let attempt = 0; attempt < 30 && browser.exitCode === null && browser.signalCode === null; attempt++) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
