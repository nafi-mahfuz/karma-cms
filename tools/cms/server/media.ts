import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertDirectory, type CmsConfig } from './paths.js';
import { hash, readJson, writeJson } from './json-file.js';
import { PostStore, StoreError } from './store.js';
export const MAX_IMAGE_BYTES=6*1024*1024;
const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
export function imageType(bytes:Buffer){
  if(bytes.length<12)return null;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return 'image/gif';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}
export interface MediaItem {name:string;url:string;alt:string;bytes:number;revision:string;metadataRevision:string;usedBy:string[]}
export class MediaStore {
  private directory:string;
  constructor(private root:string,private config:CmsConfig,private posts:PostStore){this.directory=path.resolve(root,config.mediaDir);if(!this.directory.startsWith(path.join(root,'public')+path.sep))throw new StoreError('Media directory must be inside public/. Update Settings.',422);}
  private metadataFile(){return path.join(this.root,'cms.media.json');}
  private key(name:string){return this.config.mediaDir+'/'+name;}
  private async metadata(){
    const state=await readJson<Record<string,string>>(this.metadataFile(),{});
    if(!state.data||Array.isArray(state.data)||Object.values(state.data).some(v=>typeof v!=='string'))throw new StoreError('Invalid media metadata. Check cms.media.json.',422);
    return state;
  }
  private async file(name:string){
    await assertDirectory(this.directory,'Media directory');
    if(typeof name!=='string'||!name||name.split('/').some(part=>!part||part.startsWith('.')||! /^[a-zA-Z0-9 _.-]+$/.test(part))||!types[name.split('.').pop()!.toLowerCase()])throw new StoreError('Invalid image file name.');
    const file=path.join(this.directory,name);await assertDirectory(path.dirname(file),'Media directory');
    try {const stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw new StoreError('Media must be a regular image file.',422);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    return file;
  }
  url(name:string){return '/'+path.relative(path.join(this.root,'public'),path.join(this.directory,name)).split(path.sep).map(encodeURIComponent).join('/');}
  async read(name:string){const file=await this.file(name);let bytes:Buffer;try{bytes=await fs.readFile(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new StoreError('Image not found.',404);throw e;}const type=imageType(bytes);if(!type)throw new StoreError('Unsupported image data.',422);return {bytes,type,revision:hash(bytes)};}
  async list(){
    await assertDirectory(this.directory,'Media directory');
    const names:string[]=[];
    const walk=async(dir:string,prefix='')=>{await assertDirectory(dir,'Media directory');for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;if(entry.isDirectory())await walk(path.join(dir,entry.name),prefix+entry.name+'/');else if(types[entry.name.split('.').pop()!.toLowerCase()])names.push(prefix+entry.name);}};
    await walk(this.directory);
    const metadata=await this.metadata();const listing=await this.posts.list();const items:MediaItem[]=[];const errors:{name:string;message:string}[]=[];
    for(const name of names){try{const image=await this.read(name);const url=this.url(name);const basename=path.basename(name);items.push({name,url,bytes:image.bytes.length,alt:metadata.data[this.key(name)]||'',revision:image.revision,metadataRevision:metadata.revision,usedBy:listing.posts.filter(p=>p.featuredImage===url || p.featuredImage?.includes(basename) || p.body.includes(url) || p.body.includes(basename)).map(p=>p.title)});}catch(e){errors.push({name,message:(e as Error).message});}}
    return {items:items.sort((a,b)=>a.name.localeCompare(b.name)),errors,contentIssues:listing.errors.length};
  }
  async upload(input:{name:string;data:string;alt:string}){
    if(!input||typeof input.name!=='string'||typeof input.data!=='string'||typeof input.alt!=='string'||input.alt.length>2000)throw new StoreError('Choose an image and valid alt text.');
    if(input.data.length>Math.ceil(MAX_IMAGE_BYTES/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))throw new StoreError('Image must be valid base64, up to 6 MB.');
    const bytes=Buffer.from(input.data,'base64');const type=imageType(bytes);const extension=input.name.split('.').pop()!.toLowerCase();
    if(!type||types[extension]!==type||bytes.length>MAX_IMAGE_BYTES)throw new StoreError('Upload a PNG, JPEG, GIF or WebP image, up to 6 MB. Its extension must match its contents.');
    const stem=path.basename(input.name,path.extname(input.name)).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,100)||'image';
    const name=`${stem}-${randomUUID().slice(0,8)}.${extension}`;const file=await this.file(name);
    const metadata=await this.metadata();await fs.writeFile(file,bytes,{flag:'wx'});
    try{await writeJson(this.metadataFile(),{...metadata.data,[this.key(name)]:input.alt},metadata.revision);}catch(e){await fs.unlink(file);throw e;}
    return {name,url:this.url(name)};
  }
  async update(input:{name:string;alt:string;revision:string;metadataRevision:string}){
    if(!input||typeof input.alt!=='string'||input.alt.length>2000)throw new StoreError('Alt text must be text, up to 2000 characters.');
    const image=await this.read(input.name);if(image.revision!==input.revision)throw new StoreError('The image changed. Reload before saving.',409);
    const state=await this.metadata();await writeJson(this.metadataFile(),{...state.data,[this.key(input.name)]:input.alt},input.metadataRevision);return {ok:true};
  }
  async remove(input:{name:string;revision:string}){
    if(!input)throw new StoreError('Choose an image.');
    const listing=await this.list();const item=listing.items.find(i=>i.name===input.name);
    if(!item)throw new StoreError('Image not found.',404);
    if(listing.contentIssues)throw new StoreError('Resolve unreadable articles before deleting media.',409);
    if(item.usedBy.length)throw new StoreError('This image is used by an article. Remove its references before deleting.',409);
    if((await this.read(input.name)).revision!==input.revision)throw new StoreError('The image changed. Reload before deleting.',409);
    await fs.unlink(await this.file(input.name));return {ok:true};
  }
}
