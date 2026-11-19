import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const cli = process.argv.slice(2);
let requestedOutput = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (cli.includes('--help')) {
  console.log('Usage: node main.ts [--output DIRECTORY]\nCopies app/ and screenshots/, then writes the make.fun dossier.');
  process.exit(0);
}
if (cli.length === 2 && cli[0] === '--output') requestedOutput = cli[1];
else if (cli.length !== 0) throw new Error(`Unknown arguments: ${cli.join(' ')}. Use --output DIRECTORY or --help.`);

const output = resolve(requestedOutput);
const sourceApp = resolve(projectRoot, 'app');
const sourceShots = resolve(projectRoot, 'screenshots');
if (output === sep || output === resolve(projectRoot) || output === sourceApp || output === sourceShots) {
  throw new Error(`Refusing unsafe output directory: ${output}`);
}
if (!existsSync(sourceApp) || !lstatSync(sourceApp).isDirectory()) throw new Error('app/ must be a directory beside main.ts.');
if (!existsSync(resolve(sourceApp, 'index.html'))) throw new Error('app/index.html is missing.');
if (!existsSync(sourceShots) || !lstatSync(sourceShots).isDirectory()) throw new Error('screenshots/ must be a directory beside main.ts.');
const shotNames = readdirSync(sourceShots, { withFileTypes: true }).filter(entry => entry.isFile() && !entry.name.startsWith('.'));
if (shotNames.length < 3 || shotNames.length > 4) throw new Error(`Expected 3 or 4 screenshots; found ${shotNames.length}.`);
for (const name of shotNames) {
  if (!lstatSync(resolve(sourceShots, name.name)).isFile()) throw new Error(`Screenshot is not a regular file: ${name.name}`);
}

mkdirSync(output, { recursive: true });
for (const directory of ['app', 'screenshots']) rmSync(resolve(output, directory), { recursive: true, force: true });
rmSync(resolve(output, 'dossier.json'), { force: true });
cpSync(sourceApp, resolve(output, 'app'), { recursive: true, errorOnExist: false });
cpSync(sourceShots, resolve(output, 'screenshots'), { recursive: true, errorOnExist: false });

const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(resolve(output, 'dossier.json'), dossier);
console.log(`Afterhours entry built: ${shotNames.length} screenshots, ${dossier.length} dossier bytes -> ${output}`);
