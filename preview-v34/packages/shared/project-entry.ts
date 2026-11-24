import { z } from 'zod';
import { contractAmount, formatContractDates, parseContractDates, projectMetrics, projectStatuses, resolvePillar, type Project } from './domain';
import { formatMoneyNumber, parseRupiahInput } from './money';
import { normalizedProjectName } from './workspace-admin';

export const masterFields = ['customerId','pmId','salesId'] as const;
const detailKeys = {customerId:'customer',pmId:'pm',salesId:'sales'} as const;
export const masterLabels = {customerId:'Pelanggan',pmId:'Project Manager',salesId:'Sales'} as const;
export type ProjectOption = {id:string;label:string};
export type ProjectCatalog = Record<typeof masterFields[number],ProjectOption[]>;
const masterId = (label:string) => encodeURIComponent(normalizedProjectName(label));

export function projectCatalog(projects:Project[]):ProjectCatalog {
  const catalog:ProjectCatalog={customerId:[],pmId:[],salesId:[]};
  for(const field of masterFields){
    const values=new Map<string,ProjectOption>();
    for(const project of projects){
      const label=project.detail[detailKeys[field]].trim();
      // The existing source marks this customer as swapped with the period.
      if(!label||/^[—–-]$/.test(label)||(field==='customerId'&&project.id==='P004'&&!project.references?.customerId))continue;
      const id=project.references?.[field]||masterId(label);
      if(!values.has(id))values.set(id,{id,label});
    }
    catalog[field]=[...values.values()].sort((a,b)=>a.label.localeCompare(b.label,'id'));
  }
  return catalog;
}

const text=z.string().max(16000);
const draftSchema=z.object({
  name:z.string().max(500),pillarId:text,customerId:text,pmId:text,salesId:text,
  status:z.string().max(20),start:z.string().max(10),end:z.string().max(10),
  value:z.string().max(200),billing:text,notes:text,resourceCount:z.string().max(40),verified:z.boolean(),
});
export type ProjectDraft=z.infer<typeof draftSchema>;
export type ProjectErrors=Partial<Record<keyof ProjectDraft,string>>;
export const projectImportRows=z.array(z.object({
  row:z.number().int().min(2),draft:draftSchema,
  plan:z.number().nonnegative().finite().max(1e15).optional(),
  actual:z.number().nonnegative().finite().max(1e15).optional(),
})).min(1).max(200).refine(rows=>new Set(rows.map(row=>row.row)).size===rows.length);
export type ProjectImportRow=z.infer<typeof projectImportRows>[number];

export function projectDraft(project?:Project):ProjectDraft {
  const blank={name:'',pillarId:'',customerId:'',pmId:'',salesId:'',status:'Aktif',start:'',end:'',value:'',billing:'',notes:'',resourceCount:'',verified:false};
  if(!project)return blank;
  const d=project.detail;
  const metrics=projectMetrics(project);
  const dates=project.contractDates??parseContractDates(d.period);
  const quantity=String(d.resourceCount).trim();
  const amount=contractAmount(d.value);
  return {...blank,name:d.name,pillarId:resolvePillar(metrics.pillar)?.id??'',
    customerId:project.references?.customerId??(project.id==='P004'?'':masterId(d.customer)),pmId:project.references?.pmId??masterId(d.pm),
    salesId:project.references?.salesId??masterId(d.sales),status:metrics.status,start:dates?.[0]??'',end:dates?.[1]??'',
    value:amount===null?'':formatMoneyNumber(amount),billing:d.billing,notes:d.notes,
    resourceCount:/^\d+$/.test(quantity)?quantity:'',verified:!project.verification};
}

function isISODate(date:string) {
  if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date))return false;
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===date;
}

export function validateProjectDraft(raw:unknown,catalog:ProjectCatalog,previous?:Project){
  const parsed=draftSchema.safeParse(raw);
  if(!parsed.success)return {errors:{name:'Periksa panjang dan format isian proyek.'} as ProjectErrors};
  const draft=parsed.data;
  const initial=previous&&projectDraft(previous);
  const errors:ProjectErrors={};
  const name=draft.name.trim();
  const pillar=resolvePillar(draft.pillarId);
  const status=projectStatuses.find(option=>option===draft.status);
  if(!name)errors.name='Masukkan nama proyek.';
  if(!pillar)errors.pillarId='Pilih Pilar dari master.';
  if(!status)errors.status='Pilih status proyek yang tersedia.';
  const labels={customer:'',pm:'',sales:''};
  for(const field of masterFields){
    const key=detailKeys[field];
    const id=draft[field];
    const chosen=catalog[field].find(option=>option.id===id);
    if(previous&&id===initial?.[field]) labels[key]=previous.detail[key];
    else if(chosen)labels[key]=chosen.label;
    else if(id)errors[field]='Pilih '+masterLabels[field]+' dari daftar yang tersedia.';
  }
  const datesChanged=!previous||draft.start!==initial?.start||draft.end!==initial?.end;
  if(datesChanged&&(draft.start||draft.end)){
    if(!isISODate(draft.start))errors.start='Masukkan tanggal mulai yang valid.';
    if(!isISODate(draft.end))errors.end='Masukkan tanggal akhir yang valid.';
    else if(!errors.start&&draft.end<draft.start)errors.end='Tanggal akhir tidak boleh mendahului tanggal mulai.';
  }
  const value=parseRupiahInput(draft.value);
  if(draft.value&&value===null&&draft.value!==initial?.value)errors.value='Masukkan nilai Rupiah nonnegatif dengan maksimal dua desimal.';
  const quantity=Number(draft.resourceCount);
  if(draft.resourceCount&&(!/^\d+$/.test(draft.resourceCount)||!Number.isSafeInteger(quantity))&&draft.resourceCount!==initial?.resourceCount)
    errors.resourceCount='Masukkan bilangan bulat yang tidak negatif.';
  if(Object.keys(errors).length||!pillar||!status)return {errors};
  const dates:[string,string]|undefined=datesChanged?(draft.start?[draft.start,draft.end]:undefined):
    previous?.contractDates??(draft.start&&draft.end?[draft.start,draft.end]:undefined);
  const fields:Pick<Project,'detail'|'verification'|'references'|'contractDates'|'manualStatus'>={
    detail:{name,...labels,period:datesChanged?formatContractDates(draft.start,draft.end):previous!.detail.period,
      value:previous&&draft.value===initial?.value?(value??previous.detail.value):value??'',
      resourceCount:previous&&draft.resourceCount===initial?.resourceCount?(draft.resourceCount?quantity:previous.detail.resourceCount):draft.resourceCount?quantity:'',
      billing:draft.billing,notes:draft.notes},
    verification:!draft.verified,
    references:{pillarId:pillar.id,pillar:pillar.label,customerId:draft.customerId,pmId:draft.pmId,salesId:draft.salesId},
    contractDates:dates,manualStatus:status,
  };
  return {errors,fields};
}

export function duplicateProjectName(name:string,projects:Pick<Project,'id'|'detail'>[],exceptId?:string){
  const key=normalizedProjectName(name);
  return projects.some(project=>project.id!==exceptId&&normalizedProjectName(project.detail.name)===key);
}
