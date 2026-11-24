import { useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { contractAmount, parseContractDates, pillarOptions, projectStatuses, type Project } from '../../../packages/shared/domain';
import { masterLabels, type ProjectCatalog, type ProjectDraft, type ProjectErrors, type ProjectOption } from '../../../packages/shared/project-entry';
import { normalizedProjectName } from '../../../packages/shared/workspace-admin';
import { MoneyInput } from './money-input';

function MasterSelect({id,label,name,options,value,invalid,describedBy,onChange}:{
  id:string;label:string;name:string;options:ProjectOption[];value:string;invalid:boolean;describedBy?:string;onChange:(value:string)=>void;
}){
  const [query,setQuery]=useState('');
  const select=useRef<HTMLSelectElement>(null);
  const search=normalizedProjectName(query);
  const filtered=options.filter(option=>option.id===value||normalizedProjectName(option.label).includes(search));
  return <>
    {options.length>0&&<input type="search" aria-label={'Cari '+label} placeholder={'Cari '+label.toLowerCase()} value={query}
      onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{
        if(event.key==='Enter'){event.preventDefault();select.current?.focus()}
      }}/>}
    <select ref={select} id={id} name={name} value={value} aria-invalid={invalid} aria-describedby={describedBy}
      onChange={event=>{onChange(event.target.value);setQuery('')}}>
      <option value="">{options.length?'Pilih '+label.toLowerCase():'Referensi belum tersedia'}</option>
      {value&&!options.some(option=>option.id===value)&&<option value={value}>Nilai lama</option>}
      {filtered.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {search&&!filtered.some(option=>normalizedProjectName(option.label).includes(search))&&<small className="muted" role="status">Tidak ada hasil.</small>}
  </>;
}

export function ProjectFields({draft,errors,catalog,update,disabled,previous,nameField}:{
  draft:ProjectDraft;errors:ProjectErrors;catalog:ProjectCatalog;disabled:boolean;previous?:Project;nameField?:Ref<HTMLInputElement>;
  update:<K extends keyof ProjectDraft>(key:K,value:ProjectDraft[K])=>void;
}){
  const prefix=useId();
  function props(key:keyof ProjectDraft){
    return {id:prefix+key,name:key,'aria-invalid':Boolean(errors[key]),'aria-describedby':errors[key]?prefix+key+'-error':undefined};
  }
  function field(key:keyof ProjectDraft,label:string,control:ReactNode,wide=false){
    return <div className={'project-field'+(wide?' span-full':'')}>
      <label htmlFor={prefix+key}>{label}</label>{control}
      {errors[key]&&<small id={prefix+key+'-error'} className="project-field-error" role="alert">{errors[key]}</small>}
    </div>;
  }
  const text=(key:'name'|'billing')=><input {...props(key)} required={key==='name'} maxLength={key==='name'?500:16000}
    ref={key==='name'?nameField:undefined} value={draft[key]} onChange={event=>update(key,event.target.value)}/>;
  function master(key:keyof ProjectCatalog){
    return field(key,masterLabels[key],<MasterSelect id={prefix+key} name={key} label={masterLabels[key]} options={catalog[key]}
      value={draft[key]} invalid={Boolean(errors[key])} describedBy={props(key)['aria-describedby']} onChange={value=>update(key,value)}/>);
  }
  function date(key:'start'|'end',label:string){
    return field(key,label,<input {...props(key)} type="date" value={draft[key]} onChange={e=>update(key,e.target.value)}/>);
  }
  return <fieldset className="project-edit-fields" disabled={disabled}>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'main'}>
      <h3 className="span-full" id={prefix+'main'}>Informasi proyek</h3>
      {field('name','Nama proyek',text('name'),true)}
      {field('pillarId','Pilar',<select {...props('pillarId')} required value={draft.pillarId} onChange={e=>update('pillarId',e.target.value)}>
        <option value="">Pilih pilar</option>{pillarOptions.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}
      </select>)}
      {field('status','Status proyek',<select {...props('status')} value={draft.status} onChange={e=>update('status',e.target.value)}>
        {projectStatuses.map(status=><option key={status}>{status}</option>)}
      </select>)}
      {master('customerId')}{master('pmId')}{master('salesId')}
    </section>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'contract'}>
      <h3 className="span-full" id={prefix+'contract'}>Informasi kontrak</h3>
      {date('start','Tanggal mulai kontrak')}{date('end','Tanggal akhir kontrak')}
      {previous?.detail.period&&!previous.contractDates&&!parseContractDates(previous.detail.period)&&<p className="muted span-full">Periode tercatat: {previous.detail.period}</p>}
      {field('value','Nilai kontrak',<div className="project-money-input"><span aria-hidden="true">Rp</span>
        <MoneyInput {...props('value')} value={draft.value} onValue={value=>update('value',value)}/>
      </div>)}
      {field('billing','Ketentuan penagihan',text('billing'))}
      {previous?.detail.value&&contractAmount(previous.detail.value)===null&&<p className="muted span-full">Nilai tercatat: {previous.detail.value}</p>}
    </section>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'extra'}>
      <h3 className="span-full" id={prefix+'extra'}>Informasi tambahan</h3>
      {field('resourceCount','Jumlah sumber daya',<input {...props('resourceCount')} type="number" min="0" step="1"
        value={draft.resourceCount} onChange={e=>update('resourceCount',e.target.value)}/>)}
      {previous?.detail.resourceCount&&!/^\d+$/.test(String(previous.detail.resourceCount).trim())&&
        <p className="muted span-full">Sumber daya tercatat: {previous.detail.resourceCount}</p>}
      {field('notes','Catatan SPK/PKS',<textarea {...props('notes')} value={draft.notes} onChange={e=>update('notes',e.target.value)}/>,true)}
      <label className="check span-full"><input type="checkbox" checked={draft.verified} onChange={e=>update('verified',e.target.checked)}/> Sudah dicek ke sumber resmi</label>
    </section>
  </fieldset>;
}
