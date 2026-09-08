import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseFrontmatter, patchFrontmatter, newMarkdown } from './frontmatter.js';
import { assertDirectory } from './paths.js';
import type { Post, PostInput } from '../lib/types.js';

export class StoreError extends Error { constructor(message: string, public status = 400) { super(message); } }
const revision = (raw: string) => createHash('sha256').update(raw).digest('hex');
function split(raw: string) {
  try { return parseFrontmatter(raw); } catch (error) { throw new StoreError((error as Error).message,422); }
}
function patch(raw: string, changes: Record<string,unknown>, body?: string) {
  try { return patchFrontmatter(raw,changes,body); } catch (error) { throw new StoreError((error as Error).message,422); }
}
export function validate(value: unknown): asserts value is PostInput {
  if (!value || typeof value !== 'object') throw new StoreError('Expected an article.');
  const p = value as PostInput;
  if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 250) throw new StoreError('Title is required (up to 250 characters).');
  if (typeof p.description !== 'string' || p.description.length > 2000 || typeof p.body !== 'string') throw new StoreError('Invalid description or body.');
  if (typeof p.pubDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.pubDate) || !Number.isFinite(Date.parse(p.pubDate)) || new Date(p.pubDate).toISOString().slice(0,10) !== p.pubDate) throw new StoreError('Choose a valid publication date.');
  for (const key of ['seoTitle','metaDescription','featuredImage','featuredImageAlt'] as const) {
    if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key]!.length > (key === 'seoTitle' ? 250 : 2000))) throw new StoreError(`Invalid ${key}.`);
  }
  if (p.featuredImage && !/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(p.featuredImage)) throw new StoreError('Featured image must be an http(s) URL or a site path beginning with /.');
  if (p.slug !== undefined && (typeof p.slug !== 'string' || p.slug.length > 240 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(p.slug))) throw new StoreError('Slug must contain letters, numbers, hyphens or underscores.');
  if (p.category !== undefined && (typeof p.category !== 'string' || p.category.length > 100)) throw new StoreError('Category must be text (up to 100 characters).');
  if (typeof p.draft !== 'boolean' || !Array.isArray(p.tags) || p.tags.length > 50 || p.tags.some(t => typeof t !== 'string' || t.length > 100)) throw new StoreError('Invalid status or tags.');
}
export class PostStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> { const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next; }
  private async file(id: string) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(id)) throw new StoreError('Use letters, numbers, hyphens, or underscores in the file name.');
    if (id.split('/').some(part=>part.length>240)) throw new StoreError('Each file name must be 240 characters or fewer.');
    const root = path.resolve(this.directory);
    await assertDirectory(root, 'Content path');
    let current = root;
    const file = path.join(root, `${id}.md`);
    current = root;
    for (const part of path.relative(root,file).split(path.sep)) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new StoreError('Symlinked content is not supported.',403); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return file;
  }
  async get(id: string): Promise<Post> {
    const file = await this.file(id);
    let raw: string;
    try { raw = await fs.readFile(file,'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError('Article not found.',404); throw error; }
    const { doc, body } = split(raw);
    const data = doc.toJS();
    const fields = { title: data.title, description: data.description ?? '', pubDate: String(data.pubDate ?? '').slice(0,10), draft: data.draft ?? true, tags: data.tags ?? [], category: data.category ?? '', slug: data.slug ?? id, featuredImage: data.featuredImage ?? '', featuredImageAlt: data.featuredImageAlt ?? '', seoTitle: data.seoTitle ?? '', metaDescription: data.metaDescription ?? '', body };
    validate(fields);
    return { ...fields, id, revision: revision(raw), updatedAt: (await fs.stat(file)).mtime.toISOString(), words: body.trim().split(/\s+/).filter(Boolean).length };
  }
  async list() {
    const ids: string[] = [];
    const walk = async (dir: string, prefix = '') => {
      for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) await walk(path.join(dir,entry.name),`${prefix}${entry.name}/`);
        else if (entry.name.endsWith('.md')) ids.push(`${prefix}${entry.name.slice(0,-3)}`);
      }
    };
    await this.file('_check');
    await walk(this.directory);
    const posts: Post[] = []; const errors: { id: string; message: string }[] = [];
    for (const id of ids) { try { posts.push(await this.get(id)); } catch (error) { errors.push({id,message:(error as Error).message}); } }
    return { posts: posts.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), errors };
  }
  save(input: PostInput, create = false) { return this.serial(async () => {
    validate(input);
    const file = await this.file(input.id);
    if (!input.draft && !input.body.trim()) throw new StoreError('Write an article body before publishing.');
    const slug = input.slug ?? input.id;
    const listing = await this.list();
    if (listing.posts.some(p => p.id !== input.id && (p.slug ?? p.id).toLowerCase() === slug.toLowerCase())) throw new StoreError('An article with that slug already exists.',409);
    let original = '';
    let raw: string;
    if (create) {
      const fields = Object.fromEntries(['title','description','pubDate','draft','tags','category','slug','featuredImage','featuredImageAlt','seoTitle','metaDescription'].filter(key => (input as any)[key] !== undefined).map(key => [key,(input as any)[key]]));
      raw = newMarkdown(fields,input.body);
    } else {
      const previous = await this.get(input.id);
      original = await fs.readFile(file,'utf8');
      if (!input.revision || previous.revision !== input.revision || revision(original) !== input.revision) throw new StoreError('This file changed outside the editor. Reload it before saving to avoid overwriting changes.',409);
      const changes: Record<string,unknown> = {};
      for (const key of ['title','description','pubDate','draft','tags','category','slug','featuredImage','featuredImageAlt','seoTitle','metaDescription'] as const) {
        if (input[key] !== undefined && JSON.stringify(previous[key]) !== JSON.stringify(input[key])) changes[key] = input[key];
      }
      raw = patch(original,changes,input.body);
      if (raw === original) return previous;
    }
    if (create) {
      if (input.id.includes('/')) throw new StoreError('New articles must have a single file name.');
      await this.available(input.id);
      try { await fs.writeFile(file,raw,{flag:'wx'}); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError('An article with that file name already exists.',409); throw error; }
    } else {
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temp,raw,{flag:'wx',mode:(await fs.stat(file)).mode});
        if (revision(await fs.readFile(file,'utf8')) !== input.revision) throw new StoreError('The file changed while saving. Reload before trying again.',409);
        await fs.rename(temp,file);
      } finally { await fs.unlink(temp).catch(() => {}); }
    }
    return this.get(input.id);
  }); }
  private async available(id: string) {
    const file = await this.file(id);
    const names = await fs.readdir(path.dirname(file));
    if (names.some(name => name.toLowerCase() === path.basename(file).toLowerCase())) throw new StoreError('An article with that file name already exists (including capitalization).',409);
    return file;
  }
  duplicate(id: string, target: string, expected: string) { return this.serial(async () => {
    const file = await this.file(id);
    const source = await this.get(id);
    const raw = await fs.readFile(file,'utf8');
    if (!expected || source.revision !== expected || revision(raw) !== expected) throw new StoreError('This file changed. Reload it before duplicating.',409);
    if (path.dirname(id) !== path.dirname(target)) throw new StoreError('Keep the copy in the same folder to preserve relative links and images.');
    const destination = await this.available(target);
    const listing = await this.list();
    if (listing.posts.some(p => p.slug?.toLowerCase() === target.toLowerCase())) throw new StoreError('An article with that slug already exists.',409);
    const content = patch(raw,{title:source.title.slice(0,243)+' (copy)',draft:true,...(split(raw).doc.has('slug') ? {slug:target} : {})});
    try { await fs.writeFile(destination,content,{flag:'wx'}); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError('An article with that file name already exists.',409); throw error; }
    return this.get(target);
  }); }
  rename(id: string, target: string, expected: string) { return this.serial(async () => {
    const file = await this.file(id);
    const source = await this.get(id);
    if (!expected || source.revision !== expected) throw new StoreError('This file changed. Reload it before renaming.',409);
    if (id === target) return source;
    if (path.dirname(id) !== path.dirname(target)) throw new StoreError('Rename within the same folder to preserve relative links and images.');
    const destination = await this.available(target);
    const sourceRaw = await fs.readFile(file,'utf8');
    if (!split(sourceRaw).doc.has('slug') && (await this.list()).posts.some(p => p.id !== id && p.slug?.toLowerCase() === target.toLowerCase())) throw new StoreError('An article with that slug already exists.',409);
    // link() fails if the destination exists; rename() alone could overwrite it.
    try { await fs.link(file,destination); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StoreError('An article with that file name already exists.',409); throw error; }
    try {
      if (revision(await fs.readFile(file,'utf8')) !== expected || revision(await fs.readFile(destination,'utf8')) !== expected) throw new StoreError('The file changed while renaming. Reload before trying again.',409);
      await fs.unlink(file);
    } catch (error) { await fs.unlink(destination); throw error; }
    return this.get(target);
  }); }
  remove(id: string, expected: string) { return this.serial(async () => {
    const file = await this.file(id);
    const post = await this.get(id);
    if (!expected || post.revision !== expected) throw new StoreError('This file changed. Reload it before deleting.',409);
    await fs.unlink(file);
  }); }
}
