import { ArrowRight, List } from 'lucide-react';
import type { ProposalPrompt } from '../../../packages/shared/assistant-knowledge';
import type { WorkspaceMenu } from '../../../packages/shared/workspace-admin';
import { momSamplePrompt } from '../../../packages/shared/mom-sample';

export type PromptOption=ProposalPrompt & {attachment?:boolean;edit?:boolean;menu?:WorkspaceMenu};

export function AssistantPrompts({menus,projectId,proposals,open,setOpen,disabled,select}:{
  menus?:WorkspaceMenu[];projectId?:string;proposals:ProposalPrompt[];open:boolean;setOpen:(open:boolean)=>void;
  disabled:boolean;select:(option:PromptOption)=>void;
}){
  const groups:{label:string;options:PromptOption[]}[]=[
    {label:'Proyek dan rapat',options:[
      {label:'Hitung proyek',menu:'projects',prompt:'Berapa jumlah proyek?'},
      {label:'Cari proyek',menu:'projects',prompt:'cari proyek: '+(projectId||'Portal'),edit:true},
      {label:'Lihat status proyek',menu:'projects',prompt:'Apa status proyek '+(projectId||'P001')+'?',edit:true},
      {label:'Ringkas rapat terbaru',menu:'meetings',prompt:'Ringkas rapat terbaru'},
    ]},
    {label:'Dokumen dan lampiran',options:[
      {label:'Ekspor proyek ke Excel',menu:'projects',prompt:'Ekspor proyek'},
      {label:'Ekspor laporan per minggu',menu:'operations',prompt:'Ekspor laporan '+(projectId||'P001')+' untuk minggu ke 3',edit:true},
      {label:'Ringkas pendapatan infrastruktur',menu:'projects',prompt:'Buat summary revenue semua proyek infra dalam PDF'},
      {label:'Buat contoh MOM',menu:'mom',prompt:momSamplePrompt},
      {label:'Ringkas lampiran',prompt:'Ringkas lampiran',attachment:true},
      {label:'Tanya isi lampiran',prompt:'Apa keputusan dan tindak lanjut dalam lampiran?',attachment:true,edit:true},
    ]},
  ];
  if(proposals.length)groups.push({label:'Usulan perubahan',options:proposals.map(option=>({...option,edit:true}))});
  const available=groups.map(group=>({...group,options:group.options.filter(option=>!menus||!option.menu||menus.includes(option.menu))})).filter(group=>group.options.length);
  return <details className="assistant-prompt-menu" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><List size={16}/> Contoh prompt</summary>
    {available.map(group=><section key={group.label} className="assistant-prompt-group">
      <h3>{group.label}</h3>
      <div className="assistant-prompt-grid">
        {group.options.map(option=><button type="button" className="assistant-prompt" key={option.label}
          title={option.prompt} disabled={disabled} onClick={()=>select(option)}>
          <span><strong>{option.label}</strong><small>{option.label==='Buat contoh MOM'?'Notulen fiktif dalam Word':option.prompt}</small></span>
          <ArrowRight size={14} aria-hidden="true"/>
        </button>)}
      </div>
    </section>)}
  </details>;
}
