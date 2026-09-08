import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import defaults from '../../../cms.config.js';
import { loadSettings } from './settings.js';
import { PostStore } from './store.js';
import { resolvePaths } from './paths.js';
import { createApi } from './api.js';
const root = fileURLToPath(new URL('../../../',import.meta.url));
const client = path.join(root,'tools/cms/client');
const config=(await loadSettings(root,defaults)).data;
// Keep settings available even if a configured content directory was moved.
const paths = {content:path.resolve(root,config.contentDir)};
await resolvePaths(root, config).catch(error => {
  console.error(`Karma CMS configuration error: ${error.message}`);

});
const app = createApi(new PostStore(paths.content),config,root);
const server = createServer();
const vite = await createViteServer({
  configFile:false, root:client, publicDir:false,
  resolve:{alias:{'@':path.join(root,'tools/cms/editor/tiptap')}},
  esbuild:{jsx:'automatic'},
  server:{middlewareMode:true,hmr:{server},allowedHosts:['localhost','127.0.0.1'],fs:{strict:true,allow:[path.join(root,'tools/cms')]}},
  appType:'spa',
});
const api = getRequestListener(app.fetch);
server.on('request',(req,res) => {
  const origin = req.headers.origin;
  if (!['localhost:4000','127.0.0.1:4000'].includes(req.headers.host ?? '') || (origin && !['http://localhost:4000','http://127.0.0.1:4000'].includes(origin)) || req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403); res.end('Local access only.'); return; }
  if (req.url?.split('?')[0].startsWith('/api/') || /\.(png|jpe?g|gif|webp)$/i.test(req.url?.split('?')[0] || '')) void api(req,res);
  else vite.middlewares(req,res);
});
server.on('error',async error => { console.error('Karma CMS could not start:',error.message); await vite.close(); process.exit(1); });
server.listen(4000,'127.0.0.1',() => console.log('\n  ✳ Karma CMS → http://localhost:4000\n  Content: '+config.contentDir+'\n  Media: '+config.mediaDir+'\n  Local files. Yours to keep.\n'));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,async () => { await vite.close(); server.close(); process.exit(0); });
