#!/usr/bin/env node
// Karma CMS integration CLI.
//   karma-cms init    — scaffold the CMS into an Astro project (vendors tools/cms, config, scripts)
//   karma-cms remove  — uninstall the CMS, preserving all content the user created:
//                       blogs, images, media, categories, tags, schemas and Astro app files.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Scripts Karma registers in the host package.json.
const commands = { cms: 'npm --prefix tools/cms run dev', 'cms:check': 'npm --prefix tools/cms run check', 'cms:test': 'npm --prefix tools/cms test' };
const INSTALL_DIR = 'tools/cms';
const MARKER = '.karma-cms-install.json';
// Karma-owned configuration files. `remove` deletes these. It never touches the user's content:
// cms.taxonomies.json (categories/tags) and cms.media.json (media alt text) are preserved, as are
// src/**, public/** and dist/**.
const CONFIG_FILES = ['cms.config.ts', 'cms.settings.json'];
// The package template sits alongside this bin: …/tools/cms/bin/karma-cms.mjs → …/tools/cms
const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_TEMPLATE = `// Local editor configuration. Astro never imports this file.
export default {
  contentDir: 'src/content/blog',
  mediaDir: 'public/media',
  siteUrl: 'http://localhost:4321',
};
`;

async function read(file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing non-regular file: ${file}`);
  return fs.readFile(file, 'utf8');
}
async function replace(file, expected, value) {
  if (await read(file) !== expected) throw new Error(`${file} changed. Retry after reviewing it.`);
  const temp = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temp, value, { flag: 'wx' }); if (await read(file) !== expected) throw new Error('File changed while writing.'); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
async function lstat(p) { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }

// Vendor CMS source only: never copy installed dependencies, tmp files, or a stale install marker.
const copyFilter = (src) => {
  const base = path.basename(src);
  return base !== 'node_modules' && base !== MARKER && !base.endsWith('.tmp');
};

export async function manage(command, root, { dryRun = false, source = PACKAGE_ROOT } = {}) {
  if (!['init', 'remove'].includes(command)) throw new Error('Usage: karma-cms <init|remove> [--dry-run]');
  root = await fs.realpath(root);
  const packageFile = path.join(root, 'package.json');
  const raw = await read(packageFile);
  const pkg = JSON.parse(raw);
  if (pkg.scripts !== undefined && (!pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts))) throw new Error('Invalid package.json scripts.');
  const markerPath = path.join(root, MARKER);
  let manifest = null;
  try { manifest = JSON.parse(await read(markerPath)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (manifest && ((manifest.version !== 1 && manifest.version !== 2) || !Array.isArray(manifest.scripts) || manifest.scripts.some(k => !Object.hasOwn(commands, k)))) throw new Error('Unrecognized installer manifest. No files changed.');

  const scripts = { ...pkg.scripts };
  const installDir = path.join(root, INSTALL_DIR);

  if (command === 'init') {
    // Validate the source template we are copying from.
    const sourceRoot = await fs.realpath(source);
    let sourcePkg;
    try { sourcePkg = JSON.parse(await read(path.join(sourceRoot, 'package.json'))); } catch { throw new Error('CMS source package not found. Reinstall karma-cms.'); }
    if (!sourcePkg.scripts?.dev) throw new Error('CMS source package is missing its dev script.');

    // Never write through a symlinked destination.
    const dirStat = await lstat(installDir);
    if (dirStat?.isSymbolicLink()) throw new Error(`Refusing a symlinked ${INSTALL_DIR}.`);
    if (dirStat && !dirStat.isDirectory()) throw new Error(`${INSTALL_DIR} exists and is not a directory.`);

    // Refuse to clobber a foreign script before touching anything.
    for (const [name, value] of Object.entries(commands)) {
      if (scripts[name] !== undefined && scripts[name] !== value) throw new Error(`Script ${name} already exists with another value. No files changed.`);
    }

    const selfInstall = sourceRoot === installDir; // running init inside the CMS repo itself
    const configPath = path.join(root, 'cms.config.ts');
    const willCreateConfig = !(await lstat(configPath));
    const owned = new Set(manifest?.scripts || []);
    const result = { command, installedDir: INSTALL_DIR, scripts: [...new Set([...owned, ...Object.keys(commands)])], configCreated: willCreateConfig, copied: !selfInstall, preserved: 'All content, media, taxonomies, schemas and Astro application files' };
    if (dryRun) return result;

    // 1. Vendor the CMS source (skip files that already exist so user edits are never overwritten).
    if (!selfInstall) await fs.cp(sourceRoot, installDir, { recursive: true, force: false, errorOnExist: false, filter: copyFilter });
    // 2. Ensure the default content and media directories exist so the CMS starts cleanly.
    for (const dir of ['src/content/blog', 'public/media']) await fs.mkdir(path.join(root, dir), { recursive: true });
    // 3. Create cms.config.ts if the project does not already have one.
    if (willCreateConfig) await fs.writeFile(configPath, CONFIG_TEMPLATE, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    // 4. Register the npm scripts.
    for (const [name, value] of Object.entries(commands)) if (scripts[name] === undefined) { scripts[name] = value; owned.add(name); }
    // 5. Write the manifest (records exactly what remove may reverse), then patch package.json.
    const markerValue = JSON.stringify({ version: 2, scripts: [...owned], installedDir: INSTALL_DIR, configCreated: willCreateConfig }, null, 2) + '\n';
    if (manifest) await replace(markerPath, await read(markerPath), markerValue); else await fs.writeFile(markerPath, markerValue, { flag: 'wx' });
    if (JSON.stringify(pkg.scripts) !== JSON.stringify(scripts)) await replace(packageFile, raw, JSON.stringify({ ...pkg, scripts }, null, 2) + '\n');
    result.scripts = [...owned];
    return result;
  }

  // remove — only ever reverses a recorded installation; a no-op when none is present.
  const preserved = 'Blogs, images, media, categories and tags (cms.taxonomies.json, cms.media.json), plus all Astro application files';
  if (!manifest) return { command, removed: { scripts: [], directory: null, files: [] }, retained: { scripts: [] }, note: 'No Karma CMS installation manifest found here; nothing removed.', preserved };

  const removedScripts = []; const retained = [];
  for (const name of manifest.scripts || []) { if (scripts[name] === commands[name]) { delete scripts[name]; removedScripts.push(name); } else if (scripts[name] !== undefined) retained.push(name); }

  const dir = manifest.installedDir || INSTALL_DIR;
  const dirStat = await lstat(path.join(root, dir));
  const removableDir = !!dirStat && dirStat.isDirectory() && !dirStat.isSymbolicLink();
  const removableConfigs = [];
  for (const name of CONFIG_FILES) { const s = await lstat(path.join(root, name)); if (s && s.isFile() && !s.isSymbolicLink()) removableConfigs.push(name); }

  const result = { command, removed: { scripts: removedScripts, directory: removableDir ? dir : null, files: removableConfigs }, retained: { scripts: retained }, preserved };
  if (dryRun) return result;

  // Apply: scripts first, then the CMS directory, then config files, and the marker last.
  if (removedScripts.length) await replace(packageFile, raw, JSON.stringify({ ...pkg, scripts }, null, 2) + '\n');
  if (removableDir) await fs.rm(path.join(root, dir), { recursive: true, force: true });
  for (const name of removableConfigs) { const p = path.join(root, name); await read(p); await fs.unlink(p); }
  await read(markerPath); await fs.unlink(markerPath);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, ...args] = process.argv;
  if (args.some(arg => arg !== '--dry-run')) { console.error('Only --dry-run is supported.'); process.exitCode = 1; }
  else try {
    const result = await manage(command, process.cwd(), { dryRun: args.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
    if (command === 'init' && !args.includes('--dry-run')) console.log('\nNext: run `npm install --prefix tools/cms`, then `npm run cms`.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
