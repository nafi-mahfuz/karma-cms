import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePaths } from '../server/paths.js';
import { PostStore } from '../server/store.js';
import { createApi } from '../server/api.js';
async function setup(t: any) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'karma-foundation-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  await fs.mkdir(path.join(root,'articles'));
  await fs.mkdir(path.join(root,'images'));
  return {root,config:{contentDir:'articles',mediaDir:'images',siteUrl:'http://localhost:4321'}};
}
test('resolves configurable content and media directories',async t=>{
  const {root,config}=await setup(t);
  assert.deepEqual(await resolvePaths(root,config),{content:path.join(root,'articles'),media:path.join(root,'images')});
});
test('reports missing paths, files, outside paths, and symlinks clearly',async t=>{
  const {root,config}=await setup(t);
  await assert.rejects(resolvePaths(root,{...config,contentDir:'missing'}),/Content path: directory does not exist/);
  await assert.rejects(resolvePaths(root,{...config,mediaDir:'missing'}),/Media path: directory does not exist/);
  await fs.writeFile(path.join(root,'file'),'hello');
  await assert.rejects(resolvePaths(root,{...config,mediaDir:'file'}),/expected a directory/);
  for (const contentDir of ['', '../outside', root, '.']) await assert.rejects(resolvePaths(root,{...config,contentDir}));
  await fs.symlink(path.join(root,'images'),path.join(root,'linked'));
  await assert.rejects(resolvePaths(root,{...config,mediaDir:'linked'}),/symlinked/);
});
test('detects nested Markdown and parses CRLF YAML without changing files',async t=>{
  const {root}=await setup(t);
  const content=path.join(root,'articles');
  await fs.mkdir(path.join(content,'notes'));
  const raw='---\r\ntitle: Existing article\r\npubDate: 2026-09-08\r\ntags: [Astro, Notes]\r\n---\r\n# Original Markdown\r\n';
  const file=path.join(content,'notes','existing.mdx');
  await fs.writeFile(file,raw);
  await fs.writeFile(path.join(content,'invalid.mdx'),'No frontmatter');
  await fs.writeFile(path.join(content,'ignore.txt'),'Not Markdown');
  const result=await new PostStore(content).list();
  assert.equal(result.posts.length,1);
  assert.equal(result.posts[0].id,'notes/existing');
  assert.deepEqual(result.posts[0].tags,['Astro','Notes']);
  assert.match(result.errors[0].message,/Missing YAML frontmatter/);
  assert.equal(await fs.readFile(file,'utf8'),raw);
});
test('API reports missing content and media paths after startup',async t=>{
  const {root,config}=await setup(t);
  const app=createApi(new PostStore(path.join(root,'articles')),config,root);
  const get=(url:string)=>app.request('http://localhost:4000'+url,{headers:{host:'localhost:4000'}});
  assert.equal((await get('/api/config')).status,200);
  await fs.rmdir(path.join(root,'images'));
  const media=await get('/api/config');
  assert.equal(media.status,422);
  assert.match((await media.json()).error,/Media path/);
  await fs.rmdir(path.join(root,'articles'));
  const content=await get('/api/posts');
  assert.equal(content.status,422);
  assert.match((await content.json()).error,/Content path/);
});
