import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseDocument, Document, isMap } from 'yaml';
import { assertDirectory } from './paths.js';
import type { Post, PostInput } from '../lib/types.js';

export class StoreError extends Error { constructor(message: string, public status = 400) { super(message); } }
const revision = (raw: string) => createHash('sha256').update(raw).digest('hex');
function split(raw: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new StoreError('Missing YAML frontmatter. Add a frontmatter block in your code editor.', 422);
  const doc = parseDocument(match[1]);
  if (doc.errors.length || !isMap(doc.contents)) throw new StoreError('Invalid YAML frontmatter.', 422);
  return { doc, body: raw.slice(match[0].length), prefix: match[0] };
}
export function validate(value: unknown): asserts value is PostInput {
  if (!value || typeof value !== 'object') throw new StoreError('Expected an article.');
  const p = value as PostInput;
  if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 250) throw new StoreError('Title is required (up to 250 characters).');
  if (typeof p.description !== 'string' || p.description.length > 2000 || typeof p.body !== 'string') throw new StoreError('Invalid description or body.');
  if (typeof p.pubDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.pubDate) || !Number.isFinite(Date.parse(p.pubDate)) || new Date(p.pubDate).toISOString().slice(0,10) !== p.pubDate) throw new StoreError('Choose a valid publication date.');
  if (typeof p.draft !== 'boolean' || !Array.isArray(p.tags) || p.tags.length > 50 || p.tags.some(t => typeof t !== 'string' || t.length > 100)) throw new StoreError('Invalid status or tags.');
}
export class PostStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private serial<T>(operation: () => Promise<T>): Promise<T> { const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next; }
  private async file(id: string) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(id)) throw new StoreError('Use letters, numbers, hyphens, or underscores in the file name.');
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
    const fields = { title: data.title, description: data.description ?? '', pubDate: String(data.pubDate ?? '').slice(0,10), draft: data.draft ?? true, tags: data.tags ?? [], body };
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
    let original = ''; let doc = new Document(); let oldBody = ''; let prefix = '';
    if (!create) {
      try { original = await fs.readFile(file,'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError('Article not found.',404); throw error; }
      if (!input.revision || revision(original) !== input.revision) throw new StoreError('This file changed outside the editor. Reload it before saving to avoid overwriting changes.',409);
      ({doc,body:oldBody,prefix} = split(original));
    }
    let changed = create;
    for (const key of ['title','description','pubDate','draft','tags'] as const) {
      const previous = doc.toJS()?.[key];
      if (JSON.stringify(previous) !== JSON.stringify(input[key])) { doc.set(key,input[key]); changed = true; }
    }
    const raw = !changed && oldBody === input.body ? original : `${changed ? `---\n${doc.toString()}---\n` : prefix}${input.body}`;
    if (create) {
      if (input.id.includes('/')) throw new StoreError('New articles must have a single file name.');
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
  remove(id: string, expected: string) { return this.serial(async () => {
    const file = await this.file(id);
    const post = await this.get(id);
    if (!expected || post.revision !== expected) throw new StoreError('This file changed. Reload it before deleting.',409);
    await fs.unlink(file);
  }); }
}
