#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildDossier, htmlFacts, importMapOf, isRelativeRef, readAppTree, resolveAppPath, sourceImports } from "../vendor/makefun-app.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "out");
const app = resolve(root, "app");
const caps = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 50331648, app_path_max_bytes: 1000 };
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function noSymlinks(directory, relative = "") {
  for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    const stats = lstatSync(join(directory, path));
    check(!stats.isSymbolicLink() && (stats.isFile() || stats.isDirectory()), `app/${path}: not a plain file or directory`);
    if (entry.isDirectory()) noSymlinks(directory, path);
  }
}

function dimensions(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: "PNG", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { format: "JPEG", width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return { format: "invalid", width: 0, height: 0 };
}

const tree = readAppTree(app, caps);
noSymlinks(app);
const index = readFileSync(join(app, "index.html"));
check(lstatSync(join(app, "index.html")).isFile(), "app/index.html is not a regular file");
check(index.length <= 1048576, `app/index.html is ${index.length} bytes`);

const shots = readdirSync(join(root, "screenshots")).filter((name) => !name.startsWith(".")).sort();
check(shots.length >= 3 && shots.length <= 4, `Expected 3–4 screenshots, found ${shots.length}`);
const shotDetails = [];
for (const name of shots) {
  const bytes = readFileSync(join(root, "screenshots", name));
  const info = dimensions(bytes);
  check(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name), `Invalid screenshot name: ${name}`);
  check(info.format === "PNG" || info.format === "JPEG", `${name}: not PNG or JPEG`);
  check(bytes.length <= 262144, `${name}: ${bytes.length} bytes exceeds 262144`);
  check(Math.max(info.width, info.height) <= 1280, `${name}: long side exceeds 1280`);
  check(Math.min(info.width, info.height) >= 480, `${name}: short side below 480`);
  shotDetails.push(`${name} ${info.format} ${info.width}x${info.height} ${bytes.length} bytes`);
}

const expectedDossier = Buffer.from(buildDossier(root, caps));
const outputDossier = readFileSync(join(output, "dossier.json"));
check(expectedDossier.equals(outputDossier), `dossier.json differs from buildDossier (${expectedDossier.length} expected bytes, ${outputDossier.length} actual)`);

const facts = htmlFacts(index.toString("utf8"));
const map = importMapOf(facts).map;
const visited = new Set();
const referenceErrors = [];
const appFiles = new Set(tree.files.map((file) => file.path));

function checkReference(reference, from, kind) {
  if (typeof reference !== "string" || !reference) {
    referenceErrors.push(`${from}: empty ${kind} reference`);
    return null;
  }
  if (/^data:/i.test(reference)) return null;
  if (/^https?:\/\//i.test(reference) || reference.startsWith("//")) {
    referenceErrors.push(`${from}: network ${kind} reference ${reference}`);
    return null;
  }
  if (!isRelativeRef(reference)) {
    referenceErrors.push(`${from}: non-relative ${kind} reference ${reference}`);
    return null;
  }
  const target = resolveAppPath(reference, from);
  if (!target) {
    referenceErrors.push(`${from}: ${kind} reference escapes app/ ${reference}`);
    return null;
  }
  if (!appFiles.has(target)) referenceErrors.push(`${from}: missing ${kind} target app/${target}`);
  return target;
}

for (const script of facts.scripts) if (script.src !== null) checkReference(script.src, "index.html", "script");
for (const link of facts.links) checkReference(link.href, "index.html", "link");
for (const resource of facts.resources) checkReference(resource.src, "index.html", resource.tag);
for (const [from, value] of Object.entries(map?.imports ?? {})) if (value !== null) checkReference(value, "index.html", `import map ${from}`);

const moduleQueue = facts.scripts.filter((script) => script.type === "module" && script.src).map((script) => checkReference(script.src, "index.html", "module")).filter(Boolean);
while (moduleQueue.length) {
  const path = moduleQueue.shift();
  if (visited.has(path) || !appFiles.has(path)) continue;
  visited.add(path);
  const source = readFileSync(join(app, path), "utf8");
  if (/https?:\/\//i.test(source)) referenceErrors.push(`${path}: contains an http(s) URL`);
  const dynamic = [...source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map((match) => match[2]);
  for (const specifier of [...sourceImports(source), ...dynamic]) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier) || specifier.startsWith("//")) {
      referenceErrors.push(`${path}: non-local import ${specifier}`);
      continue;
    }
    let target;
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
      target = resolveAppPath(specifier, path);
    } else {
      const mapped = map?.imports?.[specifier];
      if (mapped === undefined || mapped === null) {
        referenceErrors.push(`${path}: unresolved bare import ${specifier}`);
        continue;
      }
      target = resolveAppPath(mapped, "index.html");
    }
    if (!target || !appFiles.has(target)) {
      referenceErrors.push(`${path}: unresolved import ${specifier}`);
      continue;
    }
    moduleQueue.push(target);
  }
}

for (const stylesheet of facts.links.filter((link) => link.rel.split(/\s+/).includes("stylesheet"))) {
  const path = resolveAppPath(stylesheet.href, "index.html");
  if (!path || !appFiles.has(path)) continue;
  const css = readFileSync(join(app, path), "utf8");
  if (/https?:\/\//i.test(css)) referenceErrors.push(`${path}: contains an http(s) URL`);
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) checkReference(match[2], path, "CSS URL");
}
if (/https?:\/\//i.test(index.toString("utf8"))) referenceErrors.push("index.html: contains an http(s) URL");
failures.push(...referenceErrors);

for (const file of tree.files.filter((item) => [".js", ".mjs"].includes(extname(item.path)))) {
  const parsed = spawnSync(process.execPath, ["--check", join(app, file.path)], { encoding: "utf8" });
  check(parsed.status === 0, `${file.path}: JS parse failed: ${parsed.stderr}`);
}

if (shotDetails.length) console.log(`Screenshots:\n  ${shotDetails.join("\n  ")}`);
console.log(`${failures.length ? "FAIL" : "PASS"} dossier_matches: ${outputDossier.length} bytes, sha comparison byte-for-byte`);
console.log(`${failures.length ? "FAIL" : "PASS"} app_files: ${tree.count} entries, ${tree.totalBytes} bytes, index.html ${index.length} bytes, no symlinks/special files`);
console.log(`${failures.length ? "FAIL" : "PASS"} screenshots: ${shots.length}, caps 262144 bytes / 1280 long side / 480 short side`);
console.log(`${referenceErrors.length ? "FAIL" : "PASS"} references: ${visited.size} modules, all HTML/CSS/import references local and resolved`);
console.log(`${failures.some((failure) => failure.includes("parse")) ? "FAIL" : "PASS"} js_parses: ${tree.files.filter((item) => [".js", ".mjs"].includes(extname(item.path))).length} modules`);
if (failures.length) {
  console.error(`VERIFY FAILED (${failures.length})\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("VERIFY OK");
