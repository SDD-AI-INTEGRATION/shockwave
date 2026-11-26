import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './ui';
import { NavIcon } from './nav-icon';

import { defaultDocumentLogo, isSessionLogo } from '../../../packages/shared/document-branding';
export { defaultDocumentLogo };
const imageLimit=5*1024*1024;
const accept='image/png,image/jpeg,image/webp';

export async function documentImage(file:File,max=1200) {
  if(!/^image\/(png|jpe?g|webp)$/.test(file.type)||file.size>imageLimit)throw new Error('Pilih gambar PNG, JPG, atau WebP hingga 5 MB.');
  let image:ImageBitmap;
  try{image=await createImageBitmap(file)}
  catch{throw new Error('Gambar tidak dapat dibaca. Pilih file gambar yang valid.')}
  try{
    const scale=Math.min(1,max/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/webp',.82);
  }finally{image.close()}
}

export function DocumentLogo({value,disabled,onChange,fallback=defaultDocumentLogo,resetLabel='Gunakan logo default'}:{
  value:string;disabled:boolean;onChange:(value:string)=>void|Promise<void>;fallback?:string;resetLabel?:string;
}){
  const [error,setError]=useState('');
  const [uploaded,setUploaded]=useState<{value:string;name:string}>();
  const [busy,setBusy]=useState(false);
  const field=useRef<HTMLInputElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  const request=useRef(0);
  const latest=useRef({disabled,onChange});
  latest.current={disabled,onChange};
  useEffect(()=>()=>{request.current++},[]);

  async function replace(file:File){
    const current=++request.current;
    setBusy(true);
    setError('');
    try{
      const image=await documentImage(file,700);
      if(!isSessionLogo(image))throw new Error('Logo tidak dapat dikonversi menjadi WebP yang valid.');
      if(current===request.current&&!latest.current.disabled){
        await latest.current.onChange(image);
        if(current===request.current)setUploaded({value:image,name:file.name});
      }
    }catch(error){if(current===request.current)setError(file.name+'. '+(error as Error).message)}
    finally{if(current===request.current)setBusy(false)}
  }

  async function reset(){
    const current=++request.current;
    setBusy(true);
    setError('');
    try{
      await latest.current.onChange('');
      if(current===request.current){setUploaded(undefined);trigger.current?.focus()}
    }catch(error){if(current===request.current)setError((error as Error).message)}
    finally{if(current===request.current)setBusy(false)}
  }

  return <div className="span-full field document-logo-control">
    <span>Logo dokumen</span>
    <img className="document-logo-preview" src={value||fallback} alt={value||fallback!==defaultDocumentLogo?'Logo dokumen yang diunggah':'Logo resmi Swadharma Duta Data'}/>
    <span className="document-logo-name">{value?(uploaded&&uploaded.value===value?uploaded.name:'Logo unggahan'):(fallback===defaultDocumentLogo?'Logo resmi SDD':'Logo workspace')}</span>
    {!disabled&&<>
      <small id={id} className="muted">PNG, JPEG, atau WebP. Maksimal 5 MB.</small>
      <div className="heading-actions">
        <input ref={field} type="file" hidden aria-label="File logo dokumen" accept={accept} onChange={event=>{
          const file=event.currentTarget.files?.[0];
          event.currentTarget.value='';
          if(file)void replace(file);
        }}/>
        <Button ref={trigger} className="button" type="button" aria-describedby={error?id+' '+id+'-error':id} pending={busy?'Memuat logo…':undefined} onClick={()=>field.current?.click()}><NavIcon name="upload"/> {value?'Ganti logo':'Unggah logo'}</Button>
        <Button className="button" type="button" disabled={busy||!value} onClick={()=>void reset()}>{resetLabel}</Button>
      </div>
      {error&&<small className="field-error" id={id+'-error'} role="alert">{error}</small>}
    </>}
  </div>;
}
