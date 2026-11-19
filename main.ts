import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const repository = dirname(fileURLToPath(import.meta.url));

function outputArgument(arguments_: string[]) {
  if (arguments_.length === 0) return process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  if (arguments_.length === 2 && arguments_[0] === "--output" && arguments_[1].trim()) return arguments_[1];
  throw new Error("Usage: node main.ts [--output DIRECTORY]\nOr set MAKEFUN_OUTPUT_DIR. The grader default is /output.");
}

const output = resolve(outputArgument(process.argv.slice(2)));
if (output === repository || output === resolve(repository, "app") || output === resolve(repository, "screenshots")) {
  throw new Error("Refusing to use a source directory as the submission output.");
}
for (const required of ["app/index.html", "app/src/studio.js", "app/src/cover-art.js", "vendor/makefun-app.ts"]) {
  if (!existsSync(resolve(repository, required)) || !lstatSync(resolve(repository, required)).isFile()) {
    throw new Error(`Required regular file is missing: ${required}`);
  }
}
const shots = existsSync(resolve(repository, "screenshots")) ? readdirSync(resolve(repository, "screenshots")) : [];
if (shots.length < 3 || shots.length > 4) throw new Error(`Expected 3 or 4 screenshots, found ${shots.length}. Run tools/capture.mjs first.`);

mkdirSync(output, { recursive: true });
cpSync(resolve(repository, "app"), resolve(output, "app"), { recursive: true, force: true });
cpSync(resolve(repository, "screenshots"), resolve(output, "screenshots"), { recursive: true, force: true });
const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(resolve(output, "dossier.json"), dossier);
console.log(`Submission app: ${resolve(output, "app")}`);
console.log(`Screenshots: ${shots.length}`);
console.log(`Dossier: ${dossier.length} bytes at ${resolve(output, "dossier.json")}`);
