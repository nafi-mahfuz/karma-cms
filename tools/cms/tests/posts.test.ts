import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PostStore } from '../server/store.js';
import { createApi } from '../server/api.js';
import { filterPosts } from '../lib/dashboard.js';
async function setup(t:any,raw='---\ntitle: Original\npubDate: 2026-09-08\n---\n\n# Keep this\n\n[ref]: /image.png\n') {
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'karma-posts-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'original.mdx'),raw);
  return {root,store:new PostStore(root),raw};
}
test('opening and saving minimal frontmatter preserves bytes and mtime without adding defaults',async t=>{
  const {root,store,raw}=await setup(t);
  const file=path.join(root,'original.mdx'); const before=(await fs.stat(file)).mtimeMs;
  await store.save(await store.get('original'));
  assert.equal(await fs.readFile(file,'utf8'),raw);
  assert.equal((await fs.stat(file)).mtimeMs,before);
});
test('metadata edits patch only changed values, preserving BOM, CRLF, comments, timestamps, quoting and body',async t=>{
  const raw='\uFEFF---\r\n# Greeting\r\ntitle: \'Original\' # title note\r\npubDate: 2026-09-08T15:30:00Z\r\ncustom:   { one: 1, two: "2" } # spacing\r\nsummary: |\r\n  A multiline\r\n  value\r\n---\r\n\r\n# Keep  spacing\r\n';
  const {root,store}=await setup(t,raw);
  const p=await store.get('original'); await store.save({...p,title:'Changed'});
  assert.equal(await fs.readFile(path.join(root,'original.mdx'),'utf8'),raw.replace("'Original'",'"Changed"'));
});
test('editing body preserves the exact frontmatter, while category persists when explicitly edited',async t=>{
  const {root,store,raw}=await setup(t);
  const p=await store.get('original');const changed=await store.save({...p,body:'New body\n'});
  assert.equal(await fs.readFile(path.join(root,'original.mdx'),'utf8'),raw.slice(0,raw.indexOf('\n\n#'))+'\nNew body\n');
  const category=await store.save({...changed,category:'Engineering'});assert.equal(category.category,'Engineering');
});
test('block scalar and block list changes preserve unrelated fields',async t=>{
  const raw='---\ntitle: Original\npubDate: 2026-09-08\ndescription: |\n  Long description\n  Second line\ntags:\n  - first\n  - second\ncustom:  true # unchanged\n---\nbody\n';
  const {root,store}=await setup(t,raw);const p=await store.get('original');
  const changed=await store.save({...p,description:'Short',tags:['New']});
  assert.equal(changed.description,'Short');assert.deepEqual(changed.tags,['New']);
  assert.match(await fs.readFile(path.join(root,'original.mdx'),'utf8'),/custom:  true # unchanged/);
});
test('duplicate preserves original, body and unknown fields, creates draft and rejects collisions/stale revisions',async t=>{
  const raw='---\ntitle: Original\npubDate: 2026-09-08\ndraft: false\ncustom:   [a, b] # untouched\n---\n\nBody **exactly**.\n';
  const {root,store}=await setup(t,raw);const p=await store.get('original');
  const copy=await store.duplicate(p.id,'original-copy',p.revision);
  assert.equal(copy.title,'Original (copy)');assert.equal(copy.draft,true);assert.equal(copy.body,p.body);
  assert.equal(await fs.readFile(path.join(root,'original.mdx'),'utf8'),raw);
  assert.match(await fs.readFile(path.join(root,'original-copy.mdx'),'utf8'),/custom:   \[a, b\] # untouched/);
  await assert.rejects(store.duplicate(p.id,'ORIGINAL-COPY',p.revision),/already exists/);
  await store.save({...p,title:'Edited'});
  await assert.rejects(store.duplicate(p.id,'another-copy',p.revision),/changed/);
});
test('rename is byte-preserving, does not overwrite collisions, and rejects unsafe paths and stale revisions',async t=>{
  const {root,store,raw}=await setup(t);const p=await store.get('original');
  await fs.writeFile(path.join(root,'taken.mdx'),'existing unrelated content');
  await assert.rejects(store.rename(p.id,'taken',p.revision),/already exists/);
  assert.equal(await fs.readFile(path.join(root,'taken.mdx'),'utf8'),'existing unrelated content');
  for(const target of ['../outside','folder/new','ORIGINAL']) await assert.rejects(store.rename(p.id,target,p.revision));
  await assert.rejects(store.rename(p.id,'new-name','stale'),/changed/);
  const renamed=await store.rename(p.id,'new-name',p.revision);
  assert.equal(renamed.revision,p.revision);assert.equal(await fs.readFile(path.join(root,'new-name.mdx'),'utf8'),raw);
  await assert.rejects(fs.stat(path.join(root,'original.mdx')),{code:'ENOENT'});
});
test('concurrent duplicate and rename destinations cannot overwrite each other',async t=>{
  const {store}=await setup(t);const p=await store.get('original');
  const results=await Promise.allSettled([store.duplicate(p.id,'target',p.revision),store.rename(p.id,'target',p.revision)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await store.get('original')).title,'Original');
});
test('category, status, search, sorting, and no-results combine correctly',async t=>{
  const {store}=await setup(t);const p=await store.get('original');
  const posts=[{...p,id:'b',title:'Beta',category:'Engineering',draft:false},{...p,id:'a',title:'Alpha',category:'Notes',draft:true}];
  assert.deepEqual(filterPosts(posts,'','all','all','title').map(p=>p.id),['a','b']);
  assert.deepEqual(filterPosts(posts,'ENGINEER','published','value:Engineering','title').map(p=>p.id),['b']);
  assert.equal(filterPosts(posts,'','drafts','value:Engineering','title').length,0);
  assert.equal(filterPosts(posts,'missing','all','all','updated').length,0);
  assert.deepEqual(filterPosts(posts,'','all','all','title-desc').map(p=>p.id),['b','a']);
});
test('new API operations validate requests and enforce revisions',async t=>{
  const {root,store}=await setup(t);const app=createApi(store,{contentDir:root,mediaDir:root,siteUrl:'http://localhost:4321'});
  const p=await store.get('original');
  const request=(endpoint:string,body:unknown)=>app.request('http://localhost:4000/api/post/'+endpoint,{method:'POST',headers:{host:'localhost:4000','content-type':'application/json','x-karma-request':'1'},body:JSON.stringify(body)});
  assert.equal((await request('duplicate',null)).status,400);
  assert.equal((await request('duplicate',{id:p.id,target:'copy',revision:p.revision})).status,201);
  assert.equal((await request('rename',{id:p.id,target:'renamed',revision:'stale'})).status,409);
  assert.equal((await request('rename',{id:p.id,target:'renamed',revision:p.revision})).status,200);
});
