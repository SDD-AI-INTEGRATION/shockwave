import { z } from 'zod';
import seed from './lesson-learned-seed.json';

export const lessonCode='SDD-FM-PMO-01-03';
export const lessonTemplate='1.1';
export const lessonAnswers=[['YES','Yes'],['NO','No'],['NA','N/A']] as const;
const identifier=z.string().uuid();
const itemSchema=z.object({
  id:identifier,
  prompt:z.string().min(1,'Isi redaksi pertanyaan.').max(1500).refine(value=>Boolean(value.trim()),'Isi redaksi pertanyaan.'),
  answer:z.enum(['YES','NO','NA']).nullable(),
}).strict();
const categorySchema=z.object({
  id:identifier,
  name:z.string().min(1,'Isi nama kategori.').max(160).refine(value=>Boolean(value.trim()),'Isi nama kategori.'),
  items:z.array(itemSchema).max(300),
}).strict();
export function lessonDateValid(value:string){
  if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
}
export const lessonDataSchema=z.object({
  projectId:z.string().min(1,'Pilih proyek.').max(100),
  projectName:z.string().max(220),
  preparedByName:z.string().max(160),
  projectManagerName:z.string().max(160),
  documentDate:z.string().refine(value=>value===''||lessonDateValid(value),'Tanggal dokumen tidak valid.'),
  categories:z.array(categorySchema).max(100),
  description:z.string().max(24000),
}).strict().superRefine(({categories},context)=>{
  const ids=new Set<string>();
  function checkId(id:string,path:(number|string)[]){
    if(ids.has(id))context.addIssue({code:'custom',message:'Identitas kategori atau pertanyaan terduplikasi.',path});
    ids.add(id);
  }
  categories.forEach((category,index)=>{
    checkId(category.id,['categories',index,'id']);
    category.items.forEach((item,row)=>checkId(item.id,['categories',index,'items',row,'id']));
  });
  if(categories.reduce((count,category)=>count+category.items.length,0)>300)
    context.addIssue({code:'custom',message:'Maksimum 300 pertanyaan per dokumen.',path:['categories']});
});
export type LessonData=z.infer<typeof lessonDataSchema>;
export type LessonCategory=LessonData['categories'][number];
export type LessonItem=LessonCategory['items'][number];
export type LessonStatus='DRAFT'|'FINAL';
export interface LessonRecord {
  id:string;
  data:LessonData;
  status:LessonStatus;
  version:number;
  templateVersion:typeof lessonTemplate;
  formCode:typeof lessonCode;
  logo:string;
  createdAt:string;
  createdBy:string;
  updatedAt:string;
  updatedBy:string;
  finalizedAt:string|null;
  finalizedBy:string|null;
}
export interface LessonProject {id:string;name:string;pm:string}
export interface LessonIndex {
  projects:LessonProject[];
  records:LessonArchiveRow[];
}
export interface LessonArchiveRow {
  id:string; status:LessonStatus; updatedAt:string; finalizedAt:string|null;
  projectId:string; projectName:string; preparedByName:string; documentDate:string;
}

export const lessonWriteSchema=z.object({
  expectedVersion:z.number().int().nonnegative(),
  requestId:identifier,
  status:z.enum(['DRAFT','FINAL']),
  data:lessonDataSchema,
}).strict();
export type LessonWrite=z.infer<typeof lessonWriteSchema>;

export function lessonSeed():LessonCategory[]{
  return Object.entries(seed).map(([name,prompts])=>({
    id:crypto.randomUUID(),name,items:prompts.map(prompt=>({id:crypto.randomUUID(),prompt,answer:null})),
  }));
}
export function lessonToday(now=new Date()){
  const fields=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(field=>fields.find(part=>part.type===field)?.value).join('-');
}
export function lessonDateLabel(value:string){return value.split('-').reverse().join('/')}
export function lessonCounts(categories:LessonCategory[]){
  const count={total:0,answered:0,YES:0,NO:0,NA:0,unanswered:0,progress:0};
  for(const {items} of categories)for(const item of items){
    count.total++;
    if(item.answer){count[item.answer]++;count.answered++}else count.unanswered++;
  }
  count.progress=count.total?count.answered/count.total:0;
  return count;
}
export function lessonFinalErrors(data:LessonData){
  const count=lessonCounts(data.categories);
  return [
    !data.projectName.trim()&&'Isi nama proyek.',
    !data.preparedByName.trim()&&'Isi nama penyusun.',
    !lessonDateValid(data.documentDate)&&'Isi tanggal dokumen yang valid.',
    !data.projectManagerName.trim()&&'Isi nama Project Manager.',
    !count.total?'Tambahkan minimal satu pertanyaan.':count.unanswered>0&&'Lengkapi semua jawaban.',
  ].filter((message):message is string=>Boolean(message));
}

export function moveLessonEntry<T>(list:T[],from:number,to:number){
  if(from<0||to<0||from>=list.length||to>=list.length||from===to)return list;
  const next=list.slice();
  next.splice(to,0,next.splice(from,1)[0]);
  return next;
}

export function moveLessonQuestion(categories:LessonCategory[],source:string,target:string,id:string,targetItem?:string){
  const from=categories.find(category=>category.id===source);
  const into=categories.find(category=>category.id===target);
  const item=from?.items.find(row=>row.id===id);
  if(!from||!into||!item||targetItem===id||targetItem&&!into.items.some(row=>row.id===targetItem))return categories;
  return categories.map(category=>{
    if(category.id!==source&&category.id!==target)return category;
    const items=category.items.filter(row=>row.id!==id);
    if(category.id===target){
      const index=targetItem?items.findIndex(row=>row.id===targetItem):items.length;
      items.splice(index,0,item);
    }
    return {...category,items};
  });
}

type StoredLesson=LessonRecord&{lastRequest:{id:string;signature:string}};
export function writeLesson(current:StoredLesson|undefined,id:string,request:LessonWrite,actor:string,now:string,logo:string):
  {record:StoredLesson;changed:boolean}|{error:string;status:409|422}{
  const signature=JSON.stringify(request);
  if(current?.lastRequest.id===request.requestId){
    return current.lastRequest.signature===signature
      ?{record:current,changed:false}
      :{error:'Identitas permintaan sudah digunakan untuk isi yang berbeda.',status:409};
  }
  if(current?.status==='FINAL')return {error:'Dokumen final terkunci.',status:409};
  if((current?.version??0)!==request.expectedVersion)return {error:'Versi dokumen telah berubah. Periksa versi terbaru sebelum menyimpan.',status:409};
  const errors=request.status==='FINAL'?lessonFinalErrors(request.data):[];
  if(errors.length)return {error:errors.join(' '),status:422};
  return {changed:true,record:{
    id,data:request.data,status:request.status,version:request.expectedVersion+1,
    templateVersion:lessonTemplate,formCode:lessonCode,logo:current?.logo??logo,
    createdAt:current?.createdAt??now,createdBy:current?.createdBy??actor,updatedAt:now,updatedBy:actor,
    finalizedAt:request.status==='FINAL'?now:null,finalizedBy:request.status==='FINAL'?actor:null,
    lastRequest:{id:request.requestId,signature},
  }};
}

export function publicLesson({lastRequest:_,...record}:StoredLesson):LessonRecord{return record}
