import { meetingReadiness, previousCondition, type Meeting } from './domain';

export const memoSections = [
  ['summary', 'Ringkasan eksekutif'],
  ['decisions', 'Keputusan'],
  ['risks', 'Risiko dan eskalasi'],
] as const;

type MemoNote = {projectId:string;text:string};
type MemoAction = {ref:string;projectId:string;text:string;pic:string;due:string;status:string};

export type ExecutiveMemo = {
  meetingId:string;
  sourceVersion:number;
  generatedAt:string;
  mode:'prototype';
  coverage:{reviewed:number;total:number;updated:number;unchanged:number;source:number};
  summary:MemoNote[];
  decisions:MemoNote[];
  risks:MemoNote[];
  actions:MemoAction[];
};

function excerpt(text:string){
  const singleLine=text.trim().replace(/\s+/g,' ');
  if(singleLine.length<=540)return singleLine;
  const words=singleLine.slice(0,541);
  const boundary=words.lastIndexOf(' ');
  return words.slice(0,boundary>400?boundary:540)+'…';
}

const decisionLine=/^(?:keputusan\b|diputuskan\b|disepakati\b)/i;
const riskLine=/^(?:risiko|kendala|hambatan|eskalasi)\s*:/i;
const listPrefix=/^\s*(?:(?:[-•*]|\d+[.)])\s+)?/;

export function createPrototypeMemo(meeting:Meeting,generatedAt:string):ExecutiveMemo {
  const {reviewed,total,updated,unchanged,source}=meetingReadiness(meeting);
  const memo:ExecutiveMemo={
    meetingId:meeting.id,sourceVersion:meeting.version,generatedAt,mode:'prototype',
    coverage:{reviewed,total,updated,unchanged,source},summary:[],decisions:[],risks:[],actions:[],
  };

  for(const project of meeting.projects){
    const {id,review}=project;
    const health=review.status==='none'?previousCondition(project):review.health;
    const isCurrent=review.status==='updated';
    const archived=review.status==='source'?review.sourceText?.trim()??'':'';
    const currentNotes=isCurrent?[review.summary,...review.items.map(item=>item.text)]:[archived];
    const lines=currentNotes.flatMap(text=>text.split(/\r?\n/)).map(line=>line.replace(listPrefix,'').trim()).filter(Boolean);
    const decisions=lines.filter(line=>decisionLine.test(line));
    const risks=lines.filter(line=>riskLine.test(line));
    if(isCurrent)risks.push(...review.items.filter(item=>item.category==='Kendala / Risiko').map(item=>item.text));
    if(health==='Critical'||health==='Needs Attention')risks.unshift('Kondisi proyek · '+health);
    const projectSummary=review.status==='none'?'Tidak ada perubahan dari rapat referensi.':
      lines.find(line=>!decisionLine.test(line)&&!riskLine.test(line))??lines[0];
    const overview=[health==='Belum dinilai'?'':health,projectSummary].filter(Boolean).join(' · ');
    if(overview)memo.summary.push({projectId:id,text:excerpt(overview)});

    for(const [notes,destination] of [[decisions,memo.decisions],[risks,memo.risks]] as const){
      const snippets=new Set(notes.map(excerpt).filter(Boolean));
      for(const text of snippets)destination.push({projectId:id,text});
    }
    review.actions.forEach((action,index)=>{
      if(action.text.trim()&&action.status!=='Selesai')memo.actions.push({
        ref:id+'-action-'+(index+1),projectId:id,text:action.text.trim(),pic:action.pic,due:action.due,status:action.status,
      });
    });
  }
  return memo;
}
