import { TabWorkspace } from './choice-bar';
import { NavIcon } from './nav-icon';
import { ShellBack } from './shell-back';
import { ActionMenu } from './action-menu';
import { FormatIcon } from './download-menu';
import { FormField, TextInput, Textarea, Select } from './form-controls';
import { Camera, ClipboardList, FileUp, FilePlus2, FileText, FolderOpen, ImagePlus, Plus, RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { pillarOptions, resolvePillar, type ProjectRow } from '../../../packages/shared/domain';
import type { MomFollowup as Follow } from '../../../packages/shared/mom-sample';
import { ApiError, Button, api, ConfirmDialog, dateLabel, Dialog, Empty, ErrorBox, Heading, Pill, type User } from './ui';
import { AttendeeFields, OutcomeField } from './mom-editors';
import { MomDocumentContents, momSteps as steps } from './mom-document';
import { LoadingArea, useLoadingList } from './loading-list';
import { DateInput } from './date-input';
import { DocumentExport } from './document-export';
import { downloadFile } from './download';
import { DocumentPreview, DocumentWorkspace } from './document-workspace';
import { defaultDocumentLogo, documentImage } from './document-logo';
import { SessionDocumentLogo, useDocumentLogo } from './document-branding';
import { SearchableSelect } from './search-select';
import { useProjectEditGuard } from './project-edit-guard';
import { normalizeRiskImpacts, riskRowsChanged, RiskMap, RiskRegister, riskTone, type Risk } from './risk-register';
import { WeeklyReportDocument, WeeklyReportPreview, type Metrics } from './weekly-report';
import { useWeeklyLogbook, WeeklyLogbook } from './weekly-logbook';

type Kind = 'assignment'|'risk'|'mom';
type DocData = {
  fields:Record<string,string>; projectId:string; logo:string; photos:string[]; signatures:Record<string,string>;
  risks:Risk[]; followups:Follow[];
};
type Saved<T> = {id:string;updated:string;version:number;data:T};
type Input = [key:string,label:string,type?:string];

const settings: Record<Kind,{title:string; description:string; docTitle:string; add:string}> = {
  assignment:{title:'Penunjukan PM',description:'Siapkan dan terbitkan surat penunjukan manajer proyek.',docTitle:'Surat Penunjukan Project Manager',add:'Buat surat baru'},
  risk:{title:'Daftar risiko',description:'Identifikasi risiko proyek dan tetapkan rencana respons.',docTitle:'Manajemen Risiko – Penilaian Risiko',add:'Buat daftar risiko'},
  mom:{title:'Notulen (MOM)',description:'Susun notulen rapat dengan lampiran, tindak lanjut, dan persetujuan.',docTitle:'Notulen Rapat',add:'Notulen baru'},
};
const today=()=>new Date().toISOString().slice(0,10);
const classificationLabel=(value:string)=>value==='Small'?'Kecil':value==='Big'?'Besar':value;
const assignmentFields:Input[] = [['projectName','Nama proyek'],['projectNo','Nomor proyek'],['customer','Pelanggan'],['classification','Klasifikasi','select:Small,Sedang,Big'],['pm','Nama manajer proyek'],['pmTitle','Jabatan PM'],['pmUnit','Unit PM'],['signer','Nama penanda tangan'],['signerTitle','Jabatan penanda tangan'],['signerUnit','Unit penanda tangan'],['numberMode','Penomoran','select:Otomatis,Manual'],['number','Nomor surat'],['place','Tempat'],['date','Tanggal surat','date']];
const riskHeaderFields:Input[]=[['projectName','Nama proyek'],['author','Disusun oleh'],['date','Tanggal','date']];
const documentExamples:Record<string,string>={
  projectName:'Pengembangan Portal Layanan',projectNo:'P014',customer:'PT Nusantara Digital',
  classification:'Sedang',pm:'Rani Pratama',pmTitle:'Manajer Proyek',pmUnit:'Software Development',
  signer:'Dimas Saputra',signerTitle:'Manajer PMO',signerUnit:'Project Management Office',
  numberMode:'Manual',number:'014/PM/PMO-SDD/XI/2026',place:'Jakarta',date:'24/11/2026',
  author:'Tim PMO',division:'PMO',purpose:'Tinjauan progres proyek mingguan',start:'09:00',end:'10:30',
  location:'Ruang Rapat Melati, Lantai 3',online:'https://meet.example.com/tinjauan-proyek',internal:'Tim PMO dan tim operasi',
  columns:'2',revisionDate:'26/11/2026',revisionMode:'Tampilkan',revisionNote:'Masukan dikirim paling lambat pukul 16.00 WIB.',
  closing:'Tindak lanjut dibahas pada rapat berikutnya.',signDate:'24/11/2026',writer:'Naya Wijaya',writerTitle:'Analis PMO',
  manager:'Rani Pratama',managerTitle:'Manajer PMO',approval:'Tampilkan',approvalLabel:'Persetujuan pelanggan',
  company:'PT Nusantara Digital',approver1:'Dimas Saputra',approver2:'Naya Wijaya',
  letterhead:'PT Swadharma Duta Data',address:'Jl. Melati No. 12, Jakarta',contact:'pmo@example.com',
};
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
const momDemoFields={
  purpose:'Tinjauan progres proyek mingguan',internal:'Tim PMO SDD',location:'Ruang rapat PMO',
  start:'09:00',end:'10:00',attendees:'Naya Fiktif\nRani Fiktif',
  result:'# Status minggu ini\n> Pembahasan\n- Tim meninjau progres implementasi.\n\n> Keputusan\n1. Periksa kendala yang masih terbuka.\n2. Konfirmasi target minggu depan.',
};

const sampleRisks=[
  ['Kebutuhan berubah setelah persetujuan ruang lingkup','Lingkup','Tinggi','Sedang','Gunakan proses persetujuan perubahan.'],
  ['Akses ke lingkungan pengujian terlambat','Waktu','Sedang','Tinggi','Ajukan akses lebih awal dan eskalasi hambatan.'],
  ['Ketergantungan pada satu tenaga ahli','Waktu','Tinggi','Sedang','Siapkan pengganti dan dokumentasi teknis.'],
  ['Perkiraan biaya implementasi meleset','Biaya','Sedang','Sedang','Tinjau proyeksi biaya mingguan.'],
  ['Keterlambatan material dari vendor','Waktu','Tinggi','Sedang','Pantau pesanan dan siapkan pemasok cadangan.'],
  ['Data sumber tidak lengkap','Lingkup','Sedang','Tinggi','Validasi kelengkapan sebelum migrasi.'],
  ['Pengerjaan ulang hasil UAT','Biaya','Sedang','Sedang','Sepakati skenario uji sejak awal.'],
  ['Jadwal pengguna bentrok dengan UAT','Waktu','Rendah','Sedang','Konfirmasi agenda sebelum undangan.'],
  ['Spesifikasi perangkat tidak sesuai','Lingkup','Tinggi','Rendah','Verifikasi daftar perangkat sebelum pembelian.'],
  ['Tambahan kebutuhan lisensi','Biaya','Sedang','Rendah','Tinjau lisensi pada awal desain.'],
];
const id=()=>crypto.randomUUID();

export function Documents({kind,projects,user,notify}: {kind:Kind;projects:ProjectRow[];user:User;notify:(message:string)=>void}) {
  const info=settings[kind];
  const sessionLogo=useDocumentLogo(kind);
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
  const [demoLoaded,setDemoLoaded]=useState(false);
  const [attendeeDraft,setAttendeeDraft]=useState(false);
  const [attendeeReset,setAttendeeReset]=useState(0);
  const [momInvalidDates,setMomInvalidDates]=useState<string[]>([]);
  const [photosLoading,setPhotosLoading]=useState(false);
  const [photoError,setPhotoError]=useState('');
  const [photoNames,setPhotoNames]=useState<Record<string,string>>({});
  const [photoPreview,setPhotoPreview]=useState<string>();
  const photoInput=useRef<HTMLInputElement>(null);
  const photoReplacement=useRef<number>();
  const photoRequest=useRef<{running:boolean;token:number}>({running:false,token:0});
  const [riskWorking,setRiskWorking]=useState<Risk[]|null>(null);
  const [riskConflict,setRiskConflict]=useState(false);
  const [invalidRiskDate,setInvalidRiskDate]=useState(false);
  const [removeRisk,setRemoveRisk]=useState<Risk|null>(null);
  const [riskFilter,setRiskFilter]=useState<{severity:string;probability:string}|null>(null);
  const [preview,setPreview]=useState(false);
  const [confirmSample,setConfirmSample]=useState(false);
  const [savedAt,setSavedAt]=useState('');
  const paper=useRef<HTMLElement>(null);
  const workspace=useRef<HTMLDivElement>(null);
  const active=useRef(false);
  const revision=useRef(0);
  const roleCanEdit=kind==='assignment'?['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO'].includes(user.role):kind==='risk'?['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','PM'].includes(user.role):user.role!=='VIEWER';
  const canEdit=roleCanEdit&&draft.fields.issued!=='true';
  const available=kind==='risk'&&user.role==='PM'?projects.filter(p=>p.detail.pm.trim().toLowerCase()===user.name.trim().toLowerCase()):projects;
  const f=draft.fields;
  const previewLogo=f.issued==='true'?(draft.logo||defaultDocumentLogo):sessionLogo;
  const required=kind==='assignment'?[['pm','PM'],['projectName','proyek'],['customer','pelanggan'],['classification','klasifikasi'],...(f.numberMode==='Manual'?[['number','nomor surat']]:[])]:kind==='risk'?[['projectName','nama proyek']]:[['purpose','tujuan rapat'],['date','tanggal']];
  const missing=required.filter(([key])=>!f[key]?.trim()).map(([,label])=>label);

  const riskRowsInEditor=riskWorking??draft.risks;
  const rowDirty=Boolean(riskWorking&&riskRowsChanged(draft.risks,riskWorking));
  const riskBusy=kind==='risk'&&state==='Menyimpan…';
  const riskGuard=useProjectEditGuard(kind==='risk'&&(rowDirty||dirty||invalidRiskDate),()=>active.current,discardRiskRows);

  const momGuard=useProjectEditGuard(kind==='mom'&&canEdit&&(dirty||attendeeDraft||momInvalidDates.length>0),()=>active.current,resetMomTransient);

  function cancelPhotoUpload(){
    photoRequest.current.token++;
    photoRequest.current.running=false;
    setPhotosLoading(false);
    photoReplacement.current=undefined;
  }

  function resetMomTransient(){
    cancelPhotoUpload();
    setDemoLoaded(false);
    setPhotoError('');setPhotoNames({});setPhotoPreview(undefined);
    setAttendeeDraft(false);
    setMomInvalidDates([]);
  }

  function markMomDate(key:string,invalid:boolean){
    setMomInvalidDates(previous=>invalid?previous.includes(key)?previous:[...previous,key]:previous.filter(value=>value!==key));
  }

  function focusMomEditor(){
    requestAnimationFrame(()=>workspace.current?.querySelector<HTMLElement>('#mom-editor-title')?.focus());
  }

  function stageRisks(update:(rows:Risk[])=>Risk[]){
    if(!canEdit||active.current)return;
    setRiskWorking(current=>{
      const next=update(current??draft.risks);
      return riskRowsChanged(draft.risks,next)?next:null;
    });
  }

  function discardRiskRows(){
    setRiskWorking(null);
    setRemoveRisk(null);
    if(state==='Gagal menyimpan'&&!riskConflict){
      setState(dirty?'Perubahan belum disimpan':savedAt?'Tersimpan':'');
      setError('');
    }
  }

  function change(data:Partial<DocData>|((current:DocData)=>Partial<DocData>)){
    revision.current++;
    setDraft(current=>({...current,...(typeof data==='function'?data(current):data)}));
    setDirty(true);
    if(kind!=='mom'||!active.current){setState('Perubahan belum disimpan');setError('')}
  }
  function fieldChange(key:string,value:string){
    change({fields:{...f,[key]:value,...(kind==='mom'&&key==='date'?{revisionDate:plusWorkingDays(value)}:{})}});
  }
  function selectProject(key:string){
    const p=projects.find(p=>p.id===key);
    const update=()=>change({projectId:key,fields:{...f,...(p?{projectName:p.detail.name,projectNo:p.id,customer:p.detail.customer,pm:p.detail.pm}:{})}});
    if(kind==='risk'&&rowDirty&&key!==draft.projectId)riskGuard.exit(()=>{discardRiskRows();update()});
    else update();
  }
  async function persist(publish=false,stagedRisks?:Risk[]){
    if(!canEdit||active.current||kind==='risk'&&(riskConflict||rowDirty&&!stagedRisks))return false;
    if(stagedRisks&&user.role==='PM'&&!draft.projectId){
      setError('Pilih proyek sebelum menerapkan perubahan risiko.');
      return false;
    }
    if(workspace.current&&[...workspace.current.querySelectorAll<HTMLInputElement>('[data-date-control]')].some(input=>input.validity.customError)){
      setError('Periksa tanggal yang belum valid sebelum menyimpan.');setState('Gagal menyimpan');return false;
    }
    if(!stagedRisks&&!dirty&&!publish&&version>0)return true;
    if(publish&&missing.length){setError('Lengkapi '+missing.join(', ')+'.');return}
    active.current=true;setState('Menyimpan…');setError('');
    const at=revision.current;
    try{
      const data=kind==='risk'?{...draft,risks:(stagedRisks??draft.risks).map(item=>({...item,impacts:normalizeRiskImpacts(item.impacts)}))}:draft;
      const saved=await api<Saved<DocData>>(endpoint+'/'+documentId,'PUT',{version,data,publish});
      setVersion(saved.version);setSavedAt(saved.updated);setList(rows=>[saved,...rows.filter(row=>row.id!==saved.id)]);
      if(stagedRisks)setRiskWorking(null);
      if(at===revision.current){setDraft(saved.data);setDirty(false);setState('Tersimpan')}
      else {
        if(stagedRisks)setDraft(current=>({...current,risks:saved.data.risks}));
        setState('Perubahan belum disimpan');
      }
      if(publish)notify('Surat diterbitkan.');
      return at===revision.current;
    }catch(e){
      if(kind==='risk'&&e instanceof ApiError&&e.status===409)setRiskConflict(true);
      setError((e as Error).message);setState('Gagal menyimpan');return false;
    }finally{active.current=false}
  }
  useEffect(()=>{
    if(publish||momGuard.confirming||riskGuard.confirming||kind==='risk'&&(rowDirty||riskConflict)||!canEdit||!dirty||state==='Gagal menyimpan'||state==='Menyimpan…'||(kind==='risk'&&user.role==='PM'&&!draft.projectId))return;
    const timer=setTimeout(()=>void persist(),1500);
    return ()=>clearTimeout(timer);
  },[draft,dirty,state,publish,momGuard.confirming,riskGuard.confirming,rowDirty,riskConflict]);
  function requestDocument(saved?:Saved<DocData>){
    if(kind==='risk'&&saved?.id===documentId){setHistory(false);return}
    if(kind==='risk'&&(rowDirty||riskConflict)){
      riskGuard.exit(()=>void load(saved,true));return;
    }
    if(kind==='mom'&&saved?.id!==documentId&&attendeeDraft&&!momInvalidDates.length){
      momGuard.exit(()=>void load(saved));
    }else void load(saved);
  }

  function installDraft(saved?:Saved<DocData>){
    if(kind==='mom')resetMomTransient();
    setDraft(saved?.data??initial(kind,user));setDocumentId(saved?.id??id());setVersion(saved?.version??0);setDirty(false);
    setSavedAt(saved?.updated??'');setState(saved?'Tersimpan':'');setRiskWorking(null);setRemoveRisk(null);
    setRiskConflict(false);setInvalidRiskDate(false);setRiskFilter(null);setError('');setHistory(false);
    if(kind==='mom')focusMomEditor();
    if(!saved&&kind==='assignment'){notify('Draf penunjukan baru siap diisi.');requestAnimationFrame(()=>document.getElementById('assignment-project')?.focus())}
  }

  async function load(saved?:Saved<DocData>,discard=false){
    if(active.current)return;
    if(!discard&&(dirty||invalidRiskDate||momInvalidDates.length>0)&&!await persist())return;
    if(saved?.id===documentId){setHistory(false);return}
    installDraft(saved);
  }

  async function reloadRisk(){
    if(active.current)return;
    active.current=true;
    setState('Menyimpan…');
    try{
      const entries=await api<Saved<DocData>[]>(endpoint);
      setList(entries);
      installDraft(entries.find(entry=>entry.id===documentId));
      setPreview(false);
      requestAnimationFrame(focusRiskTable);
    }catch(e){
      setError((e as Error).message);setState('Gagal menyimpan');
    }finally{active.current=false}
  }
  async function deleteDoc(doc:Saved<DocData>){
    setRemove(null);
    try{await api(endpoint+'/'+doc.id,'DELETE');setList(rows=>rows.filter(row=>row.id!==doc.id));if(documentId===doc.id)installDraft();notify('Dokumen dihapus.')}
    catch(e){setError((e as Error).message)}
  }
  useEffect(()=>()=>{photoRequest.current.token++},[]);

  async function photosChange(files:FileList,replacement?:number){
    if(!canEdit||!files.length||photoRequest.current.running)return;
    const selected=Array.from(files);
    if(replacement!==undefined&&selected.length!==1){setPhotoError('Pilih satu foto pengganti.');return}
    if(replacement===undefined&&selected.length+draft.photos.length>10){setPhotoError('Maksimal 10 foto per notulen.');return}
    const token=++photoRequest.current.token;
    photoRequest.current.running=true;
    setPhotosLoading(true);setPhotoError('');
    try{
      const photos=await Promise.all(selected.map(async file=>{
        try{return await documentImage(file)}
        catch(error){throw new Error(file.name+'. '+(error as Error).message)}
      }));
      if(token!==photoRequest.current.token)return;
      setPhotoNames(names=>({...names,...Object.fromEntries(photos.map((src,index)=>[src,selected[index].name]))}));
      change(current=>({photos:replacement===undefined?[...current.photos,...photos]:
        current.photos.map((src,index)=>index===replacement?photos[0]:src)}));
    }catch(e){if(token===photoRequest.current.token)setPhotoError((e as Error).message)}
    finally{if(token===photoRequest.current.token){photoRequest.current.running=false;setPhotosLoading(false)}}
  }
  function choosePhotos(replacement?:number){
    const control=photoInput.current;
    if(!canEdit||!control||photosLoading)return;
    photoReplacement.current=replacement;
    control.multiple=replacement===undefined;
    control.click();
  }

  function focusRiskTable(){
    workspace.current?.querySelector<HTMLElement>('#risk-register-title')?.focus({preventScroll:true});
  }

  function sample(){
    setConfirmSample(false);
    if(kind==='risk'){setRiskFilter(null);stageRisks(()=>sampleRisks.map(([description,impact,severity,probability,response])=>({id:id(),description,impacts:[impact],severity,probability,response})));}
    if(kind==='mom'){
      change(current=>({fields:{...current.fields,...momDemoFields}}));
      setDemoLoaded(true);
      setAttendeeDraft(false);
      setAttendeeReset(value=>value+1);
      focusMomEditor();
    }
  }

  function requestSample(){
    if(kind==='risk'&&active.current)return;
    if(kind!=='mom'||attendeeDraft||Object.keys(momDemoFields).some(key=>f[key]?.trim()))setConfirmSample(true);
    else sample();
  }

  const momHasSampleInput=attendeeDraft||Object.keys(momDemoFields).some(key=>f[key]?.trim());
  const sampleMenu=<ActionMenu label="Tindakan lainnya" items={[
    {id:'sample',label:kind==='mom'?'Muat contoh (data demo)':'Muat contoh',icon:<ClipboardList size={16} aria-hidden="true"/>,run:requestSample},
  ]}/>;
  const riskRows=[['No','Identifikasi','Dampak','Keparahan','Probabilitas','Respons'],...riskRowsInEditor.map((r,i)=>[String(i+1),r.description,normalizeRiskImpacts(r.impacts).join(', '),r.severity,r.probability,r.response])];
  const fileName=kind==='assignment'?'Penunjukan-PM-'+(f.projectNo||f.date||'Draf')
    :kind==='risk'?'Daftar-Risiko-'+(draft.projectId||f.date||'Draf'):'Notulen-'+(f.date||'Draf');
  const previewPane=<DocumentPreview key={documentId} paper={paper} showRefreshStatus={kind==='risk'} className={kind==='mom'?'mom-paper-stage':''}
    toolbar={<><Pill tone={f.issued==='true'?'green':'neutral'}>{f.issued==='true'?'Terbit':'Draf'}</Pill>
      <span className="muted">{missing.length?missing.length+' informasi perlu dilengkapi':'Informasi lengkap'}</span>
      {kind==='risk'&&rowDirty&&<Pill tone="amber">Perubahan belum diterapkan</Pill>}</>}
    actions={<>{kind==='assignment'&&<Button className="button" type="button" onClick={()=>window.print()}><NavIcon name="print"/> Cetak</Button>}{kind==='risk'&&(rowDirty||riskBusy||riskConflict)?
      <span className="muted">Terapkan perubahan untuk mengunduh dokumen.</span>:
      <DocumentExport paper={paper} name={fileName} formats={kind==='mom'?['Word','PDF']:undefined} onError={setError}/>}</>}>
      <article ref={paper} className={'paper '+kind+'-paper'} data-document-draft={f.issued!=='true'||undefined}>
        {kind==='mom'?<MomDocumentContents data={{...draft,logo:previewLogo}}/>:<header className="document-letterhead">
          <img className="paper-logo" src={previewLogo} alt="Logo dokumen"/>
          {f.letterhead&&<p>{f.letterhead}</p>}
          <h2>{info.docTitle}</h2>
          {kind==='assignment'&&<p className="document-number">{f.number||'Otomatis saat diterbitkan'}</p>}
        </header>}
        {kind==='assignment'&&<>

          <section className="assignment-paper">
            <p>Yang bertanda tangan di bawah ini,</p>
            <dl className="paper-fields">{[['Nama',f.signer],['Jabatan',f.signerTitle],['Unit',f.signerUnit]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
            <p>Menunjuk <strong>{f.pm||'—'}</strong> sebagai Project Manager untuk proyek berikut.</p>
            <dl className="paper-fields">{[['Proyek',f.projectName],['Nomor proyek',f.projectNo],['Pelanggan',f.customer],['Klasifikasi',f.issued==='true'&&!f.classificationLabel?f.classification:classificationLabel(f.classification)],['Jabatan PM',f.pmTitle],['Unit PM',f.pmUnit]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
            <div className="assignment-signature"><p>{f.place||'—'}, {dateLabel(f.date)}</p><p className="signature-space"><strong>{f.signer||'—'}</strong></p>{f.signerTitle&&<p>{f.signerTitle}</p>}</div>
          </section>
        </>}
        {kind==='risk'&&<><div className="risk-paper-meta"><p><strong>{f.projectName||'—'}</strong></p><p>{f.author||'—'} · {dateLabel(f.date)} · {riskRowsInEditor.length} risiko</p></div><PaperTable rows={riskRows} riskLevels/></>}
      </article>
  </DocumentPreview>;
  function renderFields(fields:Input[], fullWidth=false){
    return fields.filter(([key])=>(key!=='number'||f.numberMode==='Manual')&&!(kind==='mom'&&['attendees','previous','result'].includes(key))).map(([key,label,type])=>{
      const mandatory=required.some(([requiredKey])=>requiredKey===key);
      const placeholder=kind==='mom'&&key==='number'?'NTLN/241126/PMO/2026':documentExamples[key];
      return <FormField label={label} required={mandatory} className={fullWidth||type==='textarea'||key==='projectName'?'span-full':''} key={key}>
        {type==='textarea'?<Textarea placeholder={placeholder} aria-required={mandatory||undefined} value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}/>
          :type?.startsWith('select:')?<Select aria-required={mandatory||undefined} placeholder={placeholder}
            clearLabel={mandatory||['approval','numberMode','columns','revisionMode'].includes(key)?undefined:'Hapus nilai '+label}
            aria-describedby={key==='columns'?'mom-photo-layout-help':undefined} value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}>
            {type.slice(7).split(',').map(value=><option key={value} value={value}>{key==='classification'?classificationLabel(value):value}</option>)}
          </Select>:type==='date'?<DateInput label={label} placeholder={placeholder} aria-required={mandatory||undefined} value={f[key]||''} key={kind==='risk'?documentId:undefined} onInvalidDraft={kind==='risk'?setInvalidRiskDate:kind==='mom'?invalid=>markMomDate(key,invalid):undefined} onValue={value=>fieldChange(key,value)}/>
          :type==='time'?<span className="input-example" data-example={!f[key]?placeholder:undefined}>
            <TextInput aria-required={mandatory||undefined} type="time" value={f[key]||''} onChange={e=>fieldChange(key,e.target.value)}/>
          </span>:<TextInput aria-required={mandatory||undefined} type={type||'text'} value={f[key]||''}
            placeholder={placeholder} onChange={e=>fieldChange(key,e.target.value)}/>}
      </FormField>;
    });
  }
  const logoField=canEdit&&<SessionDocumentLogo scope={kind} disabled={riskBusy}/>;
  function momFields(step:number){
    return <fieldset disabled={!canEdit} className="field-grid clean-fieldset">
      {step===9?<>
        {renderFields(steps[step].fields.filter(([key])=>key!=='address'))}
        {renderFields(steps[step].fields.filter(([key])=>key==='address'))}
      </>:renderFields(step===8&&f.approval!=='Tampilkan'?steps[step].fields.slice(0,1):steps[step].fields,step===8&&f.approval!=='Tampilkan')}
      {step===2&&<AttendeeFields key={attendeeReset} value={f.attendees||''} onDraftChange={setAttendeeDraft} change={value=>fieldChange('attendees',value)}/>}
      {step===4&&steps[4].fields.map(([key,label])=><OutcomeField key={key} label={label} value={f[key]||''} change={value=>fieldChange(key,value)}/>)}
      {step===9&&logoField}
      {step===3&&<div className="span-full fields">
        <p className="muted" id="mom-photo-layout-help">Jumlah foto dalam satu baris pada pratinjau dokumen.</p>
        <div className="photo-drop" tabIndex={canEdit?0:undefined} onDragOver={event=>{if(canEdit)event.preventDefault()}}
          onDrop={event=>{if(canEdit){event.preventDefault();void photosChange(event.dataTransfer.files)}}}
          onPaste={event=>{if(canEdit&&event.clipboardData.files.length){event.preventDefault();void photosChange(event.clipboardData.files)}}}>
          <Camera size={23} aria-hidden="true"/>
          <Button type="button" className="button" pending={photosLoading?'Menyiapkan foto…':undefined}
            disabled={!canEdit||draft.photos.length>=10} onClick={()=>choosePhotos()}>Tambah foto</Button>
          <small className="muted">PNG, JPEG, WebP · hingga 5 MB per foto · {draft.photos.length}/10</small>
          <input hidden ref={photoInput} aria-label="Foto lampiran" type="file" accept="image/png,image/jpeg,image/webp"
            disabled={!canEdit||photosLoading} onChange={event=>{
              const replacement=photoReplacement.current;
              photoReplacement.current=undefined;
              if(event.currentTarget.files)void photosChange(event.currentTarget.files,replacement);
              event.currentTarget.value='';
            }}/>
        </div>
        {photoError&&<ErrorBox message={photoError}/>}
        <div className="mom-photo-gallery">{draft.photos.map((src,index)=>{
          const label='Foto '+(index+1);
          return <figure key={index}>
            <button type="button" className="photo-thumbnail" aria-label={'Lihat '+label} onClick={()=>setPhotoPreview(src)}><img src={src} alt={label}/></button>
            <figcaption title={photoNames[src]}>{photoNames[src]||label}</figcaption>
            {canEdit&&<div className="heading-actions">
              <Button className="button" type="button" disabled={photosLoading} onClick={()=>choosePhotos(index)} aria-label={'Ganti '+label}>Ganti</Button>
              <Button className="button danger-text" type="button" disabled={photosLoading} aria-label={'Hapus '+label}
                onClick={()=>change(current=>({photos:current.photos.filter((_,position)=>position!==index)}))}><NavIcon name="trash"/> Hapus</Button>
            </div>}
          </figure>;
        })}</div>
        {canEdit&&draft.photos.length>0&&<Button className="button danger-text" type="button" disabled={photosLoading} onClick={()=>{cancelPhotoUpload();change({photos:[]})}}><NavIcon name="trash"/> Hapus semua foto</Button>}
      </div>}
      {step===5&&<div className="span-full fields">{draft.followups.map(item=>{
          const update=(key:keyof Follow,value:string)=>change({followups:draft.followups.map(r=>r.id===item.id?{...r,[key]:value}:r)});
          return <div className="row-editor fields" key={item.id}><label>Pihak<Select value={item.side} onChange={e=>update('side',e.target.value)}><option>Internal</option><option>Pelanggan</option></Select></label><label>Uraian<Textarea placeholder="Kirim hasil pengujian ke pelanggan" value={item.note} onChange={e=>update('note',e.target.value)}/></label><label>PIC<TextInput placeholder="Rani Pratama" value={item.pic} onChange={e=>update('pic',e.target.value)}/></label><label>Tenggat<DateInput label="Tenggat" value={item.due} onInvalidDraft={invalid=>markMomDate(item.id,invalid)} onValue={value=>update('due',value)}/></label><button className="subtle-button danger-text" onClick={()=>{markMomDate(item.id,false);change({followups:draft.followups.filter(v=>v.id!==item.id)})}}><NavIcon name="trash"/> Hapus</button></div>
        })}<Button className="button" onClick={()=>change({followups:[...draft.followups,{id:id(),side:'Internal',note:'',pic:'',due:''}]})}><Plus size={15}/> Tambah tindak lanjut</Button></div>}
      {(step===7||step===8&&f.approval==='Tampilkan')&&<div className="span-full signature-grid">{(step===7?[['writer','Notulis'],['manager','Penyetuju internal']]:[['approver1','Penyetuju pelanggan 1'],['approver2','Penyetuju pelanggan 2']]).map(([key,label])=><Signature key={key} label={label} disabled={!canEdit} value={draft.signatures[key]||''} change={signature=>change(current=>({signatures:{...current.signatures,[key]:signature}}))}/>)}</div>}
    </fieldset>;
  }
  const editorPane=<section className="panel padded no-print document-editor">
    <h2 id={kind==='mom'?'mom-editor-title':undefined} tabIndex={kind==='mom'?-1:undefined}>{kind==='mom'?'Isi notulen':kind==='risk'?'Identitas daftar risiko':'Detail penunjukan'}</h2>
    {kind==='mom'?<div className="mom-sections">
      {demoLoaded&&<div role="status"><Pill tone="amber">Data demo dimuat</Pill></div>}
      {steps.map((section,index)=><section className="mom-editor-section" key={section.title}
        aria-labelledby={'mom-section-'+index}>
        <h3 id={'mom-section-'+index}>{section.title}</h3>
        {momFields(index)}
      </section>)}
    </div>:<fieldset disabled={!canEdit||riskBusy} className="field-grid clean-fieldset">
      <div className="span-full field"><label htmlFor={kind==='assignment'?'assignment-project':'document-project'}>Proyek</label><SearchableSelect id={kind==='assignment'?'assignment-project':'document-project'} label="Proyek" value={draft.projectId} emptyLabel="Pilih proyek atau isi manual" example="Pengembangan Portal Layanan"
          options={available.map(p=>({id:p.id,label:p.id+' · '+p.detail.name}))} onChange={selectProject}/></div>
      {kind==='assignment'?<>
        <h3 className="span-full">Informasi proyek</h3>{renderFields(assignmentFields.slice(0,4))}
        <h3 className="span-full">Pihak yang menunjuk</h3>{renderFields(assignmentFields.slice(7,10))}
        <h3 className="span-full">Informasi Project Manager</h3>{renderFields(assignmentFields.slice(4,7))}
        <h3 className="span-full">Informasi surat</h3>{renderFields(assignmentFields.slice(10))}
      </>:renderFields(riskHeaderFields)}
      {logoField}
    </fieldset>}
  </section>;
  const riskPane=<RiskRegister key={documentId} risks={riskRowsInEditor} saved={draft.risks} canEdit={canEdit}
    filter={riskFilter} changeFilter={setRiskFilter} update={stageRisks} remove={setRemoveRisk}
    dirty={rowDirty} busy={riskBusy} conflict={riskConflict}
    apply={()=>void persist(false,riskRowsInEditor)} cancel={()=>riskGuard.exit(()=>{
      discardRiskRows();requestAnimationFrame(focusRiskTable);
    })}/>;
  return <div ref={workspace} className="print-scope"><div className="no-print"><Heading title={info.title} description={info.description} actions={<><Button className="button" onClick={()=>setHistory(true)}><FolderOpen size={16}/> Arsip dokumen{!listLoading&&!listError&&' ('+list.length+')'}</Button>{roleCanEdit&&<Button className="button" onClick={()=>requestDocument()}><FilePlus2 size={16}/> {info.add}</Button>}{canEdit&&<button className={kind==='mom'?'button primary':'button'} disabled={state==='Menyimpan…'||kind==='risk'&&(rowDirty||riskConflict)||(!dirty&&version>0&&!(kind==='mom'&&momInvalidDates.length))} onClick={()=>persist()}><Save size={16}/> {kind==='mom'&&state==='Menyimpan…'?state:kind!=='assignment'&&state==='Gagal menyimpan'?'Coba simpan lagi':version?'Simpan perubahan':'Simpan draf'}</button>}{kind==='mom'&&canEdit&&(momHasSampleInput?sampleMenu:<Button type="button" className="button" onClick={requestSample}><ClipboardList size={16} aria-hidden="true"/> Muat contoh</Button>)}{canEdit&&kind==='assignment'&&<Button className="button primary" disabled={state==='Menyimpan…'||Boolean(missing.length)} onClick={()=>setPublish(true)}>Terbitkan surat</Button>}</>}/></div>
  {error&&<ErrorBox message={error}/>}
  {riskConflict&&<Button type="button" className="button" disabled={riskBusy}
    onClick={()=>riskGuard.exit(()=>void reloadRisk())}>Muat ulang versi tersimpan</Button>}
  <div className="document-top no-print"><div className="heading-actions">{kind==='risk'&&canEdit&&sampleMenu}{kind==='risk'&&preview&&<ShellBack label="Kembali ke editor" onClick={()=>{setPreview(false);requestAnimationFrame(()=>workspace.current?.querySelector<HTMLButtonElement>('.document-workspace-switch [aria-pressed=true]')?.focus())}}/>}{kind==='risk'&&!preview&&!rowDirty&&!riskBusy&&!riskConflict&&<DocumentExport paper={paper} name={fileName} onError={setError}/>}</div><small className="muted" role="status">{state||'Dokumen baru'}{state==='Tersimpan'&&savedAt&&' · '+new Date(savedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB'}</small></div>
  {!canEdit&&!version&&<p className="source-note">Buka dokumen yang tersimpan untuk meninjaunya.</p>}
  <DocumentWorkspace userId={user.id} preview={previewPane} key={kind==='mom'?documentId:kind} singlePane={kind==='risk'}
    view={kind==='risk'?(preview?'preview':'editor'):undefined}
    onViewChange={kind==='risk'?view=>setPreview(view==='preview'):undefined}>
    {kind==='risk'?<div className="risk-document-editor">{editorPane}<RiskMap risks={riskRowsInEditor} filter={riskFilter} changeFilter={setRiskFilter}/>{riskPane}</div>:editorPane}
  </DocumentWorkspace>
  {photoPreview&&<Dialog title="Pratinjau foto" restoreFocus close={()=>setPhotoPreview(undefined)}><div className="dialog-content"><img className="mom-photo-large" src={photoPreview} alt="Foto lampiran notulen"/></div></Dialog>}
  {momGuard.confirming&&<ConfirmDialog title="Buang perubahan" object={f.purpose?.trim()||'Notulen'}
    consequence="Isian notulen yang belum disimpan akan dibuang." cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan" danger
    onCancel={momGuard.continueEditing} onConfirm={momGuard.discardChanges}/>}
  {riskGuard.confirming&&<ConfirmDialog title="Buang perubahan" object={f.projectName||'Daftar risiko'}
    consequence="Perubahan yang belum disimpan akan dibuang." cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan" danger
    onCancel={riskGuard.continueEditing} onConfirm={riskGuard.discardChanges}/>}
  {removeRisk&&<ConfirmDialog title="Hapus risiko" object={removeRisk.description} consequence="Risiko akan dihapus dari tabel kerja. Penghapusan disimpan setelah perubahan diterapkan." confirmLabel="Hapus risiko" deleteAction onCancel={()=>setRemoveRisk(null)} onConfirm={()=>{
    if(canEdit){
      stageRisks(rows=>rows.filter(item=>item.id!==removeRisk.id));
      requestAnimationFrame(focusRiskTable);
    }
    setRemoveRisk(null);
  }}/>}
  {history&&<Dialog title="Arsip dokumen" restoreFocus={kind==='mom'} close={()=>setHistory(false)}><div className="dialog-content fields">{listLoading||listError?<LoadingArea message="Memuat arsip dokumen…" error={listError} retry={retryList}/>:!list.length?<Empty>Belum ada dokumen tersimpan.</Empty>:list.map(doc=><div className="history-row" key={doc.id}><button className="table-link" onClick={()=>requestDocument(doc)}><FileText size={16}/> {doc.data.fields.projectName||doc.data.fields.purpose||info.docTitle}<small className="block muted">{doc.data.fields.issued==='true'?'Terbit · '+doc.data.fields.number:'Draf'} · {dateLabel(doc.updated,'short')}</small></button>{roleCanEdit&&doc.data.fields.issued!=='true'&&(user.role!=='PM'||kind==='mom')&&<button className="icon-button danger-text" type="button" disabled={riskBusy} onClick={()=>setRemove(doc)} aria-label="Hapus dokumen"><NavIcon name="trash"/></button>}</div>)}</div></Dialog>}
  {confirmSample&&<ConfirmDialog title="Muat data contoh" object={f.projectName||f.purpose||info.docTitle} consequence={kind==='mom'?'Tujuan, pihak internal, lokasi, waktu, peserta, dan hasil rapat saat ini akan diganti dengan data demo.':'Isian yang tercakup dalam templat akan diganti dengan data contoh.'} confirmLabel="Muat contoh" onConfirm={sample} onCancel={()=>setConfirmSample(false)}/>}
  {publish&&<ConfirmDialog title="Terbitkan surat penunjukan" object={f.projectName||info.docTitle} consequence="Surat terbit akan disimpan sebagai arsip dan dikunci dari perubahan." confirmLabel="Terbitkan surat" onConfirm={()=>{setPublish(false);void persist(true)}} onCancel={()=>setPublish(false)}/>}
  {remove&&<ConfirmDialog title="Hapus dokumen" object={remove.data.fields.projectName||remove.data.fields.purpose||info.docTitle} consequence="Dokumen ini akan dihapus dari arsip." confirmLabel="Hapus dokumen" deleteAction onConfirm={()=>deleteDoc(remove)} onCancel={()=>setRemove(null)}/>}
  </div>;
}

function PaperTable({rows,riskLevels=false}: {rows:string[][];riskLevels?:boolean}) {
  return <table className="space-top"><thead><tr>{rows[0].map((x,i)=><th key={i}>{x}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i)=><tr key={i}>{row.map((x,j)=><td key={j}>{riskLevels&&(j===3||j===4)?<Pill tone={riskTone(x)}>{x}</Pill>:x}</td>)}</tr>)}</tbody></table>;
}
function Signature({label,value,change,disabled}: {label:string;value:string;disabled:boolean;change:(value:string)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const request=useRef(0);
  useEffect(()=>()=>{request.current++},[]);
  async function upload(file:File){
    const token=++request.current;
    setPending(true);setError('');
    try{
      const signature=await documentImage(file,440);
      if(token===request.current){change(signature);setError('')}
    }catch(error){if(token===request.current)setError(file.name+'. '+(error as Error).message)}
    finally{if(token===request.current)setPending(false)}
  }
  function draw(e:PointerEvent<HTMLCanvasElement>,start=false) {
    if(disabled||pending)return;
    const element=e.currentTarget, bounds=element.getBoundingClientRect(),ctx=element.getContext('2d')!;
    const x=(e.clientX-bounds.left)*element.width/bounds.width,y=(e.clientY-bounds.top)*element.height/bounds.height;
    if(start){
      element.setPointerCapture(e.pointerId);drawing.current=true;ctx.strokeStyle='#102052';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.1,y);ctx.stroke();
    }else if(drawing.current){ctx.lineTo(x,y);ctx.stroke()}
  }
  return <div className="signature-field"><strong>{label}</strong>{value?<img src={value} alt={'Tanda tangan '+label}/>:<canvas width={440} height={130} ref={canvas} onPointerDown={e=>draw(e,true)} onPointerMove={e=>draw(e)} onPointerCancel={()=>{drawing.current=false}} onPointerUp={()=>{if(drawing.current){drawing.current=false;request.current++;change(canvas.current!.toDataURL('image/png'))}}}/>}<div className="heading-actions"><input ref={input} hidden aria-label={'File tanda tangan '+label} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||pending} onChange={event=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';
    if(!disabled&&file)void upload(file);
  }}/><Button className="button" type="button" disabled={disabled} pending={pending?'Menyiapkan tanda tangan…':undefined} onClick={()=>input.current?.click()} aria-label={(value?'Ganti ':'Unggah ')+label}><ImagePlus size={15}/> {value?'Ganti':'Unggah'}</Button>
  {value&&<Button className="button danger-text" type="button" disabled={disabled||pending} aria-label={'Hapus tanda tangan '+label} onClick={()=>{request.current++;setError('');change('')}}><NavIcon name="trash"/> Hapus</Button>}</div>{error&&<ErrorBox message={error}/>}</div>;
}

const tabs=[{id:'main',label:'WBS'},{id:'scheduling',label:'Linimasa'},{id:'report',label:'Laporan Mingguan'}];
function templateFor(project?:ProjectRow){
  return resolvePillar(project?.pillar??'')?.operationsTemplate??'application';
}
export function Operations({projects,user,notify}: {projects:ProjectRow[];user:User;notify:(message:string)=>void}) {
  const writable=['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','PM'].includes(user.role);
  const own=(pid:string)=>user.role!=='PM'||projects.some(p=>pid===p.id&&p.detail.pm.trim().toLowerCase()===user.name.trim().toLowerCase());
  const [project,setProject]=useState(()=>projects.find(p=>own(p.id))?.id||projects[0]?.id||'');
  const [tab,setTab]=useState(()=>{const saved=sessionStorage.getItem('ops-tab');return tabs.some(({id})=>id===saved)?saved!:'main'});
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
  const pendingRef=useRef<typeof pending>(null);
  const [metrics,setMetrics]=useState<Metrics|null>(null);
  const [template,setTemplate]=useState<string>(()=>templateFor(projects.find(p=>p.id===project)));
  const [reportPreview,setReportPreview]=useState(false);
  const [confirmTemplate,setConfirmTemplate]=useState<'apply'|'reset'>();
  const [confirmImport,setConfirmImport]=useState(false);
  const [frameConfirm,setFrameConfirm]=useState<{id:string;title:string;object:string;consequence:string;label:string}>();
  const [error,setError]=useState('');
  const [state,setState]=useState('');
  const frame=useRef<HTMLIFrameElement>(null);
  const reportPaper=useRef<HTMLElement>(null);
  const saving=useRef(false);
  const guard=useProjectEditGuard(Boolean(pending),()=>saving.current,()=>{
    pendingRef.current=null;
    setPending(null);
  });
  const selected=projects.find(p=>p.id===project);
  const reportName='Laporan-Mingguan-'+project+'-W'+(metrics?.week??0);
  const logbook=useWeeklyLogbook(project,tab==='report'?metrics?.week:undefined);
  const entries=logbook.record?.data.entries??[];
  const selectedTemplate=confirmTemplate==='reset'?templateFor(selected):template;
  const templateLabel=pillarOptions.find(option=>option.operationsTemplate===selectedTemplate)?.label;
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
      if(msg.type==='shockwave-operations-workbook'&&msg.project===project){
        if(msg.blob instanceof Blob&&msg.blob.size>0&&msg.blob.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          &&typeof msg.name==='string'&&/^[\w-]+\.xlsx$/.test(msg.name)){
          downloadFile(msg.blob,msg.name);
        }else setError('File Excel Operasional tidak valid.');
        return;
      }
      if(msg?.type==='shockwave-operations-ready'&&msg.project===project){
        setReadyFrame(frameKey);
        return;
      }
      if(msg?.type==='shockwave-operations-load-error'&&msg.project===project){
        setFailedFrame(frameKey);
        return;
      }
      if(msg?.type==='shockwave-operations-height')setHeight(Math.max(340,Math.min(15000,Number(msg.height)||0)));
      if(msg.type==='shockwave-operations-change'&&writable&&own(project)&&msg.project===project){
        const next={project,data:msg.data};
        pendingRef.current=next;
        setPending(next);
        if(!saving.current)setState('Perubahan belum disimpan');
      }
      if(msg.type==='shockwave-operations-confirm'&&msg.project===project&&writable&&own(project)
        &&[msg.id,msg.title,msg.object,msg.consequence,msg.label].every(value=>typeof value==='string')){
        setFrameConfirm({id:msg.id,title:msg.title,object:msg.object,consequence:msg.consequence,label:msg.label});
      }
      if(msg.type==='shockwave-operations-metrics'&&msg.project===project)setMetrics(msg.metrics);
    }
    addEventListener('message',event);return()=>removeEventListener('message',event);
  },[project,writable,frameKey]);
  function sendOperation(action:string){
    if(!editorReady)return;
    frame.current?.contentWindow?.postMessage({type:'shockwave-operations-action',action},location.origin);
  }
  function respondToFrame(accepted:boolean){
    if(!frameConfirm)return;
    frame.current?.contentWindow?.postMessage({type:'shockwave-operations-confirm-result',id:frameConfirm.id,accepted},location.origin);
    setFrameConfirm(undefined);
  }
  function initialize(target:HTMLIFrameElement){
    if(target!==frame.current)return;
    const record=records.find(row=>row.id===project);
    target.contentWindow?.postMessage({type:'shockwave-operations-load',data:record?.data, name:selected?.detail.name,template:templateFor(selected),readonly:!writable||!own(project)},location.origin);
  }
  async function save(){
    const request=pendingRef.current;
    if(!request||saving.current)return false;
    saving.current=true;setState('Menyimpan…');setError('');
    try {
      const version=records?.find(row=>row.id===request.project)?.version??0;
      const result=await api<Saved<Record<string,unknown>>>('/documents/operations/'+request.project,'PUT',{version,data:request.data});
      setRecords(rows=>[result,...(rows??[]).filter(row=>row.id!==result.id)]);
      const current=pendingRef.current===request;
      if(current){pendingRef.current=null;setPending(null)}
      setState(current?'Tersimpan':'Perubahan belum disimpan');
      return current;
    }catch(e){setError((e as Error).message);setState('Gagal menyimpan');return false}finally{saving.current=false}
  }
  useEffect(()=>{
    if(!pending||guard.confirming||state==='Gagal menyimpan'||state==='Menyimpan…')return;
    const timer=setTimeout(()=>void save(),1500);return()=>clearTimeout(timer);
  },[pending,state,guard.confirming]);
  async function switchTo(next:string, nextTab:string){
    if(next===project&&nextTab===tab)return;
    if(saving.current||pendingRef.current&&!await save())return;
    if(next!==project)setTemplate(templateFor(projects.find(p=>p.id===next)));
    setFrameAttempt(value=>value+1);setProject(next);setTab(nextTab);sessionStorage.setItem('ops-tab',nextTab);setMetrics(null);setReportPreview(false);setState('');
  }
  const planMenu=writable&&own(project)&&<ActionMenu label="Tindakan lainnya" disabled={!editorReady} items={[
        {id:'template',label:'Templat Excel',icon:<FormatIcon format="Excel"/>,run:()=>sendOperation('template')},
        {id:'import',label:'Impor Excel',icon:<FileUp size={16} aria-hidden="true"/>,run:()=>setConfirmImport(true)},
        ...(tab==='main'?[{id:'reset',label:templateFor(selected)==='application'?'Kembali ke contoh Software Development':'Kembali ke templat proyek',
          icon:<RotateCcw size={16} aria-hidden="true"/>,run:()=>setConfirmTemplate('reset')}]:[]),
      ]}/>;
  return <><Heading title="Operasional" description={selected?<>{selected.id} · {selected.detail.name} <Pill tone="violet">{selected.pillar}</Pill></>:'Pilih proyek untuk membuka rencana kerja.'} actions={<><div className="field ops-project-picker"><label htmlFor="ops-project">Ganti proyek</label>
        <SearchableSelect id="ops-project" label="Ganti proyek" value={project} emptyLabel="Pilih proyek" required disabled={!projects.length||state==='Menyimpan…'}
          options={projects.map(p=>({id:p.id,label:p.id+' · '+p.detail.name}))}
          onChange={next=>void switchTo(next,tab)}/></div>{writable&&own(project)&&<Button className="button" disabled={!pending||state==='Menyimpan…'} onClick={async()=>{if(await save())notify('Rencana operasional disimpan.')}}><Save size={16}/> {state==='Gagal menyimpan'?'Coba simpan lagi':'Simpan'}</Button>}</>}/>
    <p className="muted ops-save-status" role="status">{state}</p>
    <TabWorkspace label="Area Operasional" tabs={tabs} value={tab} onChange={next=>void switchTo(project,next)}>
    {error&&<ErrorBox message={error}/>}
    {tab!=='report'&&<div className="heading-actions ops-tools wbs-toolbar">
      {tab==='main'&&writable&&own(project)&&<>
        <label className="field wbs-template-picker">Pilar templat<Select value={template} onChange={e=>setTemplate(e.target.value)} disabled={!editorReady}>
          {pillarOptions.map(option=><option key={option.id} value={option.operationsTemplate}>{option.label}</option>)}
        </Select></label>
        <Button className="button" disabled={!editorReady} onClick={()=>setConfirmTemplate('apply')}>
          {template==='application'?<><NavIcon name="sample"/> Muat contoh</>:'Terapkan templat'}
        </Button>
      </>}
      {planMenu}
      <Button className="button" disabled={!editorReady} onClick={()=>sendOperation('export')}><FormatIcon format="Excel"/> Ekspor data Excel</Button>
    </div>}
    {tab==='report'&&<div className="weekly-report-toolbar">
      <div className="muted">{selected?.id} {metrics&&<>· Minggu {metrics.week}</>}</div>
      <div className="heading-actions">
      <Button className="button" disabled={!metrics||!logbook.record} onClick={()=>setReportPreview(true)}><FileText size={15}/> Pratinjau laporan</Button>
      {metrics&&logbook.record&&<>
        <DocumentExport paper={reportPaper} name={reportName} onError={setError}/>
        <div hidden><WeeklyReportDocument paper={reportPaper} project={selected?.detail.name||project} metrics={metrics} entries={entries}/></div>
      </>}
      {planMenu}</div>
    </div>}
    {reportPreview&&metrics&&logbook.record&&<WeeklyReportPreview project={selected?.detail.name||project} metrics={metrics} name={reportName} entries={entries} close={()=>setReportPreview(false)}/>}
    {tab==='report'&&writable&&<SessionDocumentLogo scope="operations"/>}
    {tab==='report'&&metrics&&<Curve metrics={metrics} select={week=>frame.current?.contentWindow?.postMessage({type:'shockwave-operations-week',week},location.origin)}/>}

    {!project?<Empty>Pilih proyek untuk membuka rencana.</Empty>:<>
      {(recordsLoading||recordsError)&&<LoadingArea message="Memuat data Operasional…" error={recordsError} retry={retryRecords}/>}
      {editorAvailable&&!editorReady&&<LoadingArea message={'Memuat rencana kerja'+(selected?' · '+selected.id+' ' +selected.detail.name:'')+'…'}
        error={editorFailed?'Editor Operasional belum dapat dibuka.':undefined}
        retry={()=>{setFrameAttempt(attempt=>attempt+1);setMetrics(null)}}/>}
      {editorAvailable&&!editorFailed&&<iframe title="Editor operasional" key={frameKey} className="ops-frame" ref={frame}
        src={'/fase-1/operations.html?project='+encodeURIComponent(project)+'&tab='+tab+'&v=wbs-inline'}
        style={{height:editorReady?height:0,visibility:editorReady?'visible':'hidden'}}
        tabIndex={editorReady?undefined:-1} aria-hidden={!editorReady} onLoad={event=>initialize(event.currentTarget)}/>}
    </>}
    {tab==='report'&&metrics&&<WeeklyLogbook key={project+'/'+metrics.week} week={metrics.week} weekDate={metrics.weekDate} editable={writable&&own(project)} logbook={logbook} notify={notify}/>}
    </TabWorkspace>
    {guard.confirming&&<ConfirmDialog title="Buang perubahan" object={selected?.detail.name||'Rencana kerja'}
      consequence="Perubahan yang belum tersimpan akan dibuang." cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan"
      danger onCancel={guard.continueEditing} onConfirm={guard.discardChanges}/>}
    {frameConfirm&&<ConfirmDialog title={frameConfirm.title} object={frameConfirm.object} consequence={frameConfirm.consequence}
      confirmLabel={frameConfirm.label} danger deleteAction={frameConfirm.label.startsWith('Hapus')} onCancel={()=>respondToFrame(false)} onConfirm={()=>respondToFrame(true)}/>}
    {confirmImport&&<ConfirmDialog title="Impor rencana kerja" object={selected?.detail.name||project}
      consequence="Data WBS, linimasa, aktual, atau kendala yang disertakan di Excel dapat mengganti data proyek saat ini."
      confirmLabel="Pilih file Excel" onCancel={()=>setConfirmImport(false)}
      onConfirm={()=>{setConfirmImport(false);sendOperation('import')}}/>}
    {confirmTemplate&&<ConfirmDialog
      title="Ganti rencana proyek" object={selected?.detail.name||project}
      consequence={'WBS, linimasa, progres aktual, catatan, dan kendala saat ini akan diganti dengan '+
        (selectedTemplate==='application'?'data contoh Software Development, termasuk progres aktual dan catatan dummy.':'templat '+templateLabel+'.')}
      confirmLabel="Ganti rencana"
      onCancel={()=>setConfirmTemplate(undefined)} onConfirm={()=>{
        setConfirmTemplate(undefined);
        if(!editorReady||!writable||!own(project))return;
        setTemplate(selectedTemplate);
        frame.current?.contentWindow?.postMessage({type:'shockwave-operations-template',template:selectedTemplate},location.origin);
      }}/>}

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
    <div className="split"><h2>Kurva S</h2><Select aria-label="Minggu Kurva S" value={week} onChange={e=>select(+e.target.value)}>{dates.map((date,i)=><option value={i} key={i}>W{i} · {date}</option>)}</Select></div>
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
