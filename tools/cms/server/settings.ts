import path from 'node:path';
import { resolvePaths, type CmsConfig, PathError } from './paths.js';
import { readJson, writeJson } from './json-file.js';
export interface Settings extends CmsConfig { previewPath:string }
export const defaultSettings = (config:CmsConfig):Settings => ({...config,previewPath:config.previewPath ?? '/blog/{slug}/'});
export async function validateSettings(root:string,value:unknown):Promise<Settings> {
  if(!value || typeof value!=='object')throw new PathError('Expected settings.');
  const v=value as Settings;
  if(typeof v.siteUrl!=='string')throw new PathError('Enter an Astro website URL.');
  let url:URL;try{url=new URL(v.siteUrl);}catch{throw new PathError('Enter a valid http(s) Astro website URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new PathError('Use an http(s) URL without credentials, query or fragment.');
  if(typeof v.previewPath!=='string'||!v.previewPath.startsWith('/')||v.previewPath.startsWith('//')||v.previewPath.includes('\\')||v.previewPath.split('{slug}').length!==2||/[\s?#]/.test(v.previewPath))throw new PathError('Preview path must start with / and contain {slug} exactly once, without spaces, a query, or a fragment.');
  const settings={contentDir:v.contentDir,mediaDir:v.mediaDir,siteUrl:v.siteUrl.replace(/\/$/,''),previewPath:v.previewPath};
  const paths=await resolvePaths(root,settings);
  const publicRoot=path.join(root,'public');
  if(!paths.media.startsWith(publicRoot+path.sep))throw new PathError('Media directory must be inside public/ so Astro can serve uploaded images.');
  for(const target of [paths.content,paths.media]){
    if(target===path.join(root,'tools')||target.startsWith(path.join(root,'tools')+path.sep)||target.includes(path.sep+'node_modules'+path.sep)||target.includes(path.sep+'.git'+path.sep))throw new PathError('Content and media must be outside CMS tools, dependencies and Git metadata.');
  }
  if(paths.content===paths.media || paths.content.startsWith(paths.media+path.sep)||paths.media.startsWith(paths.content+path.sep))throw new PathError('Content and media directories must be separate.');
  return settings;
}
export const loadSettings=(root:string,fallback:CmsConfig)=>readJson<Settings>(path.join(root,'cms.settings.json'),defaultSettings(fallback));
export async function saveSettings(root:string,value:unknown,revision:string){const data=await validateSettings(root,value);return writeJson(path.join(root,'cms.settings.json'),data,revision);}
