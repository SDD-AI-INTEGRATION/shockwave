import { TextInput } from './form-controls';
import { useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FloatingPopover } from './floating-popover';
import { normalizedProjectName } from '../../../packages/shared/workspace-admin';

export type SearchOption = {id:string;label:string;group?:string;keywords?:string};

export function SearchableSelect({id,name,label,options,value,emptyLabel,example,legacyLabel,invalid,describedBy,onChange,disabled=false,required=false}:{
  id?:string;name?:string;label:string;options:SearchOption[];value:string;emptyLabel:string;
  example?:string;legacyLabel?:string;invalid?:boolean;describedBy?:string;disabled?:boolean;required?:boolean;onChange:(value:string)=>void;
}){
  const listId=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const search=normalizedProjectName(query);
  const matches=options.filter(option=>normalizedProjectName([option.label,option.group,option.keywords].filter(Boolean).join(' ')).includes(search));
  const visible=matches;
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

  return <div className="search-select">
    {name&&<input type="hidden" name={name} value={value} disabled={disabled}/>}
    <button type="button" ref={trigger} id={id} disabled={disabled} className="search-select-trigger"
      aria-label={label+': '+display+(required?' (wajib)':'')}
      aria-invalid={invalid} aria-describedby={describedBy} aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open?listId:undefined} onClick={()=>open?close():setOpen(true)}
      onKeyDown={event=>{if(!open&&event.key==='ArrowDown'){event.preventDefault();setOpen(true)}}}>
      <span className={!value?'field-example':undefined}>{display}{current?.group&&<small className="search-option-group">{current.group}</small>}</span><ChevronDown aria-hidden="true" size={16}/>
    </button>
    {value&&!required&&!disabled&&<button className="icon-button select-clear" type="button" aria-label={'Hapus nilai '+label} onClick={()=>choose('')}>×</button>}
    {open&&!disabled&&<FloatingPopover anchor={trigger} onDismiss={close} className="search-select-menu">
      <div className="search-box"><Search size={15} aria-hidden="true"/>
        <TextInput type="search" data-popover-focus=""
          role="combobox" aria-label={'Cari '+label.toLowerCase()} aria-expanded="true" aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={visible[active]?listId+'-'+active:undefined}
          placeholder={example||'Cari '+label.toLowerCase()} value={query} onChange={event=>{setQuery(event.target.value);setActive(0)}}
          onKeyDown={event=>{
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus();return}
            if(event.key==='Enter'){event.preventDefault();if(visible[active])choose(visible[active].id);return}
            if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
            event.preventDefault();
            const index=Math.min(Math.max(active+(event.key==='ArrowDown'?1:-1),0),visible.length-1);
            if(index<0)return;
            setActive(index);
            document.getElementById(listId+'-'+index)?.scrollIntoView({block:'nearest'});
          }}/>
      </div>
      <ul id={listId} role="listbox" aria-label={label}>
        {visible.map((option,index)=><li key={option.id} id={listId+'-'+index} role="option"
          aria-selected={option.id===value} className={index===active?'highlighted':undefined}
          onPointerDown={event=>event.preventDefault()} onClick={()=>choose(option.id)}>{option.label}{option.group&&<small className="search-option-group">{option.group}</small>}</li>)}
      </ul>
      {!visible.length&&<p className="muted" role="status">Tidak ada hasil.</p>}
    </FloatingPopover>}
  </div>;
}
