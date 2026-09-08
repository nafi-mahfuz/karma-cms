import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
export interface Taxonomies {categories:{name:string;count:number}[];tags:{name:string;count:number}[];revision:string;issues:number}
export function TaxonomyPage({kind,onChange}:{kind:'categories'|'tags';onChange:()=>void}){
  const [data,setData]=useState<Taxonomies|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [operation,setOperation]=useState<{name:string;target:string;action:'rename'|'delete'}|null>(null);
  const load=()=>api<Taxonomies>('/api/taxonomies').then(setData).catch(e=>setError(e.message));
  useEffect(()=>{setData(null);setError('');setNotice('');setName('');setOperation(null);void load();},[kind]);
  async function mutate(action:'create'|'rename'|'delete',source:string,target?:string){
    if(busy||!data)return;setBusy(true);setError('');
    try{setData(await api<Taxonomies>('/api/taxonomies','POST',{kind,name:source,target,action,revision:data.revision}));setName('');setOperation(null);setNotice('Changes saved.');onChange();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const singular=kind==='categories'?'category':'tag';
  return <section className="content management-page"><p className="eyebrow">ORGANIZE YOUR STORIES</p><h1>{kind==='categories'?'Categories':'Tags'}</h1><p className="subtitle">Keep your writing easy to find. Names already used in articles appear here automatically.</p>
    {error&&<div className="alert" role="alert">{error}<button onClick={()=>{setError('');void load();}}>Reload</button></div>}{notice&&<p role="status">{notice}</p>}
    <form className="management-form" onSubmit={e=>{e.preventDefault();void mutate('create',name);}}><label>New {singular}<input value={name} required maxLength={100} disabled={busy} placeholder={kind==='categories'?'e.g. Field notes':'e.g. Design'} onChange={e=>setName(e.target.value)}/></label><button className="primary" disabled={busy||!data}>{busy?'Saving…':`Add ${singular}`}</button></form>
    {!data?<p role="status">{error?'Could not load names. Use Reload to try again.':'Loading names…'}</p>:<div className="management-list">{data[kind].length===0?<div className="empty"><h3>A little order for your ideas.</h3><p>Add your first {singular} above.</p></div>:data[kind].map(item=><div className="management-row" key={item.name}><div><strong>{item.name}</strong><small>{item.count} {item.count===1?'article':'articles'}</small></div><button className="secondary" disabled={busy||item.count>0||data.issues>0} onClick={()=>{setError('');setOperation({name:item.name,target:item.name,action:'rename'});}}>Rename<span className="sr-only"> {item.name}</span></button><button className="danger" disabled={busy||item.count>0||data.issues>0} onClick={()=>{setError('');setOperation({name:item.name,target:item.name,action:'delete'});}}>Delete<span className="sr-only"> {item.name}</span></button></div>)}</div>}
    <p className="field-help">To rename or delete a name in use, reassign its articles first. This protects existing content from bulk rewrites.{Boolean(data?.issues)&&' Resolve unreadable articles to enable renaming and deletion.'}</p>
    {operation&&<ConfirmDialog title={`${operation.action==='rename'?'Rename':'Delete'} ${singular}`} busy={busy} onCancel={()=>setOperation(null)} onConfirm={()=>void mutate(operation.action,operation.name,operation.target)}><p>{operation.action==='delete'?`Remove “${operation.name}” from the saved list?`:`Choose a new name for “${operation.name}”.`}</p>{operation.action==='rename'&&<label>New name<input value={operation.target} disabled={busy} maxLength={100} onChange={e=>setOperation({...operation,target:e.target.value})}/></label>}{error&&<p role="alert" className="dialog-error">{error}</p>}</ConfirmDialog>}
  </section>;
}
