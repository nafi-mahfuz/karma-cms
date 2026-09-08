#!/usr/bin/env node
// Integration-only CLI foundation. Never traverses or removes application files.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const commands={cms:'npm --prefix tools/cms run dev','cms:check':'npm --prefix tools/cms run check','cms:test':'npm --prefix tools/cms test'};
async function read(file){
  const stat=await fs.lstat(file);
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`Refusing non-regular file: ${file}`);
  return fs.readFile(file,'utf8');
}
async function replace(file,expected,value){
  if(await read(file)!==expected)throw new Error(`${file} changed. Retry after reviewing it.`);
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,value,{flag:'wx'});if(await read(file)!==expected)throw new Error('File changed while writing.');await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
}
export async function manage(command,root,{dryRun=false}={}){
  if(!['init','remove'].includes(command))throw new Error('Usage: karma-cms <init|remove> [--dry-run]');
  root=await fs.realpath(root);
  const packageFile=path.join(root,'package.json');const raw=await read(packageFile);const pkg=JSON.parse(raw);
  if(pkg.scripts!==undefined&&(!pkg.scripts||typeof pkg.scripts!=='object'||Array.isArray(pkg.scripts)))throw new Error('Invalid package.json scripts.');
  const marker=path.join(root,'.karma-cms-install.json');let manifest=null;
  try{manifest=JSON.parse(await read(marker));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(manifest&&(manifest.version!==1||!Array.isArray(manifest.scripts)||manifest.scripts.some(k=>!Object.hasOwn(commands,k))))throw new Error('Unrecognized installer manifest. No files changed.');
  const scripts={...pkg.scripts};
  if(command==='init'){
    // Distribution/copying belongs to a future published package. This version
    // registers a vendored tools/cms package without downloading anything.
    const cmsFile=path.join(root,'tools/cms/package.json');
    if(await fs.realpath(cmsFile)!==cmsFile)throw new Error('Refusing a symlinked CMS package.');
    const cms=JSON.parse(await read(cmsFile));if(!cms.scripts?.dev)throw new Error('Expected an existing tools/cms package.');
    const owned=new Set(manifest?.scripts||[]);
    for(const [name,value] of Object.entries(commands)){
      if(scripts[name]!==undefined&&scripts[name]!==value)throw new Error(`Script ${name} already exists with another value. No files changed.`);
      if(scripts[name]===undefined){scripts[name]=value;owned.add(name);}
    }
    const result={command,scripts:[...owned],preserved:'All content, media, schemas and Astro application files'};
    if(dryRun)return result;
    const markerValue=JSON.stringify({version:1,scripts:[...owned]},null,2)+'\n';
    if(manifest)await replace(marker,await read(marker),markerValue);else await fs.writeFile(marker,markerValue,{flag:'wx'});
    if(JSON.stringify(pkg.scripts)!==JSON.stringify(scripts))await replace(packageFile,raw,JSON.stringify({...pkg,scripts},null,2)+'\n');
    return result;
  }
  const removed=[];const retained=[];
  for(const name of manifest?.scripts||[]){if(scripts[name]===commands[name]){delete scripts[name];removed.push(name);}else retained.push(name);}
  const result={command,removed,retained,preserved:'All content, media, schemas, settings, CMS source and Astro application files'};
  if(!dryRun&&manifest){
    if(removed.length)await replace(packageFile,raw,JSON.stringify({...pkg,scripts},null,2)+'\n');
    // The manifest is the only file the remover may unlink. Never rm a directory.
    await read(marker);await fs.unlink(marker);
  }
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [, ,command,...args]=process.argv;
  if(args.some(arg=>arg!=='--dry-run')){console.error('Only --dry-run is supported.');process.exitCode=1;}
  else try{console.log(JSON.stringify(await manage(command,process.cwd(),{dryRun:args.includes('--dry-run')}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
