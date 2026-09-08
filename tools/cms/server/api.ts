import path from 'node:path';
import { loadSettings, saveSettings, defaultSettings } from './settings.js';
import { MediaStore } from './media.js';
import { TaxonomyStore } from './taxonomy.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PostStore, StoreError } from './store.js';
import { PathError, resolvePaths, type CmsConfig } from './paths.js';
export function createApi(store: PostStore, config: CmsConfig, root?: string) {
  const app = new Hono();
  let activeConfig=defaultSettings(config);
  let queue:Promise<void>=Promise.resolve();

  app.use('*', async (c,next) => {
    if (!['localhost:4000','127.0.0.1:4000'].includes(c.req.header('host') ?? '')) return c.json({error:'Local access only.'},403);
    const origin = c.req.header('origin');
    if ((origin && !['http://localhost:4000','http://127.0.0.1:4000'].includes(origin)) || c.req.header('sec-fetch-site') === 'cross-site') return c.json({error:'Cross-origin access denied.'},403);
    if (!['GET','HEAD'].includes(c.req.method) && (!c.req.header('content-type')?.startsWith('application/json') || c.req.header('x-karma-request') !== '1')) return c.json({error:'Expected a local JSON request.'},403);
    c.header('Cache-Control','no-store');
    await next();
  });
  app.use('*',bodyLimit({maxSize:9*1024*1024,onError:c => c.json({error:'Request too large. Images must be under 6 MB.'},413)}));
  // Keep settings changes, uploads and article writes on one local operation queue.
  app.use('*',async(c,next)=>{
    const previous=queue;let release!:()=>void;queue=new Promise(resolve=>{release=resolve;});await previous;
    try{if(root&&!['/api/settings','/api/config'].includes(c.req.path))await resolvePaths(root,activeConfig);await next();}finally{release();}
  });
  const media=()=>{if(!root)throw new StoreError('Media requires a repository root.',422);return new MediaStore(root,activeConfig,store);};
  const taxonomy=()=>{if(!root)throw new StoreError('Taxonomy requires a repository root.',422);return new TaxonomyStore(root,store,activeConfig.contentDir);};
  app.get('/api/settings',async c=>{if(!root)throw new StoreError('Settings require a repository root.',422);return c.json(await loadSettings(root,config));});
  app.put('/api/settings',async c=>{
    if(!root)throw new StoreError('Settings require a repository root.',422);
    const input=await c.req.json();if(!input)throw new StoreError('Expected settings.');
    const result=await saveSettings(root,input.data,input.revision);
    activeConfig=result.data;store=new PostStore(path.resolve(root,activeConfig.contentDir));return c.json(result);
  });
  app.get('/api/taxonomies',async c=>c.json(await taxonomy().list()));
  app.post('/api/taxonomies',async c=>c.json(await taxonomy().mutate(await c.req.json())));
  app.get('/api/media',async c=>c.json(await media().list()));
  app.get('/api/media/file',async c=>{const image=await media().read(c.req.query('name')??'');c.header('Content-Type',image.type);c.header('X-Content-Type-Options','nosniff');return c.body(new Uint8Array(image.bytes));});
  app.post('/api/media',async c=>c.json(await media().upload(await c.req.json()),201));
  app.put('/api/media',async c=>c.json(await media().update(await c.req.json())));
  app.delete('/api/media',async c=>c.json(await media().remove(await c.req.json())));
  app.get('/api/config', async c => { if (root) await resolvePaths(root, activeConfig); return c.json(activeConfig); });
  app.get('/api/posts', async c => c.json(await store.list()));
  app.get('/api/post', async c => c.json(await store.get(c.req.query('id') ?? '')));
  app.use('/api/post*',bodyLimit({maxSize:2*1024*1024,onError:c=>c.json({error:'Articles must be under 2 MB.'},413)}));
  app.post('/api/posts', async c => c.json(await store.save(await c.req.json(),true),201));
  app.post('/api/post/duplicate', async c => { const b = await c.req.json(); if (!b || typeof b.target !== 'string') throw new StoreError('A destination file name is required.'); return c.json(await store.duplicate(b.id,b.target,b.revision),201); });
  app.post('/api/post/rename', async c => { const b = await c.req.json(); if (!b || typeof b.target !== 'string') throw new StoreError('A destination file name is required.'); return c.json(await store.rename(b.id,b.target,b.revision)); });
  app.put('/api/post', async c => c.json(await store.save(await c.req.json())));
  app.delete('/api/post', async c => { const body = await c.req.json(); await store.remove(body.id,body.revision); return c.json({ok:true}); });
  // Serve local image URLs in the rich editor without changing stored Markdown URLs.
  app.get('*',async c=>{
    if(!root)return c.json({error:'Not found.'},404);
    const prefix='/'+path.relative(path.join(root,'public'),path.resolve(root,activeConfig.mediaDir)).split(path.sep).map(encodeURIComponent).join('/')+'/';
    if(!c.req.path.startsWith(prefix))return c.json({error:'Image not found.'},404);
    const image=await media().read(decodeURIComponent(c.req.path.slice(prefix.length)));
    c.header('Content-Type',image.type);c.header('X-Content-Type-Options','nosniff');return c.body(new Uint8Array(image.bytes));
  });
  app.notFound(c => c.json({error:'API endpoint not found.'},404));
  app.onError((error,c) => { if (error instanceof PathError) return c.json({error:error.message},422); if (error instanceof StoreError) return c.json({error:error.message},error.status as 400); if (error instanceof SyntaxError) return c.json({error:'Invalid JSON.'},400); console.error(error); return c.json({error:'Could not access content. Check the CMS terminal.'},500); });
  return app;
}
