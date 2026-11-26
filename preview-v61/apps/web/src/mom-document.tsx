import { useDocumentLogo } from './document-branding';
import { defaultDocumentLogo } from './document-logo';
import { DownloadMenu } from './download-menu';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import type { MomData } from '../../../packages/shared/mom-sample';
import { downloadMomWord, momWordFileName } from './assistant-mom-word';
import { Outcome } from './mom-editors';
import { Button, dateLabel, ErrorBox } from './ui';

type Input=[key:string,label:string,type?:string];
type MomDocumentData=MomData & {logo?:string;photos?:string[];signatures?:Record<string,string>};

export const momSteps: {title:string;fields:Input[]}[] = [
  {title:'Identitas notulen',fields:[['division','Kode divisi'],['date','Tanggal rapat','date'],['numberMode','Penomoran','select:Otomatis,Manual'],['number','Nomor notulen'],['purpose','Tujuan rapat','textarea']]},
  {title:'Waktu & media',fields:[['start','Waktu mulai','time'],['end','Waktu selesai','time'],['location','Lokasi luring'],['online','Tautan daring','url']]},
  {title:'Peserta',fields:[['internal','Pihak internal'],['customer','Pihak pelanggan'],['attendees','Peserta, satu nama per baris','textarea']]},
  {title:'Lampiran foto',fields:[['columns','Foto per baris','select:1,2,3']]},
  {title:'Hasil rapat',fields:[['previous','Hasil sebelumnya','textarea'],['result','Hasil rapat saat ini','textarea']]},
  {title:'Tindak lanjut',fields:[]},
  {title:'Catatan revisi',fields:[['revisionDate','Batas pengajuan','date'],['revisionMode','Teks standar','select:Tampilkan,Sembunyikan'],['revisionNote','Catatan khusus','textarea']]},
  {title:'Penutup & tanda tangan',fields:[['closing','Kalimat penutup','textarea'],['place','Kota'],['signDate','Tanggal penutup','date'],['writer','Notulis'],['writerTitle','Jabatan notulis'],['manager','Penyetuju internal'],['managerTitle','Jabatan penyetuju']]},
  {title:'Persetujuan pelanggan',fields:[['approval','Blok persetujuan','select:Tampilkan,Sembunyikan'],['approvalLabel','Label persetujuan'],['company','Nama perusahaan pelanggan'],['approver1','Penyetuju pelanggan 1'],['approver2','Penyetuju pelanggan 2']]},
  {title:'Kop & footer',fields:[['letterhead','Nama perusahaan'],['address','Alamat','textarea'],['contact','Kontak']]},
];

function momNumber(fields:Record<string,string>){
  const {date,division,numberMode,number}=fields;
  if(numberMode==='Manual')return number||'';
  return date&&division?'NTLN/'+date.slice(8)+date.slice(5,7)+date.slice(2,4)+'/'+division.toUpperCase()+'/'+date.slice(0,4):'';
}

export function MomDocumentContents({data}:{data:MomDocumentData}){
  const f=data.fields;
  const photos=data.photos??[];
  const number=momNumber(f);
  return <>
    <header className="document-letterhead">
      <img className="paper-logo" src={data.logo||defaultDocumentLogo} alt="Logo dokumen"/>
      {f.letterhead&&<p>{f.letterhead}</p>}
      <h2>Notulen Rapat</h2>
      {number&&<p className="document-number">{number}</p>}
    </header>
    {momSteps.map((group,index)=>{
      const populated=group.fields.filter(([key])=>!['numberMode','number','columns','letterhead','address','contact','approval','revisionMode'].includes(key)&&f[key]);
      if(index===3&&!photos.length||index===5&&!data.followups.length||index===8&&f.approval!=='Tampilkan'||!populated.length&&![3,5].includes(index))return null;
      return <section key={group.title} className="paper-section">
        <h3>{group.title}</h3>
        {populated.map(([key,label,type])=>key==='attendees'?<ul className="mom-attendee-list" key={key}>{f[key].split('\n').map((name,i)=>name.trim()&&<li key={i}>{name.trim()}</li>)}</ul>:
          index===4?<div className="mom-result" key={key}><h4>{label}</h4><Outcome value={f[key]}/></div>:
          <p className="pre-wrap" key={key}><strong>{label}</strong> · {type==='date'?dateLabel(f[key]):f[key]}</p>)}
        {index===3&&<div className="paper-photos" style={{gridTemplateColumns:'repeat('+Number(f.columns||2)+',1fr)'}}>{photos.map((src,i)=><img src={src} alt={'Foto rapat '+(i+1)} key={i}/>)}</div>}
        {index===5&&<table className="space-top">
          <thead><tr><th>Pihak</th><th>Uraian</th><th>PIC</th><th>Tenggat</th></tr></thead>
          <tbody>{data.followups.map(row=><tr key={row.id}><td>{row.side}</td><td>{row.note}</td><td>{row.pic}</td><td>{row.due}</td></tr>)}</tbody>
        </table>}
        {index===7&&<SignaturePreview keys={['writer','manager']} data={data}/>}
        {index===8&&<SignaturePreview keys={['approver1','approver2']} data={data}/>}
      </section>;
    })}
    {[f.address,f.contact].some(Boolean)&&<footer className="paper-footer">{[f.address,f.contact].filter(Boolean).join(' · ')}</footer>}
  </>;
}

function SignaturePreview({keys,data}: {keys:string[];data:MomDocumentData}) {
  return <div className="signature-preview">{keys.filter(key=>data.fields[key]||data.signatures?.[key]).map(key=><div key={key}>{data.signatures?.[key]&&<img src={data.signatures[key]} alt="Tanda tangan"/>}<p>{data.fields[key]}</p></div>)}</div>;
}

export function AssistantMomFile({mom}:{mom:MomData}){
  const logo=useDocumentLogo();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function download(){
    setBusy(true);setError('');
    try{await downloadMomWord(mom,logo)}
    catch(error){setError('Unduhan gagal. '+(error as Error).message)}
    finally{setBusy(false)}
  }
  return <div className="assistant-mom-file">
    <div className="assistant-mom-file-title"><FileText size={16}/> <strong>{momWordFileName}</strong></div>
    <DownloadMenu available={['Word']} busy={busy} download={()=>void download()}/>
    {error&&<ErrorBox message={error}/>}
  </div>;
}
