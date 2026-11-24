import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Download, FilePlus2, FileText, FolderOpen, ImagePlus, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { resolvePillar, type ProjectRow } from '../../../packages/shared/domain';
import type { MomFollowup as Follow } from '../../../packages/shared/mom-sample';
import { api, ButtonConfirm, dateLabel, Dialog, Empty, ErrorBox, Heading, Pill, type User } from './ui';
import { AttendeeFields, OutcomeField } from './mom-editors';
import { MomDocumentContents, momSteps as steps } from './mom-document';
import { LoadingArea, useLoadingList } from './loading-list';
import { DocumentExport } from './document-export';
import { WeeklyReportDocument, WeeklyReportPreview, type Metrics } from './weekly-report';
import { useWeeklyLogbook, WeeklyLogbook } from './weekly-logbook';

type Kind = 'assignment'|'risk'|'mom';
type Risk = { id:string; description:string; impacts:string[]; severity:string; probability:string; response:string };
type DocData = {
  fields:Record<string,string>; projectId:string; logo:string; photos:string[]; signatures:Record<string,string>;
  risks:Risk[]; followups:Follow[];
};
type Saved<T> = {id:string;updated:string;version:number;data:T};
type Input = [key:string,label:string,type?:string];

const settings: Record<Kind,{title:string; description:string; docTitle:string; add:string}> = {
  assignment:{title:'Penunjukan PM',description:'Siapkan dan terbitkan surat penunjukan manajer proyek.',docTitle:'Surat Penunjukan Project Manager',add:'Penunjukan PM Baru'},
  risk:{title:'Daftar risiko',description:'Identifikasi risiko proyek dan tetapkan rencana respons.',docTitle:'Manajemen Risiko – Penilaian Risiko',add:'Daftar risiko baru'},
  mom:{title:'Notulen (MOM)',description:'Susun notulen rapat dengan lampiran, tindak lanjut, dan persetujuan.',docTitle:'Notulen Rapat',add:'Notulen baru'},
};
const today=()=>new Date().toISOString().slice(0,10);
const levels=['Rendah','Sedang','Tinggi'];
const riskTone=(level:string)=>level==='Tinggi'?'red':level==='Sedang'?'amber':'green';
const impacts=['Lingkup','Waktu','Biaya','Budget'];
const assignmentFields:Input[] = [['projectName','Nama proyek'],['projectNo','Nomor proyek'],['customer','Pelanggan'],['classification','Klasifikasi','select:Small,Sedang,Big'],['pm','Nama manajer proyek'],['pmTitle','Jabatan PM'],['pmUnit','Unit PM'],['signer','Nama penanda tangan'],['signerTitle','Jabatan penanda tangan'],['signerUnit','Unit penanda tangan'],['numberMode','Penomoran','select:Otomatis,Manual'],['number','Nomor surat'],['place','Tempat'],['date','Tanggal surat','date']];
const riskHeaderFields:Input[]=[['projectName','Nama proyek'],['author','Disusun oleh'],['date','Tanggal','date']];
function plusWorkingDays(value:string) {
  const date=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(date.getTime()))return '';
  for(let count=0;count<2;){
    date.setUTCDate(date.getUTCDate()+1);
    if(date.getUTCDay()>0&&date.getUTCDay()<6) count++;
  }
  return date.toISOString().slice(0,10);
}

function initial(kind:Kind, user:User):DocData {
  const defaults:Record<Kind,Record<string,string>>={
    assignment:{signer:'Budi Hariyanto',signerTitle:'Manager',signerUnit:'PMO',numberMode:'Otomatis',place:'Jakarta'},
    risk:{author:user.name},
    mom:{division:'PMO',numberMode:'Otomatis',columns:'2',revisionMode:'Tampilkan',revisionDate:plusWorkingDays(today()),writer:user.name,managerTitle:'Manager PMO',place:'Jakarta',signDate:today(),approval:'Sembunyikan',approvalLabel:'Persetujuan pelanggan',letterhead:'PT Swadharma Duta Data',closing:'Demikian notulen ini dibuat sebagai catatan dan tindak lanjut rapat.'},
  };
  return {fields:{date:today(),...defaults[kind]},projectId:'',logo:'',photos:[],signatures:{},risks:[],followups:[]};
}
const emptyRisk=():Risk=>({id:'',description:'',impacts:[],severity:'Sedang',probability:'Sedang',response:''});
const sampleRisks=[
  ['Kebutuhan berubah setelah persetujuan ruang lingkup','Lingkup','Tinggi','Sedang','Gunakan proses persetujuan perubahan.'],
  ['Akses ke lingkungan pengujian terlambat','Waktu','Sedang','Tinggi','Ajukan akses lebih awal dan eskalasi hambatan.'],
  ['Ketergantungan pada satu tenaga ahli','Waktu','Tinggi','Sedang','Siapkan pengganti dan dokumentasi teknis.'],
  ['Perkiraan biaya implementasi meleset','Budget','Sedang','Sedang','Tinjau proyeksi biaya mingguan.'],
  ['Keterlambatan material dari vendor','Waktu','Tinggi','Sedang','Pantau pesanan dan siapkan pemasok cadangan.'],
  ['Data sumber tidak lengkap','Lingkup','Sedang','Tinggi','Validasi kelengkapan sebelum migrasi.'],
  ['Pengerjaan ulang hasil UAT','Biaya','Sedang','Sedang','Sepakati skenario uji sejak awal.'],
  ['Jadwal pengguna bentrok dengan UAT','Waktu','Rendah','Sedang','Konfirmasi agenda sebelum undangan.'],
  ['Spesifikasi perangkat tidak sesuai','Lingkup','Tinggi','Rendah','Verifikasi daftar perangkat sebelum pembelian.'],
  ['Tambahan kebutuhan lisensi','Budget','Sedang','Rendah','Tinjau lisensi pada awal desain.'],
];
const id=()=>crypto.randomUUID();

async function imageData(file:File,max=1200) {
  if(!/^image\/(png|jpe?g|webp)$/.test(file.type)||file.size>5*1024*1024) throw new Error('Pilih gambar PNG, JPG, atau WebP hingga 5 MB.');
  const image=await createImageBitmap(file);
  const scale=Math.min(1,max/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  return canvas.toDataURL('image/webp',.82);
}

export function Documents({kind,projects,user,notify}: {kind:Kind;projects:ProjectRow[];user:User;notify:(message:string)=>void}) {
  const info=settings[kind];
  const endpoint='/documents/'+kind;
  const [draft,setDraft]=useState(()=>initial(kind,user));
  const [documentId,setDocumentId]=useState<string>(id);
  const [version,setVersion]=useState(0);
  const {items:list,setItems:setList,loading:listLoading,error:listError,retry:retryList}=useLoadingList<Saved<DocData>>(endpoint);
  const [history,setHistory]=useState(false);
  const [publish,setPublish]=useState(false);
  const [remove,setRemove]=useState<Saved<DocData>|null>(null);
  const [error,setError]=useState('');
  const [state,setState]=useState('');
  const [dirty,setDirty]=useState(false);
  const [step,setStep]=useState(0);
  const [momView,setMomView]=useState<'edit'|'preview'>('edit');
  const [risk,setRisk]=useState<Risk>(emptyRisk);
  const [preview,setPreview]=useState(false);
  const [zoom,setZoom]=useState('100');
  const paper=useRef<HTMLElement>(null);
  const active=useRef(false);
  const revision=useRef(0);
  const roleCanEdit=kind==='assignment'?['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO'].includes(user.role):kind==='risk'?['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','PM'].includes(user.role):user.role!=='VIEWER';
  const canEdit=roleCanEdit&&draft.fields.issued!=='true';
  const available=kind==='risk'&&user.role==='PM'?projects.filter(p=>p.detail.pm.trim().toLowerCase()===user.name.trim().toLowerCase()):projects;
  const f=draft.fields;
  const required=kind==='assignment'?[['pm','PM'],['projectName','proyek'],['customer','pelanggan'],['classification','klasifikasi'],...(f.numberMode==='Manual'?[['number','nomor surat']]:[])]:kind==='risk'?[['projectName','nama proyek']]:[['purpose','tujuan rapat'],['date','tanggal']];
  const missing=required.filter(([key])=>!f[key]?.trim()).map(([,label])=>label);

  function change(data:Partial<DocData>){revision.current++;setDraft(current=>({...current,...data}));setDirty(true);setState('Perubahan belum disimpan');setError('')}
  function fieldChange(key:string,value:string){
    change({fields:{...f,[key]:value,...(kind==='mom'&&key==='date'?{revisionDate:plusWorkingDays(value)}:{})}});
  }
  function selectProject(key:string){
    const p=projects.find(p=>p.id===key);
    change({projectId:key,fields:{...f,...(p?{projectName:p.detail.name,projectNo:p.id,customer:p.detail.customer,pm:p.detail.pm}:{})}});
  }
  async function persist(publish=false){
    if(!canEdit||active.current||(!dirty&&!publish&&version>0))return !dirty;
    if(publish&&missing.length){setError('Lengkapi '+missing.join(', ')+'.');return}
    active.current=true;setState('Menyimpan…');setError('');
    const at=revision.current;
    try{
      const saved=await api<Saved<DocData>>(endpoint+'/'+documentId,'PUT',{version,data:draft,publish});
      setVersion(saved.version);setList(rows=>[saved,...rows.filter(row=>row.id!==saved.id)]);
      if(at===revision.current){setDraft(saved.data);setDirty(false);setState('Tersimpan')}else setState('Perubahan belum disimpan');
      if(publish)notify('Surat diterbitkan.');
      return at===revision.current;
    }catch(e){setError((e as Error).message);setState('Gagal menyimpan');return false}finally{active.current=false}
  }
  useEffect(()=>{
    if(publish||!canEdit||!dirty||state==='Gagal menyimpan'||state==='Menyimpan…'||(kind==='risk'&&user.role==='PM'&&!draft.projectId))return;
    const timer=setTimeout(()=>void persist(),1500);
    return ()=>clearTimeout(timer);
  },[draft,dirty,state,publish]);
  async function load(saved?:Saved<DocData>){
    if(active.current)return;
    if(dirty&&!await persist())return;
    if(saved?.id===documentId){setHistory(false);return}
    setDraft(saved?.data??initial(kind,user));setDocumentId(saved?.id??id());setVersion(saved?.version??0);setDirty(false);
    setState(saved?'Tersimpan':'');setStep(0);setMomView('edit');setRisk(emptyRisk());setError('');setHistory(false);
    if(!saved&&kind==='assignment'){notify('Draf penunjukan baru siap diisi.');requestAnimationFrame(()=>document.getElementById('assignment-project')?.focus())}
  }
  async function deleteDoc(doc:Saved<DocData>){
    setRemove(null);
    try{await api(endpoint+'/'+doc.id,'DELETE');setList(rows=>rows.filter(row=>row.id!==doc.id));if(documentId===doc.id){setDirty(false);setDraft(initial(kind,user));setDocumentId(id());setVersion(0);setState('')}notify('Dokumen dihapus.')}
    catch(e){setError((e as Error).message)}
  }
  async function logoChange(e:ChangeEvent<HTMLInputElement>){
    if(!e.target.files?.[0])return;
    try{change({logo:await imageData(e.target.files[0],700)})}catch(e){setError((e as Error).message)}
  }
  async function photosChange(files:FileList|File[]) {
    if(!files.length)return;
    try{if(files.length+draft.photos.length>10)throw new Error('Maksimal 10 foto per notulen.');change({photos:[...draft.photos,...await Promise.all(Array.from(files).map(file=>imageData(file)))]})}catch(e){setError((e as Error).message)}
  }
  function addRisk(){
    if(!risk.description.trim()){setError('Isi identifikasi risiko.');return}
    change({risks:risk.id?draft.risks.map(r=>r.id===risk.id?risk:r):[...draft.risks,{...risk,id:id()}]});setRisk(emptyRisk());
  }
  function moveRisk(index:number,next:number){
    const rows=[...draft.risks];
    [rows[index],rows[next]]=[rows[next],rows[index]];change({risks:rows});
  }
  function sample(){
    if(kind==='risk') change({risks:sampleRisks.map(([description,impact,severity,probability,response])=>({id:id(),description,impacts:[impact],severity,probability,response}))});
    if(kind==='mom'){change({fields:{...f,purpose:'Tinjauan progres proyek mingguan',internal:'Tim PMO SDD',location:'Ruang rapat PMO',start:'09:00',end:'10:00',attendees:'Naya Fiktif\nRani Fiktif',result:'# Status minggu ini\n> Pembahasan\n- Tim meninjau progres implementasi.\n\n> Keputusan\n1. Periksa kendala yang masih terbuka.\n2. Konfirmasi target minggu depan.'}});}
  }
  const editorFields = kind==='assignment'?assignmentFields:kind==='risk'?riskHeaderFields:steps[step].fields;
  const editableFields=editorFields.filter(([key])=>(key!=='number'||f.numberMode==='Manual')&&!(kind==='mom'&&['attendees','previous','result'].includes(key)));
  const riskRows=[['No','Identifikasi','Dampak','Keparahan','Probabilitas','Respons'],...draft.risks.map((r,i)=>[String(i+1),r.description,r.impacts.join(', '),r.severity,r.probability,r.response])];
  const fileName=kind==='assignment'?'Penunjukan-PM-'+(f.projectNo||f.date||'Draf')
    :kind==='risk'?'Daftar-Risiko-'+(draft.projectId||f.date||'Draf'):'Notulen-'+(f.date||'Draf');
  return <div className="print-scope"><div className="no-print"><Heading title={info.title} description={info.description} actions={<><button className="button" onClick={()=>setHistory(true)}><FolderOpen size={16}/> Tersimpan{!listLoading&&!listError&&' ('+list.length+')'}</button>{roleCanEdit&&<button className="button" onClick={()=>load()}><FilePlus2 size={16}/> {info.add}</button>}{canEdit&&<button className={kind==='mom'?'button primary':'button'} disabled={state==='Menyimpan…'||(!dirty&&version>0)} onClick={()=>persist()}><Save size={16}/> Simpan draf</button>}{canEdit&&kind==='assignment'&&<button className="button primary" disabled={state==='Menyimpan…'||Boolean(missing.length)} onClick={()=>setPublish(true)}>Terbitkan surat</button>}</>}/></div>
  {error&&<ErrorBox message={error}/>}
  <div className="document-top no-print"><div className="heading-actions">{kind!=='assignment'&&canEdit&&<button className="button" onClick={sample}>Isi data contoh</button>}{kind==='risk'&&<button className="button" onClick={()=>setPreview(!preview)}>{preview?'Kelola daftar':'Pratinjau dokumen'}</button>}<DocumentExport paper={paper} name={fileName} formats={kind==='mom'?['Word','PDF']:undefined} onError={setError}/>{kind==='assignment'&&<button className="button" onClick={()=>window.print()}><Printer size={15}/> Cetak</button>}</div><small className="muted" role="status">{state}</small></div>
  {!canEdit&&!version&&<p className="source-note">Buka dokumen yang tersimpan untuk meninjaunya.</p>}
  {kind==='mom'&&<div className="mom-view-switch no-print" aria-label="Tampilan notulen">
    <button type="button" aria-pressed={momView==='edit'} onClick={()=>setMomView('edit')}>Isi notulen</button>
    <button type="button" aria-pressed={momView==='preview'} onClick={()=>setMomView('preview')}>Pratinjau</button>
  </div>}
  <div className={'document-layout '+(kind==='mom'?'mom-layout mom-view-'+momView:'')+(kind==='risk'&&!preview?' manage-risk':'')}>
    {(kind!=='risk'||!preview)&&<section className="panel padded no-print document-editor">
      <h2>{kind==='mom'?'Isi notulen':kind==='risk'?'Kelola risiko':'Detail penunjukan'}</h2>
      {kind==='mom'&&<label className="field mom-section-picker">Bagian notulen
        <select value={step} onChange={event=>setStep(Number(event.target.value))}>
          {steps.map((item,i)=><option key={item.title} value={i}>{item.title}</option>)}
        </select>
      </label>}
      <fieldset disabled={!canEdit} className="field-grid clean-fieldset">
        {kind!=='mom'&&<label className="span-full">Pilih proyek<select id={kind==='assignment'?'assignment-project':undefined} value={draft.projectId} onChange={e=>selectProject(e.target.value)}><option value="">Isi proyek manual</option>{available.map(p=><option key={p.id} value={p.id}>{p.id} · {p.detail.name}</option>)}</select></label>}
        {editableFields.map(([key,label,type])=><label className={type==='textarea'||key==='projectName'?'span-full':''} key={key}>{label}{type==='textarea'?<textarea value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}/>:type?.startsWith('select:')?<select value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}><option value="">Pilih</option>{type.slice(7).split(',').map(value=><option key={value}>{value}</option>)}</select>:<input type={type||'text'} value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}/>}</label>)}
        {kind==='mom'&&step===2&&<AttendeeFields value={f.attendees||''} change={value=>fieldChange('attendees',value)}/>}
        {kind==='mom'&&step===4&&steps[4].fields.map(([key,label])=><OutcomeField key={key} label={label} value={f[key]||''} change={value=>fieldChange(key,value)}/>)}
        {(kind!=='mom'||step===9)&&<div className="span-full field"><label>Logo dokumen<input type="file" accept="image/png,image/jpeg,image/webp" onChange={logoChange}/></label>{draft.logo&&<button className="subtle-button" onClick={()=>change({logo:''})}>Gunakan logo SDD</button>}</div>}
        {kind==='risk'&&<><div className="span-full form-section"><h3>{risk.id?'Ubah risiko':'Tambah risiko'}</h3></div><label className="span-full">Identifikasi<textarea value={risk.description} onChange={e=>setRisk({...risk,description:e.target.value})}/></label><div className="span-full"><p>Dampak</p><div className="heading-actions">{impacts.map(value=><label className="check" key={value}><input type="checkbox" checked={risk.impacts.includes(value)} onChange={e=>setRisk({...risk,impacts:e.target.checked?[...risk.impacts,value]:risk.impacts.filter(item=>item!==value)})}/>{value}</label>)}</div></div>{(['severity','probability'] as const).map((key,i)=><label key={key}>{i?'Probabilitas':'Keparahan'}<select className={'risk-select risk-'+riskTone(risk[key])} value={risk[key]} onChange={e=>setRisk({...risk,[key]:e.target.value})}>{levels.map(value=><option key={value}>{value}</option>)}</select></label>)}<label className="span-full">Rencana respons<textarea value={risk.response} onChange={e=>setRisk({...risk,response:e.target.value})}/></label><div className="heading-actions span-full"><button className="button" onClick={()=>setRisk(emptyRisk())}>Bersihkan</button><button className="button primary" onClick={addRisk}><Plus size={16}/> {risk.id?'Simpan perubahan':'Tambah ke daftar'}</button></div></>}
        {kind==='mom'&&step===3&&<div className="span-full photo-drop" tabIndex={0} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(canEdit)void photosChange(e.dataTransfer.files)}} onPaste={e=>{if(canEdit)void photosChange(e.clipboardData.files)}}><Camera size={23}/><p>Pilih, tarik, atau tempel foto</p><input aria-label="Foto lampiran" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e=>e.target.files&&photosChange(e.target.files)}/>{draft.photos.length>0&&<button className="subtle-button" onClick={()=>change({photos:[]})}>Hapus semua foto ({draft.photos.length})</button>}</div>}
        {kind==='mom'&&step===5&&<div className="span-full fields">{draft.followups.map(item=>{
          const update=(key:keyof Follow,value:string)=>change({followups:draft.followups.map(r=>r.id===item.id?{...r,[key]:value}:r)});
          return <div className="row-editor fields" key={item.id}><label>Pihak<select value={item.side} onChange={e=>update('side',e.target.value)}><option>Internal</option><option>Pelanggan</option></select></label><label>Uraian<textarea value={item.note} onChange={e=>update('note',e.target.value)}/></label><label>PIC<input value={item.pic} onChange={e=>update('pic',e.target.value)}/></label><label>Tenggat<input type="date" value={item.due} onChange={e=>update('due',e.target.value)}/></label><button className="subtle-button" onClick={()=>change({followups:draft.followups.filter(v=>v.id!==item.id)})}><Trash2 size={14}/> Hapus</button></div>
        })}<button className="button" onClick={()=>change({followups:[...draft.followups,{id:id(),side:'Internal',note:'',pic:'',due:''}]})}><Plus size={15}/> Tambah tindak lanjut</button></div>}
        {kind==='mom'&&(step===7||step===8&&f.approval==='Tampilkan')&&<div className="span-full fields">{(step===7?[['writer','Notulis'],['manager','Penyetuju internal']]:[['approver1','Penyetuju pelanggan 1'],['approver2','Penyetuju pelanggan 2']]).map(([key,label])=><Signature key={key} label={label} value={draft.signatures[key]||''} change={signature=>change({signatures:{...draft.signatures,[key]:signature}})}/>)}</div>}
      </fieldset>
      {kind==='mom'&&<div className="split space-top"><button className="button" onClick={()=>setStep(step-1)} disabled={!step}><ArrowLeft size={15}/> Sebelumnya</button><button className="button primary" onClick={()=>setStep(step+1)} disabled={step===9}>Lanjut <ArrowRight size={15}/></button></div>}
    </section>}
    {kind==='risk'&&!preview&&<div className="no-print"><section className="panel padded"><h2>Peta risiko</h2><div className="risk-map"><div/><strong>Rendah</strong><strong>Sedang</strong><strong>Tinggi</strong>{[...levels].reverse().map((severity)=><div className="risk-map-row" key={severity}><strong>{severity}</strong>{levels.map((probability,i)=><div className={'risk-cell risk-'+(levels.indexOf(severity)+i)} key={probability}>{draft.risks.map((r,index)=>({r,index})).filter(({r})=>r.severity===severity&&r.probability===probability).map(({r,index})=><button key={r.id} onClick={()=>setRisk(r)} title={r.description}>{index+1}</button>)}</div>)}</div>)}</div><small className="muted">Keparahan per baris · probabilitas per kolom</small></section><section className="panel padded space-top"><h2>Risiko terdaftar ({draft.risks.length})</h2>{!draft.risks.length&&<Empty>Tambahkan risiko untuk memetakan dampak dan probabilitasnya.</Empty>}{draft.risks.length>0&&<div className="table-scroll"><table className="data-table risk-editor-table">
      <thead><tr>{['Risiko / respons','Keparahan','Probabilitas',...(canEdit?['Tindakan']:[])].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{draft.risks.map((item,i)=><tr key={item.id}>
        <td><strong>{i+1}. {item.description}</strong><small className="block muted">{item.response}</small></td>
        <td><Pill tone={riskTone(item.severity)}>{item.severity}</Pill></td><td><Pill tone={riskTone(item.probability)}>{item.probability}</Pill></td>
        {canEdit&&<td><div className="risk-actions"><button className="icon-button" disabled={i===0} aria-label={'Naikkan risiko '+(i+1)} onClick={()=>moveRisk(i,i-1)}><ArrowUp size={14}/></button><button className="icon-button" disabled={i===draft.risks.length-1} aria-label={'Turunkan risiko '+(i+1)} onClick={()=>moveRisk(i,i+1)}><ArrowDown size={14}/></button><button className="subtle-button" onClick={()=>setRisk(item)}>Edit</button><button className="icon-button" aria-label={'Hapus risiko '+(i+1)} onClick={()=>change({risks:draft.risks.filter(r=>r.id!==item.id)})}><Trash2 size={14}/></button></div></td>}
      </tr>)}</tbody>
    </table></div>}</section></div>}
    <section className={'paper-stage '+(kind==='mom'?'mom-paper-stage ':kind==='risk'&&!preview?'print-only':'')}><div className="document-tabs no-print">{kind==='mom'&&<strong>Pratinjau notulen</strong>}<Pill tone={missing.length?'amber':'green'}>{f.issued==='true'?'Telah diterbitkan':missing.length?'Kurang: '+missing.join(', '):'Lengkap'}</Pill>{kind==='risk'&&<select aria-label="Zoom dokumen" value={zoom} onChange={e=>setZoom(e.target.value)}>{['75','90','100','110'].map(x=><option value={x} key={x}>{x}%</option>)}</select>}</div>
      <article ref={paper} className={'paper '+kind+'-paper'} style={kind==='risk'?{zoom:Number(zoom)/100}:undefined}>
        {kind==='mom'?<MomDocumentContents data={draft}/>:<header className="document-letterhead">
          <img className="paper-logo" src={draft.logo||'/brand/sdd.png'} alt="Logo dokumen"/>
          {f.letterhead&&<p>{f.letterhead}</p>}
          <h2>{info.docTitle}</h2>
          {kind==='assignment'&&<p className="document-number">{f.number||'Otomatis saat diterbitkan'}</p>}
        </header>}
        {kind==='assignment'&&<>
          {f.issued!=='true'&&<span className="watermark">DRAF</span>}
          <section className="assignment-paper">
            <p>Yang bertanda tangan di bawah ini,</p>
            <dl className="paper-fields">{[['Nama',f.signer],['Jabatan',f.signerTitle],['Unit',f.signerUnit]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
            <p>Menunjuk <strong>{f.pm||'—'}</strong> sebagai Project Manager untuk proyek berikut.</p>
            <dl className="paper-fields">{[['Proyek',f.projectName],['Nomor proyek',f.projectNo],['Pelanggan',f.customer],['Klasifikasi',f.classification],['Jabatan PM',f.pmTitle],['Unit PM',f.pmUnit]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
            <div className="assignment-signature"><p>{f.place||'—'}, {dateLabel(f.date)}</p><p className="signature-space"><strong>{f.signer||'—'}</strong></p>{f.signerTitle&&<p>{f.signerTitle}</p>}</div>
          </section>
        </>}
        {kind==='risk'&&<><div className="risk-paper-meta"><p><strong>{f.projectName||'—'}</strong></p><p>{f.author||'—'} · {dateLabel(f.date)} · {draft.risks.length} risiko</p></div><PaperTable rows={riskRows} riskLevels/></>}
      </article>
    </section>
  </div>
  {history&&<Dialog title="Dokumen tersimpan" close={()=>setHistory(false)}><div className="dialog-content fields">{listLoading||listError?<LoadingArea message="Memuat dokumen tersimpan…" error={listError} retry={retryList}/>:!list.length?<Empty>Belum ada dokumen tersimpan.</Empty>:list.map(doc=><div className="history-row" key={doc.id}><button className="table-link" onClick={()=>load(doc)}><FileText size={16}/> {doc.data.fields.projectName||doc.data.fields.purpose||info.docTitle}<small className="block muted">{doc.data.fields.issued==='true'?'Terbit · '+doc.data.fields.number:'Draf'} · {dateLabel(doc.updated,'short')}</small></button>{roleCanEdit&&doc.data.fields.issued!=='true'&&(user.role!=='PM'||kind==='mom')&&<button className="icon-button" onClick={()=>setRemove(doc)} aria-label="Hapus dokumen"><Trash2 size={15}/></button>}</div>)}</div></Dialog>}
  {publish&&<ButtonConfirm value="Terbitkan surat penunjukan ini? Surat terbit disimpan sebagai arsip." onConfirm={()=>{setPublish(false);void persist(true)}} onCancel={()=>setPublish(false)}/>}
  {remove&&<ButtonConfirm value="Hapus dokumen tersimpan ini?" onConfirm={()=>deleteDoc(remove)} onCancel={()=>setRemove(null)}/>}
  </div>;
}

function PaperTable({rows,riskLevels=false}: {rows:string[][];riskLevels?:boolean}) {
  return <table className="space-top"><thead><tr>{rows[0].map((x,i)=><th key={i}>{x}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i)=><tr key={i}>{row.map((x,j)=><td key={j}>{riskLevels&&(j===3||j===4)?<Pill tone={riskTone(x)}>{x}</Pill>:x}</td>)}</tr>)}</tbody></table>;
}
function Signature({label,value,change}: {label:string;value:string;change:(value:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const [error,setError]=useState('');
  function draw(e:PointerEvent<HTMLCanvasElement>,start=false) {
    const element=e.currentTarget, bounds=element.getBoundingClientRect(),ctx=element.getContext('2d')!;
    const x=(e.clientX-bounds.left)*element.width/bounds.width,y=(e.clientY-bounds.top)*element.height/bounds.height;
    if(start){
      element.setPointerCapture(e.pointerId);drawing.current=true;ctx.strokeStyle='#102052';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y);ctx.stroke();
    }else if(drawing.current){ctx.lineTo(x,y);ctx.stroke()}
  }
  return <div className="signature-field"><strong>{label}</strong>{value?<img src={value} alt={'Tanda tangan '+label}/>:<canvas width={440} height={130} ref={canvas} onPointerDown={e=>draw(e,true)} onPointerMove={e=>draw(e)} onPointerCancel={()=>{drawing.current=false}} onPointerUp={()=>{if(drawing.current){drawing.current=false;change(canvas.current!.toDataURL('image/png'))}}}/>}<div className="heading-actions"><label className="button"><ImagePlus size={15}/> Unggah<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{if(e.target.files?.[0])try{change(await imageData(e.target.files[0],440));setError('')}catch(e){setError((e as Error).message)}}}/></label>{value&&<button className="subtle-button" onClick={()=>change('')}>Hapus</button>}</div>{error&&<ErrorBox message={error}/>}</div>;
}

const tabs=[['main','WBS'],['scheduling','Linimasa'],['report','Laporan mingguan']];
function templateFor(project?:ProjectRow){
  return resolvePillar(project?.pillar??'')?.operationsTemplate??'application';
}
export function Operations({projects,user,notify}: {projects:ProjectRow[];user:User;notify:(message:string)=>void}) {
  const writable=['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','PM'].includes(user.role);
  const own=(pid:string)=>user.role!=='PM'||projects.some(p=>pid===p.id&&p.detail.pm.trim().toLowerCase()===user.name.trim().toLowerCase());
  const [project,setProject]=useState(()=>projects.find(p=>own(p.id))?.id||projects[0]?.id||'');
  const [tab,setTab]=useState(()=>{const saved=sessionStorage.getItem('ops-tab');return tabs.some(([id])=>id===saved)?saved!:'main'});
  const [height,setHeight]=useState(780);
  const {items:records,setItems:setRecords,loading:recordsLoading,error:recordsError,retry:retryRecords}
    =useLoadingList<Saved<Record<string,unknown>>>('/documents/operations');
  const [frameAttempt,setFrameAttempt]=useState(0);
  const [readyFrame,setReadyFrame]=useState('');
  const [failedFrame,setFailedFrame]=useState('');
  const frameKey=project+'/'+tab+'/'+frameAttempt;
  const editorReady=readyFrame===frameKey;
  const editorFailed=failedFrame===frameKey;
  const editorAvailable=Boolean(project&&!recordsLoading&&!recordsError);
  const [pending,setPending]=useState<null|{project:string; data:Record<string,unknown>}>(null);
  const [metrics,setMetrics]=useState<Metrics|null>(null);
  const [template,setTemplate]=useState<string>(()=>templateFor(projects.find(p=>p.id===project)));
  const [reportPreview,setReportPreview]=useState(false);
  const [confirmTemplate,setConfirmTemplate]=useState(false);
  const [error,setError]=useState('');
  const [state,setState]=useState('');
  const frame=useRef<HTMLIFrameElement>(null);
  const reportPaper=useRef<HTMLElement>(null);
  const saving=useRef(false);
  const selected=projects.find(p=>p.id===project);
  const reportName='Laporan-Mingguan-'+project+'-W'+(metrics?.week??0);
  const logbook=useWeeklyLogbook(project,tab==='report'?metrics?.week:undefined);
  const entries=logbook.record?.data.entries??[];
  useEffect(()=>{
    if(!editorAvailable||editorReady||editorFailed)return;
    const timer=setTimeout(()=>setFailedFrame(frameKey),12000);
    return ()=>clearTimeout(timer);
  },[editorAvailable,editorReady,editorFailed,frameKey]);
  useEffect(()=>{
    function event(e:MessageEvent){
      if(e.origin!==location.origin||e.source!==frame.current?.contentWindow)return;
      const msg=e.data;
      if(!msg)return;
      if(msg?.type==='shockwave-operations-ready'&&msg.project===project){
        setReadyFrame(frameKey);
        return;
      }
      if(msg?.type==='shockwave-operations-load-error'&&msg.project===project){
        setFailedFrame(frameKey);
        return;
      }
      if(msg?.type==='shockwave-operations-height')setHeight(Math.max(340,Math.min(15000,Number(msg.height)||0)));
      if(msg.type==='shockwave-operations-change'&&writable&&own(project)&&msg.project===project){setPending({project,data:msg.data});setState('Perubahan belum disimpan')}
      if(msg.type==='shockwave-operations-metrics'&&msg.project===project)setMetrics(msg.metrics);
    }
    addEventListener('message',event);return()=>removeEventListener('message',event);
  },[project,writable,frameKey]);
  function sendOperation(action:string){
    if(!editorReady)return;
    frame.current?.contentWindow?.postMessage({type:'shockwave-operations-action',action},location.origin);
  }
  function initialize(target:HTMLIFrameElement){
    if(target!==frame.current)return;
    const record=records.find(row=>row.id===project);
    target.contentWindow?.postMessage({type:'shockwave-operations-load',data:record?.data, name:selected?.detail.name,readonly:!writable||!own(project)},location.origin);
  }
  async function save(){
    if(!pending||saving.current)return false;
    const request=pending;
    saving.current=true;setState('Menyimpan…');setError('');
    try {
      const version=records?.find(row=>row.id===request.project)?.version??0;
      const result=await api<Saved<Record<string,unknown>>>('/documents/operations/'+request.project,'PUT',{version,data:request.data});
      setRecords(rows=>[result,...(rows??[]).filter(row=>row.id!==result.id)]);
      setPending(next=>next===request?null:next);setState('Tersimpan');
      return true;
    }catch(e){setError((e as Error).message);setState('Gagal menyimpan');return false}finally{saving.current=false}
  }
  useEffect(()=>{
    if(!pending||state==='Gagal menyimpan')return;
    const timer=setTimeout(()=>void save(),1500);return()=>clearTimeout(timer);
  },[pending,state]);
  async function switchTo(next:string, nextTab:string){
    if(next===project&&nextTab===tab)return;
    if(saving.current||pending&&!await save())return;
    if(next!==project)setTemplate(templateFor(projects.find(p=>p.id===next)));
    setFrameAttempt(value=>value+1);setProject(next);setTab(nextTab);sessionStorage.setItem('ops-tab',nextTab);setMetrics(null);setReportPreview(false);setState('');
  }
  return <><Heading title="Operasional" description={selected?<>{selected.detail.name} <Pill tone="violet">{selected.pillar}</Pill></>:'Pilih proyek untuk membuka rencana kerja.'} actions={<><label className="field">Ganti proyek<select value={project} aria-label="Ganti proyek" onChange={e=>switchTo(e.target.value,tab)}>{projects.map(p=><option value={p.id} key={p.id}>{p.id} · {p.detail.name.slice(0,55)}</option>)}</select></label>{writable&&own(project)&&<button className="button" disabled={!pending||state==='Menyimpan…'} onClick={async()=>{if(await save())notify('Rencana operasional disimpan.')}}><Save size={16}/> Simpan</button>}</>}/>
    <div className="ops-tabs"><div>{tabs.map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>{if(id!==tab)void switchTo(project,id)}} aria-pressed={tab===id}>{label}</button>)}</div><small className="muted" role="status">{state}</small></div>
    {error&&<ErrorBox message={error}/>}
    <div className="heading-actions ops-tools">{writable&&own(project)&&<><select aria-label="Templat aktivitas" value={template} onChange={e=>setTemplate(e.target.value)}><option value="application">Application</option><option value="service">Manage Service</option><option value="infrastructure">Infrastructure</option></select><button className="button" disabled={!editorReady} onClick={()=>setConfirmTemplate(true)}>Terapkan templat</button><button className="button" disabled={!editorReady} onClick={()=>sendOperation('template')}><Download size={15}/> Templat Excel</button><button className="button" disabled={!editorReady} onClick={()=>sendOperation('import')}>Impor Excel</button><button className="button" disabled={!editorReady} onClick={()=>sendOperation('reset')}>Kembali ke templat</button></>}{tab!=='report'&&<button className="button" disabled={!editorReady} onClick={()=>sendOperation('export')}><Download size={15}/> Ekspor data Excel</button>}</div>
    {tab==='report'&&metrics&&<div className="heading-actions ops-tools">
      <button className="button" disabled={!logbook.record} onClick={()=>setReportPreview(true)}><FileText size={15}/> Pratinjau laporan</button>
      {logbook.record&&<>
        <DocumentExport paper={reportPaper} name={reportName} onError={setError}/>
        <div hidden><WeeklyReportDocument paper={reportPaper} project={selected?.detail.name||project} metrics={metrics} entries={entries}/></div>
      </>}
    </div>}
    {reportPreview&&metrics&&logbook.record&&<WeeklyReportPreview project={selected?.detail.name||project} metrics={metrics} name={reportName} entries={entries} close={()=>setReportPreview(false)}/>}
    {tab==='report'&&metrics&&<Curve metrics={metrics} select={week=>frame.current?.contentWindow?.postMessage({type:'shockwave-operations-week',week},location.origin)}/>}

    {!project?<Empty>Pilih proyek untuk membuka rencana.</Empty>:<>
      {(recordsLoading||recordsError)&&<LoadingArea message="Memuat data Operasional…" error={recordsError} retry={retryRecords}/>}
      {editorAvailable&&!editorReady&&<LoadingArea message="Memuat rencana kerja…"
        error={editorFailed?'Editor Operasional belum dapat dibuka.':undefined}
        retry={()=>{setFrameAttempt(attempt=>attempt+1);setMetrics(null)}}/>}
      {editorAvailable&&!editorFailed&&<iframe title="Editor operasional" key={frameKey} className="ops-frame" ref={frame}
        src={'/fase-1/operations.html?project='+encodeURIComponent(project)+'&tab='+tab+'&v=editor-ready'}
        style={{height:editorReady?height:0,visibility:editorReady?'visible':'hidden'}}
        tabIndex={editorReady?undefined:-1} aria-hidden={!editorReady} onLoad={event=>initialize(event.currentTarget)}/>}
    </>}
    {tab==='report'&&metrics&&<WeeklyLogbook key={project+'/'+metrics.week} week={metrics.week} weekDate={metrics.weekDate} editable={writable&&own(project)} logbook={logbook} notify={notify}/>}
    {confirmTemplate&&<ButtonConfirm value="Ganti rencana proyek dengan templat terpilih? Data WBS, linimasa, dan laporan sebelumnya akan diganti." onCancel={()=>setConfirmTemplate(false)} onConfirm={()=>{setConfirmTemplate(false);frame.current?.contentWindow?.postMessage({type:'shockwave-operations-template',template},location.origin)}}/>}
  </>;
}

function Curve({metrics,select}:{metrics:Metrics;select:(week:number)=>void}){
  const [visible,setVisible]=useState({plan:true,actual:true,spi:false});
  const {dates,plan,actual,week}=metrics;
  const plotWidth=Math.max(550,Math.max(1,dates.length-1)*55);
  const width=plotWidth+88;
  const x=(i:number)=>44+plotWidth*i/Math.max(1,dates.length-1);
  const y=(value:number)=>220-Math.min(125,value)*1.44;
  const series=[
    {key:'plan',name:'Rencana',values:plan,color:'#2656df',offset:-10},
    {key:'actual',name:'Aktual',values:actual,color:'#138e82',offset:15},
    {key:'spi',name:'Schedule Index',values:actual.map((value,i)=>plan[i]?value/plan[i]*100:0),color:'#bd741e',offset:-25},
  ] as const;
  const spi=plan[week]?actual[week]/plan[week]:0;
  const status=!plan[week]?'Rencana belum diatur':spi<.9?'Terlambat':spi>1.05?'Lebih cepat':'Sesuai jadwal';
  return <section className="panel padded curve">
    <div className="split"><h2>Kurva S</h2><select aria-label="Minggu Kurva S" value={week} onChange={e=>select(+e.target.value)}>{dates.map((date,i)=><option value={i} key={i}>W{i} · {date}</option>)}</select></div>
    <div className="heading-actions space-top">
      {series.map(({key,name,color})=><button key={key} aria-pressed={visible[key]} onClick={()=>setVisible({...visible,[key]:!visible[key]})} className={'chip '+(visible[key]?'filter-selected':'')} style={{borderColor:visible[key]?color:undefined}}>{name}</button>)}
    </div>
    <div className="curve-grid">
      <div className="curve-scroll" role="region" aria-label="Grafik Kurva S" tabIndex={0}>
        <svg viewBox={'0 0 '+width+' 253'} style={{minWidth:width}} role="group" aria-label={'Kurva S, minggu '+week}>
          {[0,25,50,75,100,125].map(value=><g key={value}><line x1="44" y1={y(value)} x2={width-44} y2={y(value)} stroke="var(--line)"/><text x="4" y={y(value)+4}>{value}%</text></g>)}
          <line x1={x(week)} y1="26" x2={x(week)} y2="220" stroke="var(--accent)" opacity=".6"/>
          {series.filter(item=>visible[item.key]).map(({key,name,values,color})=><g key={key}>
            <polyline fill="none" stroke={color} strokeWidth="2.5" points={values.map((value,i)=>x(i)+','+y(value)).join(' ')}/>
            {values.map((value,i)=><circle key={i} className="chart-point" cx={x(i)} cy={y(value)} r={i===week?4.5:3.2} fill={color} stroke="var(--panel)" strokeWidth="1" tabIndex={0} role="button" aria-label={'Minggu '+i+' '+name+' '+value+' persen'} onClick={()=>select(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i)}}}><title>{name+' W'+i+' · '+value.toFixed(1)+'%'}</title></circle>)}
          </g>)}
          {series.filter(item=>visible[item.key]).map(({key,values,color,offset})=><g key={key} aria-hidden="true">
            {values.map((value,i)=><text key={i} className="chart-point-value" x={x(i)} y={y(value)+offset} textAnchor="middle" style={{fill:color,fontWeight:i===week?850:650}}>{Number(value.toFixed(1))}%</text>)}
          </g>)}
          {dates.map((_,i)=><text className="chart-week" onClick={()=>select(i)} key={i} x={x(i)} y="246" textAnchor="middle">W{i}</text>)}
        </svg>
      </div>
      <div className="curve-kpis"><Pill tone={!plan[week]?'amber':spi<.9?'red':'green'}>{status}</Pill><dl className="detail-grid"><div><dt>Rencana</dt><dd>{plan[week]}%</dd></div><div><dt>Aktual</dt><dd>{actual[week]}%</dd></div><div><dt>SPI</dt><dd>{plan[week]?spi.toFixed(3):'—'}</dd></div><div><dt>Kenaikan</dt><dd>{((actual[week]||0)-(actual[week-1]||0)).toFixed(2)} poin</dd></div></dl></div>
    </div>
  </section>;
}
