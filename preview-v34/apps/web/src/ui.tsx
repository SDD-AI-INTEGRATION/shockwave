import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import type { WorkspaceMenu } from '../../../packages/shared/workspace-admin';

export type User = {id:string; name:string; email:string; nik:string; role:import('../../../packages/shared/domain').Role; locked:boolean; disabled:boolean; demo:boolean;menus?:WorkspaceMenu[];workspaceAdmin?:boolean};
export type Appearance = {theme:'system'|'light'|'dark'; accent:string};
export const defaultAppearance: Appearance = {theme:'light', accent:'shockwave'};

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    method,
    headers: {'X-Shockwave-Request':'1', ...(body === undefined ? {} : {'Content-Type':'application/json'})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    if(response.status===401&&!path.startsWith('/auth/login')&&path!=='/auth/mfa') window.dispatchEvent(new Event('shockwave-session-expired'));
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || 'Layanan tidak dapat dihubungi. Coba lagi.');
  }
  return response.json();
}

export const dateLabel = (date: string | null, mode: 'full' | 'short' | 'month' = 'full') => {
  if (!date) return '—';
  const value = new Date(date.length === 10 ? date + 'T12:00:00' : date);
  return new Intl.DateTimeFormat('id-ID', {
    day: mode === 'month' ? undefined : 'numeric', month: mode === 'full' ? 'long' : 'short', year:'numeric',
  }).format(value);
};
export { formatRupiah as rupiah } from '../../../packages/shared/money';

export function Heading({title, description, actions, eyebrow}: {title:string;description?:ReactNode;actions?:ReactNode;eyebrow?:ReactNode}) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function Pill({children,tone='neutral',dot=false}: {children:ReactNode;tone?:string;dot?:boolean}) {
  return <span className={'pill pill-'+tone}>{dot && <i aria-hidden="true" />}{children}</span>;
}

export function Meter({value, color}: {value:number; color?:string}) {
  return <span className="meter" role="meter" aria-label="Persentase" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0,Math.min(value,100))}><i style={{width: Math.max(0,Math.min(value,100))+'%',background:color}} /></span>;
}

export function Dialog({title, children, close, headingDetails, className='', restoreFocus=false}: {title:string;children:ReactNode;close:()=>void;headingDetails?:ReactNode;className?:string;restoreFocus?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = restoreFocus ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if(trigger instanceof HTMLElement)queueMicrotask(()=>{
        if(trigger.isConnected&&!document.querySelector('dialog[open]'))trigger.focus({preventScroll:true});
      });
    };
  }, [restoreFocus]);
  return <dialog ref={ref} className={'dialog '+className} aria-label={title} onCancel={e=>{e.preventDefault(); close()}} onClick={e=>{if(e.target===ref.current && e.clientX >= 0) {
    const bounds = ref.current.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close();
  }}}><div className="dialog-header">{headingDetails?<div><h2>{title}</h2>{headingDetails}</div>:<h2>{title}</h2>}<button type="button" className="icon-button" onClick={close} aria-label="Tutup"><X size={19}/></button></div>{children}</dialog>;
}

export function ButtonConfirm({value,onConfirm,onCancel}: {value:string;onConfirm:()=>void;onCancel:()=>void}) {
  return <Dialog title="Apakah Anda yakin?" close={onCancel}><div className="dialog-content"><p>{value}</p></div><div className="dialog-actions"><button autoFocus className="button" onClick={onCancel}>Tidak</button><button className="button primary" onClick={onConfirm}>Ya, lanjutkan</button></div></Dialog>;
}

export function PendingStatus({message,hidden=false}:{message?:string;hidden?:boolean}){
  return <span className={hidden?'visually-hidden':'pending-status'} role="status">
    {message&&!hidden&&<i className="pending-spinner" aria-hidden="true"/>}{message}
  </span>;
}

export function PendingButton({pending,children,onClick,...props}:ComponentPropsWithoutRef<'button'>&{pending?:string}){
  return <button {...props} aria-disabled={pending?true:undefined} aria-busy={pending?true:undefined}
    onClick={event=>{if(pending){event.preventDefault();return;}onClick?.(event)}}>
    {pending?<><i className="pending-spinner" aria-hidden="true"/>{pending}</>:children}
  </button>;
}

export function Empty({children}: {children:ReactNode}) { return <div className="empty">{children}</div>; }
export function ErrorBox({message}: {message:string}) { return <p className="error-box" role="alert">{message}</p>; }

export type Column<T> = {id:string; label:string; className?:string; sort?:(row:T)=>string|number; render:(row:T)=>ReactNode};
export function DataTable<T>({rows, columns, rowKey, onRow, rowClass, empty, searchKey, renderAfter}: {
  rows:T[]; columns:Column<T>[]; rowKey:(row:T)=>string; onRow?:(row:T)=>void; rowClass?:(row:T)=>string; empty?:ReactNode; searchKey?:string; renderAfter?:(ordered:T[])=>ReactNode;
}) {
  const [size,setSize] = useState(10);
  const [page,setPage] = useState(1);
  const [sort,setSort] = useState({id:'',direction:1});
  useEffect(()=>setPage(1),[searchKey,size,sort]);
  const column = columns.find(column=>column.id === sort.id);
  const sorted = column?.sort ? [...rows].sort((a,b)=>{
    const x=column.sort!(a), y=column.sort!(b);
    return sort.direction * (typeof x==='number' && typeof y==='number' ? x-y : String(x).localeCompare(String(y),'id',{numeric:true}));
  }) : rows;
  const pages = Math.max(1,Math.ceil(rows.length / size));
  const activePage = Math.min(page,pages);
  const from = (activePage-1)*size;
  return <>
    <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(column=><th key={column.id} className={column.className} aria-sort={sort.id===column.id?(sort.direction===1?'ascending':'descending'):undefined}>{column.sort?<button className="table-sort" onClick={()=>setSort({id:column.id,direction:sort.id===column.id?-sort.direction:1})}>{column.label}{sort.id===column.id?(sort.direction===1?<ArrowUp size={12}/>:<ArrowDown size={12}/>):<ArrowUpDown size={12}/>}</button>:column.label}</th>)}</tr></thead>
    <tbody>{sorted.slice(from,from+size).map(row=><tr key={rowKey(row)} onClick={onRow?e=>{if(!(e.target as HTMLElement).closest('button,a,input,select')) onRow(row)}:undefined} className={(onRow?'clickable ':'')+(rowClass?.(row)??'')}>{columns.map(column=><td key={column.id} data-label={column.label} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
    {rows.length===0 ? <Empty>{empty || 'Tidak ada data yang cocok.'}</Empty> : <div className="pagination"><span>Menampilkan {from+1}–{Math.min(from+size,rows.length)} dari {rows.length}</span><div><label>Baris <select value={size} onChange={e=>setSize(+e.target.value)} aria-label="Baris per halaman">{[10,25,50].map(value=><option key={value}>{value}</option>)}</select></label><button className="icon-button" disabled={activePage===1} onClick={()=>setPage(activePage-1)} aria-label="Halaman sebelumnya"><ChevronLeft size={17}/></button><span>{activePage} / {pages}</span><button className="icon-button" disabled={activePage===pages} onClick={()=>setPage(activePage+1)} aria-label="Halaman berikutnya"><ChevronRight size={17}/></button></div></div>}
    {renderAfter?.(sorted)}
  </>;
}
