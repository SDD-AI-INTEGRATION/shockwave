import { forwardRef, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

export const TextInput=forwardRef<HTMLInputElement,ComponentPropsWithoutRef<'input'>>(
  function TextInput(props,ref){return <input {...props} ref={ref}/>},
);
export const Textarea=forwardRef<HTMLTextAreaElement,ComponentPropsWithoutRef<'textarea'>>(
  function Textarea(props,ref){return <textarea {...props} ref={ref}/>},
);

type SelectProps=ComponentPropsWithoutRef<'select'>&{placeholder?:string;clearLabel?:string};
export function Select({placeholder,clearLabel,value,defaultValue,onChange,children,...props}:SelectProps){
  const [uncontrolled,setUncontrolled]=useState(defaultValue??'');
  const select=useRef<HTMLSelectElement>(null);
  const empty=(value??uncontrolled)==='';
  if(!placeholder)return <select {...props} value={value} defaultValue={defaultValue} onChange={onChange}>{children}</select>;
  return <span className="select-example">
    {empty&&<span className="select-example-text" aria-hidden="true">{placeholder}</span>}
    <select ref={select} {...props} value={value} defaultValue={value===undefined?defaultValue??'':undefined}
      onChange={event=>{if(value===undefined)setUncontrolled(event.currentTarget.value);onChange?.(event)}}>
      <option value="" disabled hidden>{placeholder}</option>
      {children}
    </select>
    {clearLabel&&!empty&&!props.disabled&&!props.required&&props['aria-required']!==true&&
      <button type="button" className="icon-button select-clear" aria-label={clearLabel} title={clearLabel} onClick={()=>{
        const field=select.current;
        if(!field||field.matches(':disabled'))return;
        field.value='';
        field.dispatchEvent(new Event('change',{bubbles:true}));
        field.focus();
      }}>×</button>}
  </span>;
}

export function FieldLabel({label,required=false}:{label:string;required?:boolean}){
  return <span>{label}{required&&<span className="required-mark" aria-hidden="true">{'\u00a0*'}</span>}</span>;
}
export function FormField({label,required,children,...props}:ComponentPropsWithoutRef<'label'>&{
  label:string;required?:boolean;children:ReactNode;
}){
  return <label {...props}><FieldLabel label={label} required={required}/>{children}</label>;
}
