import path from 'node:path';
import { PostStore, StoreError } from './store.js';
import { readJson, writeJson } from './json-file.js';
export type TaxonomyKind='categories'|'tags';
type Catalog = Record<TaxonomyKind,string[]>;
const validateName=(name:unknown):string=>{if(typeof name!=='string'||!name.trim()||name.trim().length>100||/[\n\r,]/.test(name))throw new StoreError('Use a name of 1–100 characters, without commas or line breaks.');return name.trim();};
export class TaxonomyStore {
  constructor(private root:string,private posts:PostStore,private contentDir:string){}
  private file(){return path.join(this.root,'cms.taxonomies.json');}
  private async catalog(){
    const state=await readJson<Record<string,Catalog>>(this.file(),{});
    const catalog=state.data[this.contentDir] ?? {categories:[],tags:[]};
    if(!Array.isArray(catalog.categories)||!Array.isArray(catalog.tags)||[...catalog.categories,...catalog.tags].some(n=>typeof n!=='string'))throw new StoreError('Invalid taxonomy catalog. Check cms.taxonomies.json.',422);
    return {...state,catalog};
  }
  async list(){
    const state=await this.catalog();const {posts,errors}=await this.posts.list();
    const result=(kind:TaxonomyKind)=>{
      const counts=new Map<string,number>(state.catalog[kind].map(name=>[name,0]));
      for(const post of posts){const names=kind==='categories'?[post.category || '']:post.tags;for(const name of new Set(names.map(n=>n.trim()).filter(Boolean)))counts.set(name,(counts.get(name)||0)+1);}
      return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name));
    };
    return {categories:result('categories'),tags:result('tags'),revision:state.revision,issues:errors.length};
  }
  async mutate(input:{kind:TaxonomyKind;name:string;target?:string;action:'create'|'rename'|'delete';revision:string}) {
    if(!input||!['categories','tags'].includes(input.kind)||!['create','rename','delete'].includes(input.action))throw new StoreError('Invalid taxonomy operation.');
    const name=validateName(input.name);const listing=await this.list();const state=await this.catalog();
    if(input.revision!==state.revision)throw new StoreError('Taxonomies changed. Reload before editing.',409);
    const entries=listing[input.kind];const existing=entries.find(e=>e.name===name);
    if(input.action!=='create'){
      if(!existing)throw new StoreError('Taxonomy not found.',404);
      if(existing.count)throw new StoreError('This name is used by articles. Reassign those articles before renaming or deleting it.',409);
      if(listing.issues)throw new StoreError('Resolve unreadable articles before renaming or deleting taxonomies.',409);
    }
    const target=input.action==='rename'?validateName(input.target):name;
    if(input.action!=='delete'&&entries.some(e=>e.name.toLowerCase()===target.toLowerCase() && (input.action==='create'||e.name!==name)))throw new StoreError('That name already exists.',409);
    const names=state.catalog[input.kind].filter(n=>n!==name);
    if(input.action!=='delete')names.push(target);
    await writeJson(this.file(),{...state.data,[this.contentDir]:{...state.catalog,[input.kind]:names}},input.revision);
    return this.list();
  }
}
