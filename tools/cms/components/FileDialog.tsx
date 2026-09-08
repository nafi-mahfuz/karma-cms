import { useEffect, useRef } from 'react';
export interface FileOperation { kind:'duplicate'|'rename'; id:string; target:string; revision:string; title:string }
export function FileDialog({operation,onTarget,onCancel,onSubmit,busy,error,contentDir}:{operation:FileOperation;onTarget:(target:string)=>void;onCancel:()=>void;onSubmit:()=>void;busy:boolean;error:string;contentDir:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="file-dialog" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}} aria-labelledby="file-dialog-title"><form onSubmit={e=>{e.preventDefault();onSubmit();}}>
    <h2 id="file-dialog-title">{operation.kind==='rename'?'Rename article':'Duplicate as a draft'}</h2>
    <p>{operation.kind==='rename'?'Changing the file name changes this article’s URL. Existing links to it will need updating.':'The original stays unchanged. The copy retains its content and extra metadata, with a new title and draft status.'}</p>
    <label>New file name<input autoFocus required disabled={busy} value={operation.target} onChange={e=>onTarget(e.target.value)}/></label>
    <p className="file-path">{contentDir}/{operation.target || 'your-story'}.md</p>
    <p>Keep the same folder. Letters, numbers, hyphens, and underscores are supported.</p>
    {error&&<p className="dialog-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?'Working…':operation.kind==='rename'?'Confirm rename':'Create draft copy'}</button></div>
  </form></dialog>;
}
