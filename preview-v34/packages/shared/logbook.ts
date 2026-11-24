import { z } from 'zod';

const projectIdSchema=z.string().regex(/^P[0-9]+$/);
const weekSchema=z.number().int().min(0).max(600);
const scopeSchema=z.object({projectId:projectIdSchema,week:weekSchema});

export const logbookLimit=200;
export const logFileLimit=3;
export const logFileBytes=2*1024*1024;
export const logWeekFileBytes=16*1024*1024;
export const logFileSchema=z.object({
  id:z.string().uuid(),
  name:z.string().min(1).max(180).refine(value=>!/[\/\\\u0000-\u001f]/.test(value)),
  data:z.string().min(4).max(Math.ceil(logFileBytes/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine(value=>value.length%4===0&&base64Bytes(value)<=logFileBytes),
});
export const base64Bytes=(value:string)=>value.length*3/4-(value.endsWith('==')?2:value.endsWith('=')?1:0);
export type LogFile=z.infer<typeof logFileSchema>;
export const logbookEntrySchema=z.object({
  id:z.string().uuid(),
  date:z.string().date(),
  activity:z.string().trim().min(1).max(240),
  owner:z.string().trim().max(120),
  result:z.string().trim().max(2000),
  files:z.array(logFileSchema).max(logFileLimit).refine(files=>new Set(files.map(file=>file.id)).size===files.length).optional(),
});
export const logbookSchema=scopeSchema.extend({
  entries:z.array(logbookEntrySchema).max(logbookLimit)
    .refine(entries=>new Set(entries.map(entry=>entry.id)).size===entries.length)
    .refine(entries=>entries.reduce((n,entry)=>n+(entry.files??[]).reduce((sum,file)=>sum+base64Bytes(file.data),0),0)<=logWeekFileBytes),
});

export const logbookId=(projectId:string,week:number)=>'logbook-'+projectId+'-W'+week;
export function logbookScope(id:string) {
  const match=/^logbook-(P[0-9]+)-W(0|[1-9][0-9]*)$/.exec(id);
  if(!match)return;
  const result=scopeSchema.safeParse({projectId:match[1],week:Number(match[2])});
  if(result.success)return result.data;
}

export type LogbookEntry=z.infer<typeof logbookEntrySchema>;
export type Logbook=z.infer<typeof logbookSchema>;
export type SavedLogbook={id:string;version:number;updated:string;data:Logbook};
export const sortedLogbook=(rows:LogbookEntry[])=>rows.slice().sort((a,b)=>b.date.localeCompare(a.date));
