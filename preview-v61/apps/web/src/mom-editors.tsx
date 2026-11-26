import { NavIcon } from './nav-icon';
import { Button } from './ui';
import { TextInput, Textarea } from './form-controls';
import { useId, useRef, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';

export function AttendeeFields({value,change,onDraftChange}: {value:string;change:(value:string)=>void;onDraftChange:(dirty:boolean)=>void}){
  const names=value.split('\n').map(name=>name.trim()).filter(Boolean);
  const [input,setInput]=useState('');
  const [edit,setEdit]=useState<number|null>(null);
  const entry=useRef<HTMLInputElement>(null);
  function updateInput(value:string,index=edit){
    setInput(value);
    onDraftChange(value.trim()!==(index===null?'':names[index]??''));
  }
  function resetInput(){updateInput('',null);setEdit(null)}

  function commit(text:string) {
    const added=text.split(/[\r\n;]+/).map(name=>name.trim()).filter(Boolean);
    if(!added.length)return;
    const next=[...names];
    if(edit===null)next.push(...added);
    else next.splice(edit,1,...added);
    const unique=[...new Map(next.map(name=>[name.toLocaleLowerCase('id'),name])).values()];
    change(unique.join('\n'));resetInput();entry.current?.focus();
  }
  return <div className="fields span-full mom-attendees">
    <div className="split"><h3>Daftar peserta</h3><span className="muted">{names.length} peserta</span></div>
    <label htmlFor="mom-attendee-entry">{edit===null?'Nama peserta':'Ubah nama peserta'}</label>
    <div className="mom-attendee-entry">
      <TextInput id="mom-attendee-entry" ref={entry} value={input} placeholder="Naya Wijaya" onChange={event=>updateInput(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit(input)}if(event.key==='Escape')resetInput()}}
        onPaste={event=>{const text=event.clipboardData.getData('text');if(/[\r\n;]/.test(text)){event.preventDefault();commit(text)}}}/>
      <Button className="button primary" type="button" disabled={!input.trim()} onClick={()=>commit(input)}><Plus size={15}/> {edit===null?'Tambah':'Simpan'}</Button>
      {edit!==null&&<button className="icon-button" type="button" aria-label="Batal mengubah nama" onClick={resetInput}><X size={17}/></button>}
    </div>
    <small className="muted">Tekan Enter untuk menambahkan nama. Tempel beberapa nama yang dipisah baris untuk menambah sekaligus.</small>
    {names.length>0&&<ul className="mom-attendee-chips" aria-label="Peserta yang ditambahkan">{names.map((name,i)=><li className={edit===i?'selected':''} key={name+i}>
      <span>{name}</span>
      <button className="icon-button" type="button" onClick={()=>{setEdit(i);updateInput(name,i);entry.current?.focus()}} aria-label={'Ubah '+name}><Pencil size={13}/></button>
      <button className="icon-button danger-text" type="button" onClick={()=>{change(names.filter((_,index)=>index!==i).join('\n'));if(edit!==null)resetInput()}} aria-label={'Hapus '+name}><NavIcon name="trash"/></button>
    </li>)}</ul>}
  </div>;
}

type BlockType='heading'|'subheading'|'list'|'ordered'|'paragraph';
type OutcomeBlock={type:BlockType;lines:string[]};
const prefixes=[
  {marker:'# ',label:'Header'}, {marker:'> ',label:'Subheader'},
  {marker:'- ',label:'Daftar poin'}, {marker:'1. ',label:'Nomor otomatis'},
] as const;
const syntax=/^(#{1,2}|>|-|\d+\.)[ \t]+/;

export function readOutcome(value:string):OutcomeBlock[]{
  const blocks:OutcomeBlock[]=[];
  let separated=false;
  for(const line of value.split(/\r?\n/)){
    const text=line.trimStart();
    const match=syntax.exec(text);
    const content=text.slice(match?.[0].length??0).trimEnd();
    if(!content){separated=true;continue}
    const marker=match?.[1];
    const type=marker==='#'?'heading':marker==='##'||marker==='>'?'subheading':marker==='-'?'list':marker?'ordered':'paragraph';
    const last=blocks.at(-1);
    if(!separated&&last?.type===type&&['list','ordered','paragraph'].includes(type))last.lines.push(content);
    else blocks.push({type,lines:[content]});
    separated=false;
  }
  return blocks;
}

export function OutcomeField({label,value,change}: {label:string;value:string;change:(value:string)=>void}){
  const id=useId();
  const field=useRef<HTMLTextAreaElement>(null);
  function replace(start:number,end:number,text:string){
    change(value.slice(0,start)+text+value.slice(end));
    requestAnimationFrame(()=>{
      field.current?.focus();
      field.current?.setSelectionRange(start+text.length,start+text.length);
    });
  }
  function insert(prefix:string){
    const input=field.current;
    if(!input)return;
    const start=value.slice(0,input.selectionStart).lastIndexOf('\n')+1;
    const existing=syntax.exec(value.slice(start))?.[0]??'';
    replace(start,start+existing.length,prefix);
  }
  return <div className="mom-outcome-editor field span-full">
    <label htmlFor={id}>{label}</label>
    <div className="mom-format" role="group" aria-label={'Format '+label}>
      {prefixes.map(({marker,label:caption})=><Button className="button" type="button" key={marker} onClick={()=>insert(marker)}>{caption}</Button>)}
    </div>
    <Textarea id={id} ref={field} value={value} rows={label==='Hasil rapat saat ini'?8:4} onChange={event=>change(event.target.value)} aria-describedby={id+'-hint'}
      placeholder="Tulis hasil dan keputusan rapat."
      onKeyDown={event=>{
        if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing)return;
        const {selectionStart,selectionEnd}=event.currentTarget;
        if(selectionStart!==selectionEnd)return;
        const start=value.slice(0,selectionStart).lastIndexOf('\n')+1;
        const end=value.indexOf('\n',selectionStart);
        if(end!==-1&&end!==selectionStart||selectionStart===start)return;
        const line=value.slice(start,selectionStart);
        const marker=/^(-|\d+\.)[ \t]+/.exec(line);
        if(!marker)return;
        event.preventDefault();
        if(!line.slice(marker[0].length).trim())replace(start,selectionEnd,'');
        else replace(selectionStart,selectionEnd,marker[1]==='-'?'\n- ':'\n'+(Number.parseInt(marker[1])+1)+'. ');
      }}/>
    <small id={id+'-hint'} className="muted">Pilih format dari toolbar. Enter melanjutkan daftar, atau mengakhirinya pada baris kosong.</small>
    {value.trim()&&<div className="mom-outcome-preview" aria-label={'Pratinjau '+label}><Outcome value={value}/></div>}
  </div>;
}

export function Outcome({value}: {value:string}){
  return <>{readOutcome(value).map(({type,lines},i)=>{
    if(type==='heading')return <h5 key={i}>{lines[0]}</h5>;
    if(type==='subheading')return <h6 key={i}>{lines[0]}</h6>;
    if(type==='list'||type==='ordered'){
      const List=type==='ordered'?'ol':'ul';
      return <List key={i}>{lines.map((line,index)=><li key={index}>{line}</li>)}</List>;
    }
    return <p className="pre-wrap" key={i}>{lines.join('\n')}</p>;
  })}</>;
}
