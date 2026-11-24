import { parseRupiahInput } from '../../../packages/shared/money';
import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

type MoneyInputProps = Omit<ComponentPropsWithoutRef<'input'>,'type'|'inputMode'|'value'|'onChange'> & {
  value:string;
  onValue:(value:string)=>void;
  whole?:boolean;
};

export function MoneyInput({value,onValue,whole=false,...props}:MoneyInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number|null>(null);
  useLayoutEffect(()=>{
    if(caret.current===null) return;
    input.current?.setSelectionRange(caret.current,caret.current);
    caret.current=null;
  });
  return <input {...props} ref={input} type="text" inputMode={whole?'numeric':'decimal'} value={value} onPaste={event=>{
    const pasted=event.clipboardData.getData('text').trim();
    // Avoid changing the magnitude of an ambiguously grouped value pasted from another locale.
    if(pasted.replace(/^Rp\.?\s*/i,'').includes('.') && parseRupiahInput(pasted)===null)event.preventDefault();
  }} onChange={event=>{
    const element=event.currentTarget;
    const raw=element.value;
    const digits=raw.replace(/^\s*Rp\.?\s*/i,'').replaceAll('.','').trim();
    const valid=whole ? /^\d*$/ : /^\d*(?:,\d*)?$/;
    if(!valid.test(digits)){onValue(raw);return;}
    const [integer,fraction]=digits.split(',');
    const grouped=integer.replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    const formatted=fraction===undefined ? grouped : grouped+','+fraction;
    const position=element.selectionStart??raw.length;
    const count=raw.slice(0,position).replace(/[^\d,]/g,'').length;
    let index=0;
    let seen=0;
    while(index<formatted.length && seen<count){
      if(formatted[index]!=='.')seen++;
      index++;
    }
    if (formatted===value) {
      element.value=formatted;
      element.setSelectionRange(index,index);
      return;
    }
    caret.current=index;
    onValue(formatted);
  }}/>;
}
