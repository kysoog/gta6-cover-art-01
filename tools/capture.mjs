import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appRoot = resolve(root, 'app');
const shotDirectory = resolve(root, 'screenshots');
const artifactDirectory = resolve(root, 'artifacts');
const debugPort = 9337;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

function serveStaticApp() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = resolve(appRoot, pathname.replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(appRoot + sep) && file !== appRoot) throw new Error('Bad path');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'content-length': info.size });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolveServer => {
    server.listen(0, '127.0.0.1', () => resolveServer({ server, port: server.address().port }));
  });
}

class CdpPage {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.serial = 0;
    this.pending = new Map();
    this.exceptions = [];
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', rejectOpen, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails);
    });
    await this.command('Page.enable');
    await this.command('Runtime.enable');
  }

  command(method, params = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
      const id = ++this.serial;
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      this.exceptions.push(result.exceptionDetails);
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async waitUntilDrawn() {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await this.evaluate('window.__shotReady === true')) return;
      const failure = await this.evaluate('window.__shotError || ""');
      if (failure) throw new Error(failure);
      await delay(75);
    }
    throw new Error('window.__shotReady was not set after 200 polls.');
  }

  close() {
    this.socket?.close();
  }
}

async function debuggingTargets() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return await response.json();
    } catch {
      await delay(100);
    }
  }
  throw new Error('Chromium debugging endpoint did not start.');
}

async function createPage() {
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  const page = new CdpPage(created.webSocketDebuggerUrl);
  await page.open();
  return page;
}

async function showExportedPng(page, dataUrl, width, height) {
  await page.evaluate(`(async () => {
    window.__shotReady = false;
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c0e11}img{display:block;width:100vw;height:100vh;object-fit:contain}</style></head><body><img alt="PNG exported by Afterhours"></body>';
    const image = document.querySelector('img');
    image.src = ${JSON.stringify('__EXPORT_DATA_URL__')};
    await image.decode();
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
  })()`.replace('__EXPORT_DATA_URL__', dataUrl));
  await page.waitUntilDrawn();
}

async function saveScreenshot(page, shot) {
  let accepted;
  for (const quality of [90, 85, 80, 75]) {
    const result = await page.command('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true, captureBeyondViewport: false });
    const bytes = Buffer.from(result.data, 'base64');
    accepted = bytes;
    if (bytes.length <= 256 * 1024) break;
  }
  if (accepted.length > 256 * 1024) throw new Error(`${shot.name}: JPEG remains over 256 KiB.`);
  await writeFile(resolve(shotDirectory, shot.name), accepted);
  return accepted.length;
}

const { server, port } = await serveStaticApp();
await mkdir(shotDirectory, { recursive: true });
await mkdir(artifactDirectory, { recursive: true });
const chrome = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--disable-background-networking', '--disable-extensions', '--force-device-scale-factor=1',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${resolve(artifactDirectory, 'chromium-profile')}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserStderr = '';
chrome.stderr.on('data', bytes => { browserStderr += bytes.toString(); });

try {
  await debuggingTargets();
  const shots = JSON.parse(await readFile(resolve(root, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    const page = await createPage();
    try {
      await page.command('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false });
      await page.command('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?shot=${shot.scene}` });
      await page.waitUntilDrawn();
      const photoCount = await page.evaluate('window.__afterhours.state.photos.length');
      if (photoCount !== 4) throw new Error(`${shot.name}: expected four loaded sample photos, got ${photoCount}.`);
      if (shot.kind === 'cover') {
        const exported = await page.evaluate('window.__afterhours.exportDataURL()');
        const rawPng = Buffer.from(exported.split(',')[1], 'base64');
        await writeFile(resolve(artifactDirectory, `export-${shot.scene}.png`), rawPng);
        await showExportedPng(page, exported, shot.width, shot.height);
      }
      const bytes = await saveScreenshot(page, shot);
      console.log(`${shot.name} cdp_exceptions=${page.exceptions.length} ${JSON.stringify(page.exceptions)} bytes=${bytes} viewport=${shot.width}x${shot.height}`);
      if (page.exceptions.length) throw new Error(`${shot.name}: browser exception log is not empty.`);
    } finally {
      page.close();
    }
  }
} catch (error) {
  if (browserStderr.trim()) console.error(browserStderr.trim().split('\n').slice(-8).join('\n'));
  throw error;
} finally {
  chrome.kill('SIGTERM');
  await new Promise(resolveClose => server.close(resolveClose));
}
