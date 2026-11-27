import { NavIcon } from './nav-icon';
import { Button } from './ui';
import { TextInput, Textarea } from './form-controls';
import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Pencil, Plus, Redo2, Undo2, X } from 'lucide-react';

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

function outcomeElement(tag:string,text:string){
  const block=document.createElement(tag);
  if(text)block.textContent=text;
  else block.append(document.createElement('br'));
  return block;
}

function loadOutcome(editable:HTMLElement,value:string){
  const contents=document.createDocumentFragment();
  let list:HTMLElement|undefined;
  for(const raw of value.split(/\r?\n/)){
    const line=raw.trimStart();
    const marker=syntax.exec(line);
    const prefix=marker?raw.slice(0,raw.length-line.length+marker[0].length):'';
    const text=raw.slice(prefix.length);
    const type=marker?.[1]==='#'?'H3':marker?.[1]==='##'||marker?.[1]==='>'?'H4':marker?.[1]==='-'?'UL':marker?'OL':'P';
    const block=outcomeElement(type==='UL'||type==='OL'?'li':type.toLowerCase(),text);
    if(prefix){
      block.dataset.outcomeType=type;
      block.dataset.outcomePrefix=prefix;
      block.dataset.outcomeText=text;
    }
    if(type==='UL'||type==='OL'){
      if(list?.tagName!==type){list=document.createElement(type);contents.append(list)}
      list.append(block);
    }else{
      list=undefined;
      contents.append(block);
    }
  }
  editable.replaceChildren(contents);
}

function outcomeText(node:Node):string {
  if(node.nodeType===Node.TEXT_NODE)return node.textContent??'';
  if(!(node instanceof Element)||node.matches('script,style,iframe,object,svg'))return '';
  if(node.tagName==='BR')return '\n';
  const text=Array.from(node.childNodes,outcomeText).join('');
  return node.lastChild instanceof Element&&node.lastChild.tagName==='BR'?text.slice(0,-1):text;
}

function outcomeValue(editable:HTMLElement){
  const structured='p,div,h3,h4,ol,ul';
  function block(node:Node):string[]{
    if(!(node instanceof HTMLElement))return [outcomeText(node)];
    if(node.matches('ol,ul')){
      return Array.from(node.children).flatMap((item,index)=>item instanceof HTMLElement?
        lines(item,node.tagName,node.tagName==='OL'?(index+1)+'. ':'- '):[]);
    }
    return lines(node,node.tagName,node.tagName==='H3'?'# ':node.tagName==='H4'?'> ':'');
  }
  function lines(element:HTMLElement,type:string,prefix:string):string[]{
    const text=outcomeText(element);
    const original=element.dataset.outcomeType===type&&element.dataset.outcomeText===text?element.dataset.outcomePrefix:undefined;
    if(!Array.from(element.children).some(child=>child.matches(structured))){
      return text.split('\n').map(line=>line?(original??prefix)+line:line);
    }
    const result:string[]=[];
    let inline='';
    function flush(){
      if(inline){result.push(prefix+inline);inline=''}
    }
    for(const child of element.childNodes){
      if(child instanceof HTMLElement&&child.matches(structured)){flush();result.push(...block(child))}
      else inline+=outcomeText(child);
    }
    flush();
    return result;
  }
  return Array.from(editable.childNodes).flatMap(block).join('\n');
}

function pasteBlocks(html:string){
  const source=new DOMParser().parseFromString(html,'text/html');
  const safe=document.createElement('div');
  function append(node:Node){
    if(node instanceof HTMLElement&&node.matches('article,section,main,div')&&Array.from(node.children).some(child=>child.matches('div,p,ol,ul,h1,h2,h3,h4,h5,h6'))){
      node.childNodes.forEach(append);
      return;
    }
    if(node instanceof HTMLElement&&node.matches('ul,ol')){
      const list=document.createElement(node.tagName);
      for(const item of Array.from(node.children))if(item.tagName==='LI')list.append(outcomeElement('li',outcomeText(item)));
      if(list.childElementCount)safe.append(list);
    }else{
      const text=outcomeText(node);
      if(!text.trim())return;
      const tag=node instanceof HTMLElement&&node.matches('h1,h2')?'h3':node instanceof HTMLElement&&node.matches('h3,h4,h5,h6')?'h4':'p';
      for(const line of text.split('\n'))safe.append(outcomeElement(tag,line));
    }
  }
  source.body.childNodes.forEach(append);
  return safe.innerHTML;
}

export function OutcomeField({label,value,change,readOnly=false}: {label:string;value:string;change:(value:string)=>void;readOnly?:boolean}){
  const id=useId();
  const field=useRef<HTMLDivElement>(null);
  const rendered=useRef<string>();
  const selectionRange=useRef<Range>();
  const [sourceMode,setSourceMode]=useState(false);
  useLayoutEffect(()=>{
    if(sourceMode||readOnly||!field.current){rendered.current=undefined;return}
    if(rendered.current!==value){
      loadOutcome(field.current,value);
      rendered.current=value;
    }
  },[sourceMode,readOnly,value]);

  function sync(){
    if(!field.current)return;
    const next=outcomeValue(field.current);
    if(next===rendered.current)return;
    rendered.current=next;
    change(next);
  }
  function rememberSelection(){
    const selection=document.getSelection();
    if(selection?.rangeCount&&field.current?.contains(selection.anchorNode)){
      selectionRange.current=selection.getRangeAt(0).cloneRange();
    }
  }
  function format(command:string,argument?:string){
    const editable=field.current;
    const selection=document.getSelection();
    const range=selectionRange.current;
    editable?.focus();
    if(range&&selection&&editable?.contains(range.commonAncestorContainer)){
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if(command==='formatBlock'){
      if(document.queryCommandState('insertOrderedList'))document.execCommand('insertOrderedList');
      else if(document.queryCommandState('insertUnorderedList'))document.execCommand('insertUnorderedList');
    }
    document.execCommand(command,false,argument);
    rememberSelection();sync();
  }
  function paste(event:ClipboardEvent<HTMLDivElement>){
    event.preventDefault();
    const html=event.clipboardData.getData('text/html');
    const safe=html?pasteBlocks(html):'';
    if(safe)document.execCommand('insertHTML',false,safe);
    else document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
    sync();
  }
  if(readOnly)return <div className="field span-full">
    <span>{label}</span><div className="mom-outcome-preview" aria-label={label}><Outcome value={value}/></div>
  </div>;
  const commands=[
    ['Paragraf','formatBlock','p'],['Judul','formatBlock','h3'],['Subjudul','formatBlock','h4'],
    ['Daftar poin','insertUnorderedList'],['Daftar bernomor','insertOrderedList'],
  ];
  return <div className="mom-outcome-editor field span-full">
    <label id={id+'-label'} htmlFor={id}>{label}</label>
    <div className="mom-format" role="group" aria-label={'Format '+label}>
      {!sourceMode&&<>
        {commands.map(([caption,command,argument])=><Button className="button" type="button" key={caption}
          onMouseDown={event=>event.preventDefault()} onClick={()=>format(command,argument)}>{caption}</Button>)}
        <Button type="button" className="button" aria-label="Urungkan" title="Urungkan"
          onMouseDown={event=>event.preventDefault()} onClick={()=>format('undo')}><Undo2 size={16}/></Button>
        <Button type="button" className="button" aria-label="Ulangi" title="Ulangi"
          onMouseDown={event=>event.preventDefault()} onClick={()=>format('redo')}><Redo2 size={16}/></Button>
      </>}
      <Button type="button" className="button" aria-pressed={sourceMode} onClick={()=>setSourceMode(mode=>!mode)}>Mode teks</Button>
    </div>
    {sourceMode?<Textarea id={id} value={value} grow={label==='Hasil rapat saat ini'?'paragraph':'note'}
      onChange={event=>change(event.target.value)} aria-describedby={id+'-hint'} placeholder="Tulis hasil dan keputusan rapat."/>:
      <div ref={field} id={id} className="mom-visual-input" role="textbox" aria-multiline="true" aria-labelledby={id+'-label'}
        aria-describedby={id+'-hint'} contentEditable suppressContentEditableWarning onInput={sync} onPaste={paste} onDrop={event=>event.preventDefault()}
        onBlur={rememberSelection} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
        data-placeholder="Tulis hasil dan keputusan rapat."/>}
    <small id={id+'-hint'} className="muted">{sourceMode?'Gunakan # untuk judul, > untuk subjudul, - untuk poin, dan 1. untuk daftar bernomor.':
      'Pilih paragraf atau teks, lalu pilih format. Enter melanjutkan daftar.'}</small>
    {sourceMode&&value.trim()&&<div className="mom-outcome-preview" aria-label={'Pratinjau '+label}><Outcome value={value}/></div>}
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
