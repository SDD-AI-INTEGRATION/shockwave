import { SelectClear, TextInput } from './form-controls';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FloatingPopover } from './floating-popover';
import { normalizedProjectName } from '../../../packages/shared/workspace-admin';

export type SearchOption = {id:string;label:string;group?:string;keywords?:string};

export function SearchableSelect({id,name,label,options,value,emptyLabel,example,legacyLabel,invalid,describedBy,onChange,disabled=false,required=false,searchable=true}:{
  id?:string;name?:string;label:string;options:SearchOption[];value:string;emptyLabel:string;
  example?:string;legacyLabel?:string;invalid?:boolean;describedBy?:string;disabled?:boolean;required?:boolean;searchable?:boolean;onChange:(value:string)=>void;
}){
  const listId=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const search=normalizedProjectName(query);
  const visible=search?options.filter(option=>normalizedProjectName([option.label,option.group,option.keywords].filter(Boolean).join(' ')).includes(search)):options;
  const current=options.find(option=>option.id===value);
  const display=current?.label||(value?legacyLabel||'Nilai lama':example||emptyLabel);

  function close(){
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function choose(id:string){
    onChange(id);
    close();
    trigger.current?.focus();
  }

  function show(){
    if(!searchable)setActive(Math.max(0,options.findIndex(option=>option.id===value)));
    setOpen(true);
  }
  const activeId=visible[active]?listId+'-'+active:undefined;
  function navigate(event:KeyboardEvent<HTMLElement>){
    if(event.key==='Enter'||!searchable&&event.key===' '){
      event.preventDefault();
      if(visible[active])choose(visible[active].id);
      return;
    }
    const steps:Record<string,number>={ArrowDown:active+1,ArrowUp:active-1};
    if(!searchable){steps.Home=0;steps.End=visible.length-1}
    const next=steps[event.key];
    if(next===undefined)return;
    event.preventDefault();
    if(!visible.length)return;
    const index=Math.min(Math.max(next,0),visible.length-1);
    setActive(index);
    document.getElementById(listId+'-'+index)?.scrollIntoView({block:'nearest'});
  }

  return <div className="search-select">
    {name&&<input type="hidden" name={name} value={value} disabled={disabled}/>}
    <button type="button" ref={trigger} id={id} disabled={disabled} className="search-select-trigger"
      aria-label={label+': '+display+(required?' (wajib)':'')}
      aria-invalid={invalid} aria-describedby={describedBy} aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open?listId:undefined} onClick={()=>open?close():show()}
      onKeyDown={event=>{if(!open&&event.key==='ArrowDown'){event.preventDefault();show()}}}>
      <span className={!value?'field-example':undefined}>{display}{current?.group&&<small className="search-option-group">{current.group}</small>}</span><ChevronDown aria-hidden="true" size={16}/>
    </button>
    {value&&!required&&!disabled&&<SelectClear label={'Hapus nilai '+label} onClear={()=>choose('')}/>}
    {open&&!disabled&&<FloatingPopover anchor={trigger} onDismiss={close} className="search-select-menu">
      {searchable&&<div className="search-box"><Search size={15} aria-hidden="true"/>
        <TextInput type="search" data-popover-focus=""
          role="combobox" aria-label={'Cari '+label.toLowerCase()} aria-expanded="true" aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={activeId}
          placeholder={example||'Cari '+label.toLowerCase()} value={query} onChange={event=>{setQuery(event.target.value);setActive(0)}}
          onKeyDown={navigate}/>
      </div>}
      <ul id={listId} role="listbox" aria-label={label}
        {...(!searchable&&{className:'select-option-list',tabIndex:0,'data-popover-focus':'','aria-activedescendant':activeId,onKeyDown:navigate})}>
        {visible.map((option,index)=><li key={option.id} id={listId+'-'+index} role="option"
          aria-selected={option.id===value} className={index===active?'highlighted':undefined}
          onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option.id)}>{option.label}{option.group&&<small className="search-option-group">{option.group}</small>}</li>)}
      </ul>
      {!visible.length&&<p className="muted" role="status">Tidak ada hasil.</p>}
    </FloatingPopover>}
  </div>;
}
