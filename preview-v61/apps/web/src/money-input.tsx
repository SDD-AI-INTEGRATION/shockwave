import { TextInput } from './form-controls';
import { parseRupiahInput } from '../../../packages/shared/money';
import { useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';

type MoneyInputProps = Omit<ComponentPropsWithoutRef<'input'>,'type'|'inputMode'|'value'|'onChange'> & {
  value:string;
  onValue:(value:string)=>void;
  whole?:boolean;
  maxAmount?:number;
};

export function CurrencyInput({value,onValue,whole=false,maxAmount=Number.MAX_SAFE_INTEGER,...props}:MoneyInputProps) {
  const [touched,setTouched]=useState(false);
  const errorId=useId();
  const parsed=parseRupiahInput(value);
  const invalid=Boolean(value)&&(parsed===null||parsed>maxAmount||whole&&!Number.isInteger(parsed));
  const message=whole?'Masukkan Rupiah dalam bilangan bulat sesuai batas.':'Masukkan nilai Rupiah nonnegatif dengan maksimal dua desimal.';
  const input = useRef<HTMLInputElement|null>(null);
  const caret = useRef<number|null>(null);
  useLayoutEffect(()=>{
    if(caret.current===null) return;
    input.current?.setSelectionRange(caret.current,caret.current);
    caret.current=null;
  });
  return <span className="numeric-control"><TextInput {...props} ref={element=>{input.current=element;element?.setCustomValidity(invalid?message:'')}}
    onBlur={event=>{setTouched(true);props.onBlur?.(event)}}
    aria-invalid={props['aria-invalid']||touched&&invalid||undefined}
    aria-describedby={[props['aria-describedby'],touched&&invalid&&!props['aria-invalid']?errorId:null].filter(Boolean).join(' ')||undefined} type="text" inputMode={whole?'numeric':'decimal'} value={value} onPaste={event=>{
    const pasted=event.clipboardData.getData('text').trim();
    // Avoid changing the magnitude of an ambiguously grouped value pasted from another locale.
    if(!pasted)return;
    const element=event.currentTarget;
    const combined=value.slice(0,element.selectionStart??0)+pasted+value.slice(element.selectionEnd??value.length);
    if(parseRupiahInput(combined)===null){
      event.preventDefault();
      caret.current=null;onValue(combined);setTouched(true);
    }
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
  }}/>
    {touched&&invalid&&!props['aria-invalid']&&<small className="field-error" id={errorId}>{message}</small>}
  </span>;
}
