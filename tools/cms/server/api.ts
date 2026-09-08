import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PostStore, StoreError } from './store.js';
import { PathError, resolvePaths, type CmsConfig } from './paths.js';
export function createApi(store: PostStore, config: CmsConfig, root?: string) {
  const app = new Hono();
  app.use('*', async (c,next) => {
    if (!['localhost:4000','127.0.0.1:4000'].includes(c.req.header('host') ?? '')) return c.json({error:'Local access only.'},403);
    const origin = c.req.header('origin');
    if ((origin && !['http://localhost:4000','http://127.0.0.1:4000'].includes(origin)) || c.req.header('sec-fetch-site') === 'cross-site') return c.json({error:'Cross-origin access denied.'},403);
    if (!['GET','HEAD'].includes(c.req.method) && (!c.req.header('content-type')?.startsWith('application/json') || c.req.header('x-karma-request') !== '1')) return c.json({error:'Expected a local JSON request.'},403);
    c.header('Cache-Control','no-store');
    await next();
  });
  app.use('*',bodyLimit({maxSize:2*1024*1024,onError:c => c.json({error:'Articles must be under 2 MB.'},413)}));
  app.get('/api/config', async c => { if (root) await resolvePaths(root, config); return c.json(config); });
  app.get('/api/posts', async c => c.json(await store.list()));
  app.get('/api/post', async c => c.json(await store.get(c.req.query('id') ?? '')));
  app.post('/api/posts', async c => c.json(await store.save(await c.req.json(),true),201));
  app.put('/api/post', async c => c.json(await store.save(await c.req.json())));
  app.delete('/api/post', async c => { const body = await c.req.json(); await store.remove(body.id,body.revision); return c.json({ok:true}); });
  app.notFound(c => c.json({error:'API endpoint not found.'},404));
  app.onError((error,c) => { if (error instanceof PathError) return c.json({error:error.message},422); if (error instanceof StoreError) return c.json({error:error.message},error.status as 400); if (error instanceof SyntaxError) return c.json({error:'Invalid JSON.'},400); console.error(error); return c.json({error:'Could not access content. Check the CMS terminal.'},500); });
  return app;
}
