import { z } from 'zod';
import { meetingReadiness, projectMetrics, reviewText, type Meeting, type Project } from './domain';

const attachmentSchema=z.object({name:z.string().trim().min(1).max(180),text:z.string().trim().min(1).max(32000)});
export const assistantQuestionSchema=z.object({message:z.string().trim().min(1).max(2000),attachments:z.array(attachmentSchema).max(3).default([])});
export type AssistantAttachment=z.infer<typeof attachmentSchema>;
export type ProposalPrompt={label:string;prompt:string};
export type AssistantStatus={gateway:boolean;proposalPrompts:ProposalPrompt[]};

type Reference={title:string;text:string;projectId?:string;attachment?:boolean};
const ignored=new Set(['yang','dari','untuk','pada','dengan','tentang','sebutkan','jelaskan','bagaimana','apakah','tolong','saya','kami','apa','mana','ini','itu','ada','status','proyek','rapat','bisa','mohon','ringkas','ringkasan','rangkuman','rangkumnya','dokumen','file','lampiran','hasil','berikan','saat','dalam','perlu','akan','sudah','belum','lebih']);
function words(value:string){return value.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]}
function relevantWords(value:string){return [...new Set(words(value).filter(word=>word.length>2&&!ignored.has(word)))]}
function excerpts(text:string){
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/u).flatMap(line=>{
    const value=line.trim().replace(/\s+/g,' ');
    if(!value)return [];
    const chunks=[];
    let rest=value;
    while(rest.length>420){
      const split=rest.lastIndexOf(' ',420);
      const end=split>200?split:420;
      chunks.push(rest.slice(0,end).trim());
      rest=rest.slice(end).trim();
    }
    if(rest)chunks.push(rest);
    return chunks;
  });
}

export function referenceAnswer(message:string,attachments:AssistantAttachment[],projects:Project[],meetings:Meeting[]){
  const query=relevantWords(message);
  const askingSummary=/ringkas|rangkuman|ikhtisar|poin utama/i.test(message);
  const usingAttachments=attachments.length>0;
  if(!usingAttachments&&/^ringkas rapat terbaru[.!?]?$/i.test(message)){
    const meeting=meetings.reduce<Meeting|undefined>((latest,row)=>!latest||row.date>latest.date?row:latest,undefined);
    if(!meeting)return {text:'Belum ada rapat yang tersedia untuk diringkas.',references:[]};
    const title=meeting.title+' · '+meeting.date;
    const counts=meetingReadiness(meeting);
    const facts=[
      title+' · '+(meeting.status==='final'?'Final':'Draf'),
      counts.reviewed+' dari '+counts.total+' proyek sudah ditinjau. '+counts.updated+' memiliki pembaruan.',
      ...(meeting.moderator?['Moderator · '+meeting.moderator]:[]),
    ];
    const notes=[
      ...excerpts(meeting.notes||''),
      ...meeting.projects.flatMap(project=>{
        if(!['updated','source'].includes(project.review.status))return [];
        const [first]=excerpts(reviewText(project.review,project.previousText));
        return first?[project.detail.name+' · '+first]:[];
      }),
    ].slice(0,4);
    return {text:[...facts,...notes.map(note=>'• '+note)].join('\n'),references:[title]};
  }
  if(!usingAttachments&&/\b(berapa|jumlah|total)\b/i.test(message)&&/\bproyek\b/i.test(message)){
    const active=projects.filter(project=>projectMetrics(project).status==='Aktif').length;
    const closed=projects.length-active;
    return {text:'Ada '+projects.length+' proyek dalam portofolio. '+active+' aktif dan '+closed+' selesai.',references:['Daftar Proyek'],projects:[]};
  }
  const documents:Reference[]=attachments.map(item=>({title:item.name,text:item.text,attachment:true}));
  if(!usingAttachments){
    for(const project of projects){
      const {detail}=project;
      documents.push({
        title:project.id+' · '+detail.name,projectId:project.id,
        text:[detail.name+' untuk '+detail.customer+'. Status kontrak: '+projectMetrics(project).status+'.',detail.pm?'Project Manager: '+detail.pm:'',detail.period?'Periode: '+detail.period:'',detail.notes,project.latestText].filter(Boolean).join('\n'),
      });
    }
    for(const meeting of meetings){
      const title=meeting.title+' · '+meeting.date;
      documents.push({title,text:[meeting.title+' tanggal '+meeting.date,meeting.moderator?'Moderator: '+meeting.moderator:'',meeting.notes].filter(Boolean).join('\n')});
      for(const p of meeting.projects){
        const review=reviewText(p.review,p.previousText);
        if(review)documents.push({title:title+' · '+p.detail.name,projectId:p.id,text:review});
      }
    }
  }
  if(!query.length&&!(askingSummary&&usingAttachments))return null;
  const scored=documents.flatMap(doc=>{
    const titleWords=new Set(words(doc.title));
    const titleScore=query.filter(word=>titleWords.has(word)).length;
    return excerpts(doc.text).map((quote,position)=>{
      const candidates=new Set(words(quote));
      const matched=query.filter(word=>candidates.has(word)).length;
      if(!matched&&!titleScore&&!(askingSummary&&doc.attachment))return null;
      return {doc,quote,rank:matched*5+titleScore*2-position*.06};
    }).filter((item):item is NonNullable<typeof item>=>Boolean(item));
  }).sort((a,b)=>b.rank-a.rank);
  const seen=new Set<string>();
  const strongest=scored.filter(item=>{
    const key=item.quote.toLowerCase();
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,5);
  if(!strongest.length)return usingAttachments?{text:'Tidak ditemukan bagian lampiran yang cocok dengan pertanyaan.',references:[],projects:[]}:null;
  const titles=[...new Set(strongest.map(item=>item.doc.title))];
  return {
    text:(askingSummary?'Poin dari sumber yang tersedia':'Bagian sumber yang relevan dengan pertanyaan')+'\n'+strongest.map(item=>'• '+item.quote+' ['+(titles.indexOf(item.doc.title)+1)+']').join('\n'),
    references:titles,
    projects:[...new Set(strongest.map(item=>item.doc.projectId).filter((id):id is string=>Boolean(id)))],
  };
}
