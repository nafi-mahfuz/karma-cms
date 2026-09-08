import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PostStore } from '../server/store';
import { MediaStore } from '../server/media';
import { TaxonomyStore } from '../server/taxonomy';
import { defaultSettings, validateSettings, saveSettings, loadSettings } from '../server/settings';
import { createApi } from '../server/api';
import { manage } from '../bin/karma-cms.mjs';
import { previewUrl } from '../lib/editor';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5l8AAAAASUVORK5CYII=';
const config={contentDir:'src/content/blog',mediaDir:'public/media',siteUrl:'http://localhost:4321',previewPath:'/blog/{slug}/'};
const article={id:'sample',title:'Sample',description:'',pubDate:'2026-09-08',draft:true,tags:['Design'],category:'Notes',body:'Body'};
async function setup(t:any){const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'karma-v1-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const dir of ['src/content/blog','public/media','src/content/other','public/other','tools/cms'])await fs.mkdir(path.join(root,dir),{recursive:true});const posts=new PostStore(path.join(root,config.contentDir));return {root,posts,media:new MediaStore(root,config,posts),taxonomy:new TaxonomyStore(root,posts,config.contentDir)};}
test('media uploads have unique names, detect types, persist alt text and reject unsafe paths',async t=>{
  const {root,media}=await setup(t);
  const first=await media.upload({name:'Cover.png',data:png,alt:'A cover'});const second=await media.upload({name:'Cover.png',data:png,alt:''});assert.notEqual(first.name,second.name);
  assert.match(first.url,/^\/media\/Cover-.*\.png$/);const listing=await media.list();assert.equal(listing.items.length,2);const item=listing.items.find(i=>i.name===first.name)!;
  assert.equal(item.alt,'A cover');await media.update({...item,alt:'Updated cover'});assert.equal((await media.list()).items.find(i=>i.name===first.name)!.alt,'Updated cover');
  await assert.rejects(media.update({...item,alt:'Stale'}),/changed/);
  for(const name of ['../outside.png','/absolute.png','a/../../escape.png'])await assert.rejects(media.read(name));
  await fs.symlink(path.join(root,'package.json'),path.join(root,config.mediaDir,'linked.png'));await assert.rejects(media.read('linked.png'),/regular/);
  await assert.rejects(media.upload({name:'fake.jpg',data:png,alt:''}),/extension/);
  await assert.rejects(media.upload({name:'bad.svg',data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),alt:''}),/PNG/);
  await assert.rejects(media.upload({name:'big.png',data:'A'.repeat(9*1024*1024),alt:''}),/6 MB/);
});
test('media deletion protects article references, unreadable content and externally changed images',async t=>{
  const {root,posts,media}=await setup(t);const uploaded=await media.upload({name:'cover.png',data:png,alt:''});const item=(await media.list()).items[0];
  let post=await posts.save({...article,featuredImage:uploaded.url},true);await assert.rejects(media.remove(item),/used/);
  post=await posts.save({...post,featuredImage:'',body:`![Cover](${uploaded.url})`});await assert.rejects(media.remove(item),/used/);
  post=await posts.save({...post,body:'Body'});
  await fs.writeFile(path.join(root,config.contentDir,'broken.md'),'bad');await assert.rejects(media.remove(item),/unreadable/);await fs.unlink(path.join(root,config.contentDir,'broken.md'));
  await fs.appendFile(path.join(root,config.mediaDir,item.name),'changed');await assert.rejects(media.remove(item),/changed/);
  await media.remove((await media.list()).items[0]);assert.equal((await media.list()).items.length,0);
});
test('taxonomy catalogs merge article names, enforce usage, prevent duplicates and preserve article bytes',async t=>{
  const {root,posts,taxonomy}=await setup(t);await posts.save(article,true);const raw=await fs.readFile(path.join(root,config.contentDir,'sample.md'),'utf8');
  let listing=await taxonomy.list();assert.equal(listing.categories[0].count,1);assert.equal(listing.tags[0].name,'Design');
  listing=await taxonomy.mutate({kind:'categories',name:'Travel',action:'create',revision:listing.revision});
  await assert.rejects(taxonomy.mutate({kind:'categories',name:'travel',action:'create',revision:listing.revision}),/already/);
  await assert.rejects(taxonomy.mutate({kind:'categories',name:'Notes',action:'delete',revision:listing.revision}),/used/);
  listing=await taxonomy.mutate({kind:'categories',name:'Travel',target:'Journeys',action:'rename',revision:listing.revision});
  listing=await taxonomy.mutate({kind:'categories',name:'Journeys',action:'delete',revision:listing.revision});assert.equal(listing.categories.length,1);
  assert.equal(await fs.readFile(path.join(root,config.contentDir,'sample.md'),'utf8'),raw);
});
test('settings validate paths and previews, protect revisions and switch collections without moving data',async t=>{
  const {root,posts}=await setup(t);await posts.save(article,true);
  assert.deepEqual(await validateSettings(root,config),config);
  for(const patch of [{contentDir:'../escape'},{mediaDir:'src/content/other'},{mediaDir:'public'},{mediaDir:'public/missing'},{contentDir:'tools/cms'},{siteUrl:'javascript:alert(1)'},{previewPath:'//external/{slug}'},{previewPath:'/blog/'},{previewPath:'/a/{slug}/{slug}'}])await assert.rejects(validateSettings(root,{...config,...patch}));
  await fs.symlink(path.join(root,'src/content/blog'),path.join(root,'src/content/linked'));await assert.rejects(validateSettings(root,{...config,contentDir:'src/content/linked'}),/symlink/);
  const result=await saveSettings(root,{...config,contentDir:'src/content/other',mediaDir:'public/other',previewPath:'/journal/{slug}/'},'missing');
  assert.equal((await loadSettings(root,config)).data.contentDir,'src/content/other');await assert.rejects(saveSettings(root,config,'missing'),/changed/);
  assert.equal((await posts.get('sample')).title,'Sample');assert.equal(result.data.previewPath,'/journal/{slug}/');assert.equal(previewUrl('http://localhost:4321','a-story',result.data.previewPath),'http://localhost:4321/journal/a-story/');
});
test('API settings apply immediately, serializes conflicting changes and keeps local access rules',async t=>{
  const {root,posts}=await setup(t);await posts.save(article,true);const app=createApi(posts,config,root);
  const headers={host:'localhost:4000','content-type':'application/json','x-karma-request':'1'};
  const req=(endpoint:string,method='GET',body?:unknown)=>app.request('http://localhost:4000/api/'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await req('media','POST',{name:'cover.png',data:png,alt:'Cover'})).status,201);
  assert.equal((await app.request('http://localhost:4000/api/media',{method:'POST',headers:{...headers,origin:'https://foreign.example'},body:'{}'})).status,403);
  const state=await (await req('settings')).json();const outcomes=await Promise.all([req('settings','PUT',{data:{...state.data,contentDir:'src/content/other',mediaDir:'public/other'},revision:state.revision}),req('settings','PUT',{data:state.data,revision:state.revision})]);assert.deepEqual(outcomes.map(r=>r.status),[200,409]);
  assert.equal((await (await req('posts')).json()).posts.length,0);assert.equal((await (await req('media')).json()).items.length,0);
  assert.equal((await req('posts','POST',{...article,body:'x'.repeat(2*1024*1024)})).status,413);
  assert.equal((await posts.get('sample')).title,'Sample');
});
test('installer dry run, repeat init and remover preserve all application and user files',async t=>{
  const {root}=await setup(t);const pkg={name:'journal',scripts:{dev:'astro dev',build:'astro build'},dependencies:{astro:'*'}};
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify(pkg,null,2));await fs.writeFile(path.join(root,'tools/cms/package.json'),JSON.stringify({scripts:{dev:'tsx server/index.ts'}}));
  const protectedFiles={'src/content/blog/article.md':'user content','public/media/cover.png':png,'src/content.config.ts':'Astro schema','src/pages/index.astro':'Astro page','cms.settings.json':'settings','cms.media.json':'alt text','tools/cms/custom.txt':'custom CMS file'};
  await fs.mkdir(path.join(root,'src/pages'));for(const [name,content]of Object.entries(protectedFiles))await fs.writeFile(path.join(root,name),content);
  const original=await fs.readFile(path.join(root,'package.json'),'utf8');await manage('init',root,{dryRun:true});assert.equal(await fs.readFile(path.join(root,'package.json'),'utf8'),original);
  await manage('init',root);await manage('init',root);let installed=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));assert.match(installed.scripts.cms,/tools\/cms/);
  installed.scripts['cms:test']='my-custom-tests';await fs.writeFile(path.join(root,'package.json'),JSON.stringify(installed));
  await manage('remove',root);await manage('remove',root);installed=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));assert.equal(installed.scripts.cms,undefined);assert.equal(installed.scripts['cms:test'],'my-custom-tests');assert.equal(installed.scripts.build,'astro build');assert.deepEqual(installed.dependencies,pkg.dependencies);
  for(const [name,content]of Object.entries(protectedFiles))assert.equal(await fs.readFile(path.join(root,name),'utf8'),content);
});
test('installer refuses script collisions, symlinks and forged ownership without altering files',async t=>{
  const {root}=await setup(t);await fs.writeFile(path.join(root,'tools/cms/package.json'),JSON.stringify({scripts:{dev:'cms'}}));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{cms:'user-script'}}));await assert.rejects(manage('init',root),/already exists/);
  await fs.writeFile(path.join(root,'.karma-cms-install.json'),JSON.stringify({version:1,scripts:['build']}));await assert.rejects(manage('remove',root),/Unrecognized/);
  await fs.unlink(path.join(root,'.karma-cms-install.json'));await fs.symlink(path.join(root,'package.json'),path.join(root,'.karma-cms-install.json'));await assert.rejects(manage('remove',root),/non-regular/);
});
