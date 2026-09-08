import { useEffect, useRef } from 'react';
export function ConfirmDialog({title,children,onConfirm,onCancel,busy=false}:{title:string;children:React.ReactNode;onConfirm:()=>void;onCancel:()=>void;busy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>previous?.focus();},[]);
  return <dialog ref={ref} className="file-dialog" aria-labelledby="confirm-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id="confirm-title">{title}</h2>{children}<div className="dialog-actions"><button className="secondary" autoFocus disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy} onClick={onConfirm}>{busy?'Working…':'Confirm'}</button></div></dialog>;
}
