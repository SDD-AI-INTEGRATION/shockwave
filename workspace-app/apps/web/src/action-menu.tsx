import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FloatingPopover } from './floating-popover';

export type MenuItem={id:string;label:string;icon:ReactNode;run:()=>void;disabled?:boolean;disabledReason?:string;danger?:boolean};
export function ActionMenu({label,items,icon,compact=false,align='end',disabled=false,busy=false,triggerLabel,description}:{
  label:string;items:MenuItem[];icon?:ReactNode;compact?:boolean;align?:'start'|'end';disabled?:boolean;busy?:boolean;
  triggerLabel?:string;description?:string;
}){
  const id=useId();
  const anchor=useRef<HTMLButtonElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const expanded=open&&!disabled&&!busy;
  function close(focus=false){
    setOpen(false);
    if(focus)anchor.current?.focus({preventScroll:true});
  }
  function move(event:KeyboardEvent<HTMLDivElement>){
    const allowed=['ArrowDown','ArrowUp','Home','End'];
    if(!allowed.includes(event.key))return;
    const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if(!buttons.length)return;
    event.preventDefault();
    const position=buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
      (position+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;
    buttons[next].focus();
  }
  return <div className="action-menu no-print">
    <button type="button" className={compact?'icon-button':'button'} ref={anchor} aria-label={label} title={compact?label:undefined}
      aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded?id:undefined} aria-busy={busy||undefined} disabled={disabled||busy}
      onClick={()=>setOpen(!open)} onKeyDown={event=>{
        if(event.key==='Escape'&&open){event.preventDefault();close(true);return}
        if(event.key==='ArrowDown'){event.preventDefault();if(expanded)list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();else setOpen(true)}
      }}>
      {compact?(icon??<MoreHorizontal size={19} aria-hidden="true"/>):<>{icon}{triggerLabel??label}<ChevronDown size={15} aria-hidden="true"/></>}
    </button>
    {expanded&&<FloatingPopover anchor={anchor} alignment={align} className="action-menu-popover" onDismiss={()=>close()}>
      <div id={id} ref={list} role="menu" aria-label={label} onKeyDown={move}>
        {items.map(item=><button type="button" role="menuitem" tabIndex={-1} key={item.id} aria-label={item.disabledReason?item.label:undefined} disabled={item.disabled&&!item.disabledReason} aria-disabled={item.disabled||undefined} aria-describedby={item.disabledReason?id+'-'+item.id:undefined} className={item.danger?'danger-text':undefined}
          onClick={()=>{if(!item.disabled){close(true);item.run()}}}>{item.icon}<span>{item.label}{item.disabledReason&&<small className="muted block" id={id+'-'+item.id}>{item.disabledReason}</small>}</span></button>)}
      </div>
      {description&&<small className="muted">{description}</small>}
    </FloatingPopover>}
  </div>;
}
