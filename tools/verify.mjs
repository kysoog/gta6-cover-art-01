import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, htmlFacts, importMapOf, sourceImports } from '../vendor/makefun-app.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(root, 'app');
const failures = [];
const passed = [];
const check = (condition, message) => (condition ? passed : failures).push(message);

function walkFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(path));
    else output.push(path);
  }
  return output;
}

const appFiles = walkFiles(app);
const totalBytes = appFiles.reduce((sum, path) => sum + lstatSync(path).size, 0);
check(appFiles.every(path => lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()), 'app contains only regular files (no symlinks)');
check(appFiles.length + readdirSync(app, { withFileTypes: true }).filter(entry => entry.isDirectory()).length <= 993 && totalBytes <= 50331648, `app caps: ${appFiles.length} files, ${totalBytes} bytes`);
check(lstatSync(resolve(app, 'index.html')).isFile() && lstatSync(resolve(app, 'index.html')).size <= 1048576, 'index.html regular and <= 1 MiB');

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function imageDimensions(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { format: 'PNG', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = jpegDimensions(bytes);
    return dimensions ? { format: 'JPEG', ...dimensions } : null;
  }
  return null;
}

const shotNames = readdirSync(resolve(root, 'screenshots')).filter(name => !name.startsWith('.')).sort();
check(shotNames.length >= 3 && shotNames.length <= 4, `screenshot count: ${shotNames.length}`);
for (const name of shotNames) {
  const bytes = readFileSync(resolve(root, 'screenshots', name));
  const image = imageDimensions(bytes);
  check(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name), `${name}: valid filename`);
  check(Boolean(image), `${name}: PNG or JPEG`);
  check(bytes.length <= 262144, `${name}: ${bytes.length} bytes <= 262144`);
  if (image) {
    const long = Math.max(image.width, image.height);
    const short = Math.min(image.width, image.height);
    check(long <= 1280 && short >= 480, `${name}: ${image.width}x${image.height}, long=${long}, short=${short}`);
  }
}

const expectedDossier = buildDossier(root, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
const actualDossier = readFileSync(resolve(root, 'out/dossier.json'));
check(Buffer.from(expectedDossier).equals(actualDossier), `dossier byte-identical (${actualDossier.length} bytes)`);

const facts = htmlFacts(readFileSync(resolve(app, 'index.html'), 'utf8'));
const importMap = importMapOf(facts);
check(importMap.error === null, `import map: ${importMap.error ?? 'valid or absent'}`);
const resources = [];
for (const script of facts.scripts) if (script.src) resources.push({ ref: script.src, from: resolve(app, 'index.html') });
for (const link of facts.links) resources.push({ ref: link.href, from: resolve(app, 'index.html') });
for (const media of facts.resources) resources.push({ ref: media.src, from: resolve(app, 'index.html') });
if (importMap.map) for (const value of Object.values(importMap.map.imports)) if (value) resources.push({ ref: value, from: resolve(app, 'index.html') });

function localReference(ref, from) {
  if (ref.startsWith('data:')) return null;
  if (/^https?:/i.test(ref) || ref.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) throw new Error(`non-local reference ${ref}`);
  const clean = ref.split(/[?#]/)[0];
  const target = resolve(dirname(from), clean);
  if (target !== app && !target.startsWith(app + sep)) throw new Error(`reference escapes app: ${ref}`);
  if (!existsSync(target) || !lstatSync(target).isFile()) throw new Error(`unresolved reference: ${ref}`);
  return target;
}

const modules = new Set();
function inspectModule(path) {
  if (modules.has(path)) return;
  modules.add(path);
  const source = readFileSync(path, 'utf8');
  check(!/https?:/i.test(source), `${path.slice(app.length + 1)}: no network URL`);
  const staticImports = sourceImports(source);
  const dynamicImports = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(match => match[2]);
  for (const ref of [...staticImports, ...dynamicImports]) {
    try {
      let target;
      if (ref.startsWith('./') || ref.startsWith('../')) target = localReference(ref, path);
      else {
        const mapped = importMap.map?.imports[ref];
        if (!mapped) throw new Error(`unmapped bare specifier: ${ref}`);
        target = localReference(mapped, resolve(app, 'index.html'));
      }
      if (target && ['.js', '.mjs'].includes(extname(target))) inspectModule(target);
    } catch (error) { failures.push(`${path.slice(app.length + 1)}: ${error.message}`); }
  }
  for (const match of source.matchAll(/\burl\s*\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)) {
    try { localReference(match[2], path); } catch (error) { failures.push(error.message); }
  }
}

for (const resource of resources) {
  try {
    const target = localReference(resource.ref, resource.from);
    if (target && extname(target) === '.js') inspectModule(target);
    if (target && extname(target) === '.css') inspectModule(target);
  } catch (error) { failures.push(error.message); }
}
for (const script of facts.scripts) {
  if (!script.src && script.type === 'module') {
    for (const ref of sourceImports(script.text)) {
      try {
        const target = localReference(ref, resolve(app, 'index.html'));
        if (target) inspectModule(target);
      } catch (error) { failures.push(error.message); }
    }
  }
}
check(modules.size > 0, `reachable dependency graph: ${modules.size} local source files`);

for (const line of passed) console.log(`PASS ${line}`);
for (const line of failures) console.error(`FAIL ${line}`);
console.log(`VERIFY ${failures.length === 0 ? 'PASS' : 'FAIL'} checks=${passed.length + failures.length} failures=${failures.length}`);
if (failures.length) process.exitCode = 1;
