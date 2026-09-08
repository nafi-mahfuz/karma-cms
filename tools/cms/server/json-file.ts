import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertDirectory } from './paths.js';
import { StoreError } from './store.js';
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export async function readJson<T>(file: string, fallback: T): Promise<{data:T;revision:string}> {
  await assertDirectory(path.dirname(file),'Data directory');
  try {
    const stat=await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new StoreError('CMS data must be a regular file.',422);
    const raw=await fs.readFile(file,'utf8');
    return {data:JSON.parse(raw),revision:hash(raw)};
  } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT')return {data:fallback,revision:'missing'};throw e; }
}
export async function writeJson<T>(file:string,data:T,expected:string) {
  const current=await readJson(file,null);
  if(current.revision!==expected)throw new StoreError('Settings or metadata changed. Reload before saving.',409);
  const raw=JSON.stringify(data,null,2)+'\n';
  const temp=file+'.'+randomUUID()+'.tmp';
  try {
    await fs.writeFile(temp,raw,{flag:'wx'});
    if((await readJson(file,null)).revision!==expected)throw new StoreError('The file changed while saving. Reload and try again.',409);
    if(expected==='missing') {await fs.link(temp,file);} else {await fs.rename(temp,file);}
  } finally {await fs.unlink(temp).catch(()=>{});}
  return {data,revision:hash(raw)};
}
