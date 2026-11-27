import { LockKeyhole, X } from 'lucide-react';
import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react';

export const TextInput=forwardRef<HTMLInputElement,ComponentPropsWithoutRef<'input'>>(
  function TextInput(props,ref){return <input {...props} ref={ref}/>},
);

type PasswordFieldProps=Omit<ComponentPropsWithoutRef<'input'>,'type'>&{label:string;hint?:string};

export function PasswordField({label,hint,id,required,disabled,'aria-describedby':describedBy,...props}:PasswordFieldProps){
  const generatedId=useId();
  const fieldId=id??generatedId;
  const hintId=hint?fieldId+'-hint':undefined;
  const [visible,setVisible]=useState(false);
  const action=(visible?'Sembunyikan ':'Tampilkan ')+label.toLocaleLowerCase('id');
  return <div className="field">
    <label htmlFor={fieldId}><FieldLabel label={label} required={required}/></label>
    <div className="password-input">
      <LockKeyhole className="password-lock" size={17} aria-hidden="true"/>
      <TextInput {...props} id={fieldId} type={visible&&!disabled?'text':'password'} required={required} disabled={disabled}
        aria-describedby={[describedBy,hintId].filter(Boolean).join(' ')||undefined}/>
      <button type="button" className="password-toggle" aria-controls={fieldId} aria-label={action} title={action}
        disabled={disabled} onClick={()=>setVisible(value=>!value)}>
        <span className={visible?'password-eye is-visible':'password-eye'} aria-hidden="true"/>
      </button>
    </div>
    {hint&&<small id={hintId} className="muted">{hint}</small>}
  </div>;
}

type TextareaProps=ComponentPropsWithoutRef<'textarea'>&{grow?:'note'|'paragraph'};
export const Textarea=forwardRef<HTMLTextAreaElement,TextareaProps>(
  function Textarea({grow,rows,value,defaultValue,onInput,...props},ref){
    const field=useRef<HTMLTextAreaElement>(null);
    const minimum=rows??(grow==='paragraph'?6:3);
    useImperativeHandle(ref,()=>field.current!,[]);
    function resize(){
      const element=field.current;
      if(!grow||!element||!element.clientWidth||CSS.supports('field-sizing','content'))return;
      const scroll=element.scrollTop;
      element.style.height='auto';
      const borders=element.offsetHeight-element.clientHeight;
      element.style.height=element.scrollHeight+borders+'px';
      element.scrollTop=scroll;
    }
    useLayoutEffect(resize,[value,defaultValue,grow]);
    useLayoutEffect(()=>{
      if(!grow||!field.current||CSS.supports('field-sizing','content'))return;
      let width=0;
      const observer=new ResizeObserver(([entry])=>{
        if(entry.contentRect.width===width)return;
        width=entry.contentRect.width;
        resize();
      });
      observer.observe(field.current);
      return ()=>observer.disconnect();
    },[grow]);
    return <textarea {...props} ref={field} value={value} defaultValue={defaultValue}
      rows={grow?minimum:rows} data-grow={grow} style={grow?{...props.style,'--textarea-lines':minimum} as CSSProperties:props.style}
      onInput={event=>{onInput?.(event);resize()}}/>;
  },
);

export function SelectClear({label,onClear}:{label:string;onClear:()=>void}){
  return <button type="button" className="icon-button select-clear" aria-label={label} title={label} onClick={onClear}>
    <X size={16} aria-hidden="true"/>
  </button>;
}

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
    {clearLabel&&!empty&&!props.disabled&&!props.required&&String(props['aria-required'])!=='true'&&
      <SelectClear label={clearLabel} onClear={()=>{
        const field=select.current;
        if(!field||field.matches(':disabled'))return;
        field.value='';
        field.dispatchEvent(new Event('change',{bubbles:true}));
        field.focus();
      }}/>}
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
