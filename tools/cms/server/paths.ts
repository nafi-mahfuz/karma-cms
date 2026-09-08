import { promises as fs, constants } from 'node:fs';
import path from 'node:path';

export class PathError extends Error {}
export interface CmsConfig { contentDir: string; mediaDir: string; siteUrl: string; previewPath?: string }

export async function assertDirectory(directory: string, label: string) {
  let current = path.parse(path.resolve(directory)).root;
  try {
    for (const part of path.relative(current, path.resolve(directory)).split(path.sep)) {
      current = path.join(current, part);
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new PathError(`${label}: symlinked directories are not supported (${current}).`);
      if (!stat.isDirectory()) throw new PathError(`${label}: expected a directory, but found a file (${current}).`);
    }
    await fs.access(directory, constants.R_OK | constants.W_OK);
  } catch (error) {
    if (error instanceof PathError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new PathError(`${label}: directory does not exist (${directory}). Create it or update cms.config.ts.`);
    if (code === 'EACCES' || code === 'EPERM') throw new PathError(`${label}: directory must be readable and writable (${directory}).`);
    throw error;
  }
}

export async function resolvePaths(root: string, config: CmsConfig) {
  const resolve = (value: unknown, label: string) => {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0') || path.isAbsolute(value)) throw new PathError(`${label}: use a non-empty repository-relative path in cms.config.ts.`);
    const target = path.resolve(root, value);
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new PathError(`${label}: must point to a directory inside this repository.`);
    return target;
  };
  const content = resolve(config.contentDir, 'Content path');
  const media = resolve(config.mediaDir, 'Media path');
  await assertDirectory(content, 'Content path');
  await assertDirectory(media, 'Media path');
  return { content, media };
}
