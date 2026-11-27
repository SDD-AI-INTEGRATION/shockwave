import { TextInput, Textarea, Select } from './form-controls';
import { useId, type ReactNode, type Ref } from 'react';
import { contractAmount, parseContractDates, pillarOptions, projectStatuses, type Project } from '../../../packages/shared/domain';
import { masterLabels, type ProjectCatalog, type ProjectDraft, type ProjectErrors } from '../../../packages/shared/project-entry';
import { DateInput } from './date-input';
import { SearchableSelect } from './search-select';
import { CurrencyInput } from './money-input';
import { NumberInput } from './number-input';
import { FieldLabel } from './ui';

export function ProjectFields({draft,errors,catalog,update,disabled,previous,nameField,onInvalidDate}:{
  draft:ProjectDraft;errors:ProjectErrors;catalog:ProjectCatalog;disabled:boolean;previous?:Project;nameField?:Ref<HTMLInputElement>;
  onInvalidDate:(key:'start'|'end',invalid:boolean)=>void;
  update:<K extends keyof ProjectDraft>(key:K,value:ProjectDraft[K])=>void;
}){
  const prefix=useId();
  function props(key:keyof ProjectDraft){
    return {id:prefix+key,name:key,'aria-invalid':Boolean(errors[key]),'aria-describedby':errors[key]?prefix+key+'-error':undefined};
  }
  function field(key:keyof ProjectDraft,label:string,control:ReactNode,wide=false,required=false){
    return <div className={'project-field'+(wide?' span-full':'')}>
      <label htmlFor={prefix+key}><FieldLabel label={label} required={required}/></label>{control}
      {errors[key]&&<small id={prefix+key+'-error'} className="project-field-error" role="alert">{errors[key]}</small>}
    </div>;
  }
  const text=(key:'name'|'billing')=><TextInput {...props(key)} required={key==='name'} placeholder={key==='name'?'Pengembangan Portal Layanan':'Bulanan atau per milestone'} maxLength={key==='name'?500:16000}
    ref={key==='name'?nameField:undefined} value={draft[key]} onChange={event=>update(key,event.target.value)}/>;
  function master(key:keyof ProjectCatalog){
    return field(key,masterLabels[key],<SearchableSelect id={prefix+key} name={key} label={masterLabels[key]} options={catalog[key]}
      emptyLabel={catalog[key].length?'Pilih '+masterLabels[key].toLowerCase():'Referensi belum tersedia'}
      example={{customerId:'PT Nusantara Digital',pmId:'Rani Pratama',salesId:'Dimas Saputra'}[key]}
      legacyLabel={previous?.detail[{customerId:'customer',pmId:'pm',salesId:'sales'}[key] as 'customer'|'pm'|'sales']}
      value={draft[key]} invalid={Boolean(errors[key])} describedBy={props(key)['aria-describedby']} onChange={value=>update(key,value)}/>);
  }
  function date(key:'start'|'end',label:string){
    return field(key,label,<DateInput {...props(key)} label={label} placeholder={key==='start'?'24/11/2026':'31/03/2027'} value={draft[key]} onValue={value=>update(key,value)} onInvalidDraft={invalid=>onInvalidDate(key,invalid)}/>);
  }
  return <fieldset className="project-edit-fields" disabled={disabled}>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'main'}>
      <h3 className="span-full" id={prefix+'main'}>Informasi proyek</h3>
      {field('name','Nama proyek',text('name'),true,true)}
      {field('pillarId','Pilar',<Select {...props('pillarId')} required placeholder="IT Infrastructure" value={draft.pillarId}
        onChange={e=>update('pillarId',e.target.value)}>
        {pillarOptions.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}
      </Select>,false,true)}
      {field('status','Status proyek',<Select {...props('status')} value={draft.status} onChange={e=>update('status',e.target.value)}>
        {projectStatuses.map(status=><option key={status}>{status}</option>)}
      </Select>)}
      {master('customerId')}{master('pmId')}{master('salesId')}
    </section>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'contract'}>
      <h3 className="span-full" id={prefix+'contract'}>Informasi kontrak</h3>
      {date('start','Tanggal mulai kontrak')}{date('end','Tanggal akhir kontrak')}
      {previous?.detail.period&&!previous.contractDates&&!parseContractDates(previous.detail.period)&&<p className="muted span-full">Periode tercatat: {previous.detail.period}</p>}
      {field('value','Nilai kontrak',<div className="project-money-input"><span aria-hidden="true">Rp</span>
        <CurrencyInput {...props('value')} placeholder="125.000.000,00" value={draft.value} onValue={value=>update('value',value)}/>
      </div>)}
      {field('billing','Ketentuan penagihan',text('billing'))}
      {previous?.detail.value&&contractAmount(previous.detail.value)===null&&<p className="muted span-full">Nilai tercatat: {previous.detail.value}</p>}
    </section>
    <section className="field-grid project-fields-section" aria-labelledby={prefix+'extra'}>
      <h3 className="span-full" id={prefix+'extra'}>Informasi tambahan</h3>
      {field('resourceCount','Jumlah sumber daya',<NumberInput {...props('resourceCount')} integer storeUngrouped placeholder="5"
        value={draft.resourceCount} onValue={value=>update('resourceCount',value)}/>)}
      {previous?.detail.resourceCount&&!/^\d+$/.test(String(previous.detail.resourceCount).trim())&&
        <p className="muted span-full">Sumber daya tercatat: {previous.detail.resourceCount}</p>}
      {field('notes','Catatan SPK/PKS',<Textarea grow="note" {...props('notes')} placeholder="SPK-014/2026, termin pertama setelah UAT." value={draft.notes} onChange={e=>update('notes',e.target.value)}/>,true)}
    </section>
  </fieldset>;
}
