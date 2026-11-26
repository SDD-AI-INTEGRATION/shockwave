import { useId, useState, type ComponentPropsWithoutRef } from 'react';
import { formatMoneyNumber } from '../../../packages/shared/money';
import { parseFormNumber } from '../../../packages/shared/form-number';
import { TextInput } from './form-controls';

type Props=Omit<ComponentPropsWithoutRef<'input'>,'type'|'min'|'max'|'value'|'onChange'>&{
  value:string;onValue:(value:string)=>void;integer?:boolean;min?:number;max?:number;
  storeUngrouped?:boolean;
};

export function NumberInput({value,onValue,integer=false,min=0,max=Number.MAX_SAFE_INTEGER,storeUngrouped=false,...props}:Props){
  const [draft,setDraft]=useState<{source:string;text:string}>();
  const [touched,setTouched]=useState(false);
  const errorId=useId();
  const raw=draft?.source===value?draft.text:(storeUngrouped&&value&&parseFormNumber(value,{integer})!==null?formatMoneyNumber(Number(value)):value);
  const parsed=parseFormNumber(raw,{integer,min,max,allowDotDecimal:!integer});
  const error=Boolean(raw)&&parsed===null;
  const message=integer?'Masukkan bilangan bulat yang valid.':'Masukkan angka dengan maksimal dua desimal.';
  const range=max===Number.MAX_SAFE_INTEGER?message:'Masukkan angka '+formatMoneyNumber(min)+'–'+formatMoneyNumber(max)+(integer?' tanpa desimal.':', maksimal dua desimal.');

  function update(text:string){
    const number=parseFormNumber(text,{integer,min,max,allowDotDecimal:!integer});
    const next=storeUngrouped&&number!==null?String(number):text;
    setDraft({source:next,text});
    onValue(next);
  }

  return <>
    <TextInput {...props} type="text" inputMode={integer?'numeric':'decimal'} value={raw}
      ref={input=>input?.setCustomValidity(error?range:'')} aria-invalid={props['aria-invalid']||touched&&error||undefined}
      aria-describedby={[props['aria-describedby'],touched&&error?errorId:null].filter(Boolean).join(' ')||undefined}
      onChange={event=>update(event.target.value)}
      onBlur={event=>{
        setTouched(true);
        if(parsed!==null)update(formatMoneyNumber(parsed));
        props.onBlur?.(event);
      }}/>
    {touched&&error&&!props['aria-invalid']&&<small className="field-error" id={errorId}>{range}</small>}
  </>;
}
