import { useEffect, useRef, useState } from 'react';
import { lessonAnswers, lessonCounts, lessonDataSchema, lessonDateValid, lessonDateLabel, lessonFinalErrors, lessonSeed, lessonToday,
  moveLessonEntry, moveLessonQuestion, type LessonCategory, type LessonData, type LessonIndex, type LessonItem,
  type LessonProject, type LessonRecord, type LessonStatus, type LessonWrite } from '../../../packages/shared/lesson-learned';
import { Button, ConfirmDialog, Dialog, DataTable, Empty, ErrorBox, Heading, Meter, PendingStatus, Pill, api, ApiError, type User } from './ui';
import { TextInput, Textarea, FieldLabel, Select } from './form-controls';
import { DateInput } from './date-input';
import { SearchableSelect } from './search-select';
import { DocumentWorkspace, DocumentEditorFooter, DocumentPreview } from './document-workspace';
import { useProjectEditGuard } from './project-edit-guard';
import { DownloadMenu, type DownloadFormat } from './download-menu';
import { defaultDocumentLogo } from './document-logo';
import { printDocument } from './document-export';
import { downloadLesson, LessonPaper } from './lesson-learned-document';
import { NavIcon } from './nav-icon';
import { ArrowDown, ArrowUp, ArrowRightLeft, ChevronDown, Pencil, Plus, RotateCcw } from 'lucide-react';
import { ShellBack } from './shell-back';
import { ActionMenu } from './action-menu';
import './lesson-learned.css';

const endpoint='/documents/lesson-learned';
const answerLabels={YES:'Ya',NO:'Tidak',NA:'N/A'};
const statusLabel=(status:LessonStatus)=>status==='FINAL'?'Final':'Draf';
const wib=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'});
const blank=(user:User):LessonData=>({
  projectId:'',projectName:'',preparedByName:user.name,projectManagerName:'',documentDate:lessonToday(),categories:lessonSeed(),description:'',
});
type EditorState={id:string;data:LessonData;record?:LessonRecord;initial:LessonData};
type Confirmation={title:string;object:string;consequence:string;label:string;run:()=>void;also?:()=>void;danger?:boolean};
const editable=(user:User)=>user.role!=='VIEWER';
const errorMessage=(error:unknown)=>(error as Error).message||'Terjadi kesalahan. Coba lagi.';

export function LessonLearned({user,notify}:{user:User;notify:(message:string)=>void}){
  const [index,setIndex]=useState<LessonIndex>();
  const [editor,setEditor]=useState<EditorState|undefined>(()=>{
    if(!editable(user))return undefined;
    const data=blank(user);
    return {id:crypto.randomUUID(),data,initial:data};
  });
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const active=useRef(false);
  const request=useRef(false);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [filterProject,setFilterProject]=useState('');
  const top=useRef<HTMLHeadingElement>(null);

  async function load(){
    if(request.current)return;
    request.current=true;
    setBusy('Memuat dokumen…');setError('');
    try{
      const result=await api<LessonIndex>(endpoint);
      if(active.current)setIndex(result);
    }catch(error){if(active.current)setError(errorMessage(error))}
    finally{request.current=false;if(active.current)setBusy('')}
  }
  useEffect(()=>{
    active.current=true;void load();
    return ()=>{active.current=false};
  },[]);
  function start(){
    const data=blank(user);
    setEditor({id:crypto.randomUUID(),data,initial:data});
  }
  async function open(id:string){
    if(request.current)return;
    request.current=true;
    setError('');setBusy('Membuka dokumen…');
    try{
      const record=await api<LessonRecord>(endpoint+'/'+id);
      if(active.current)setEditor({id,data:record.data,initial:record.data,record});
    }catch(error){if(active.current)setError(errorMessage(error))}
    finally{request.current=false;if(active.current)setBusy('')}
  }
  function close(){
    setEditor(undefined);
    void load();
    requestAnimationFrame(()=>top.current?.focus());
  }
  if(editor&&!index)return <section className="lesson-module"><Heading title="Lesson Learned"/>
    {error?<><ErrorBox message={error}/><Button className="button" onClick={()=>void load()}>Coba lagi</Button></>:<PendingStatus message="Memuat proyek dan dokumen…"/>}
  </section>;
  if(editor&&index)return <LessonEditor key={editor.id} first={editor} projects={index.projects} user={user}
    notify={notify} archive={close} createNew={start}/>;
  const search=query.trim().toLocaleLowerCase('id');
  const records=(index?.records??[]).filter(row=>(!status||row.status===status)&&(!filterProject||row.projectId===filterProject)&&
    [row.projectName,row.preparedByName,row.documentDate,lessonDateLabel(row.documentDate)].join(' ').toLocaleLowerCase('id').includes(search));
  const archiveProjects=new Map(index?.records.map(row=>[row.projectId,row.projectName]));
  return <section className="lesson-module">
    <Heading title="Lesson Learned" description="Susun checklist dan catat pembelajaran dari pelaksanaan proyek." actions={
      editable(user)&&<Button className="button primary" disabled={!index?.projects.length||Boolean(busy)} onClick={start}><RotateCcw size={16} aria-hidden="true"/> Buat checklist baru</Button>
    }/>
    <section className="card lesson-card" aria-busy={Boolean(busy)}>
      <h2 ref={top} tabIndex={-1}>Arsip dokumen</h2>
      {error&&<><ErrorBox message={error}/><Button className="button" onClick={()=>void load()}>Coba lagi</Button></>}
      {busy&&<PendingStatus message={busy}/>}
      {index&&<>
        {editable(user)&&!index.projects.length&&<p className="muted">Akses Proyek diperlukan untuk membuat checklist baru.</p>}
        <div className="lesson-filters">
          <TextInput type="search" aria-label="Cari dokumen Lesson Learned" placeholder="Cari proyek, penyusun, atau tanggal…" value={query} onChange={e=>setQuery(e.target.value)}/>
          <Select aria-label="Status dokumen" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">Semua status</option><option value="DRAFT">Draf</option><option value="FINAL">Final</option>
          </Select>
          <Select aria-label="Filter proyek" value={filterProject} onChange={e=>setFilterProject(e.target.value)}>
            <option value="">Semua proyek</option>{[...archiveProjects].map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </Select>
        </div>
        <DataTable rows={records} searchKey={[search,status,filterProject].join('|')} rowKey={row=>row.id} empty={search||status||filterProject?'Tidak ada dokumen yang cocok.':'Belum ada dokumen Lesson Learned.'}
          columns={[
            {id:'project',label:'Nama proyek',sort:row=>row.projectName,render:row=><Button className="table-link" disabled={Boolean(busy)} onClick={()=>void open(row.id)}>{row.projectName||'Proyek belum diberi nama'}</Button>},
            {id:'author',label:'Disusun oleh',sort:row=>row.preparedByName,render:row=>row.preparedByName||'—'},
            {id:'date',label:'Tanggal dokumen',sort:row=>row.documentDate,render:row=>lessonDateLabel(row.documentDate)||'—'},
            {id:'status',label:'Status',sort:row=>row.status,render:row=><Pill tone={row.status==='FINAL'?'green':'neutral'}>{statusLabel(row.status)}</Pill>},
            {id:'updated',label:'Terakhir diubah',sort:row=>row.updatedAt,render:row=>wib.format(new Date(row.updatedAt))},
          ]}/>
      </>}
    </section>
  </section>;
}

function LessonEditor({first,projects,user,notify,archive,createNew}:{first:EditorState;projects:LessonProject[];user:User;
  notify:(message:string)=>void;archive:()=>void;createNew:()=>void}){
  const [state,setState]=useState(first);
  const [error,setError]=useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const [invalidPaths,setInvalidPaths]=useState<string[]>([]);
  const [dateInvalid,setDateInvalid]=useState(false);
  const [fieldEpoch,setFieldEpoch]=useState(0);
  const [conflict,setConflict]=useState(false);
  const [saving,setSaving]=useState('');
  const [exporting,setExporting]=useState(false);
  const [confirmation,setConfirmation]=useState<Confirmation>();
  const [notice,setNotice]=useState('');
  const [answerPrompts,setAnswerPrompts]=useState<Record<string,string>>({});
  const pending=useRef(false);
  const exportPending=useRef(false);
  const lastAttempt=useRef<LessonWrite>();
  const paper=useRef<HTMLElement>(null);
  const title=useRef<HTMLHeadingElement>(null);
  const [structure,setStructure]=useState(false);
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const {record,data}=state;
  const readonly=record?.status==='FINAL'||!editable(user);
  const dirty=!readonly&&(dateInvalid||JSON.stringify(data)!==JSON.stringify(state.initial));
  const guard=useProjectEditGuard(dirty||Boolean(saving)||exporting,()=>pending.current||exportPending.current,()=>{});
  const counts=lessonCounts(data.categories);
  const needsReview=(item:LessonItem)=>item.answer&&Object.hasOwn(answerPrompts,item.id)&&answerPrompts[item.id]!==item.prompt;
  const pendingReviews=data.categories.flatMap(category=>category.items).some(needsReview);
  const canOutput=record&&!dirty&&!saving;
  const schemaResult=lessonDataSchema.safeParse(data);
  const regularIssues=[
    {id:'ll-project',label:'Pilih proyek',missing:!data.projectId},
    {id:'ll-projectName',label:'Isi nama proyek',missing:!data.projectName.trim()},
    {id:'ll-preparedByName',label:'Isi nama penyusun',missing:!data.preparedByName.trim()},
    {id:'ll-document-date',label:'Isi tanggal dokumen yang valid',missing:dateInvalid||!lessonDateValid(data.documentDate)},
    {id:'ll-projectManagerName',label:'Isi nama Project Manager',missing:!data.projectManagerName.trim()},
  ].filter(item=>item.missing);
  const invalidStructure=!schemaResult.success&&schemaResult.error.issues.some(issue=>issue.path[0]==='categories');
  const ready=!readonly&&!dateInvalid&&!pendingReviews&&schemaResult.success&&lessonFinalErrors(data).length===0;
  const logo=record?.logo??defaultDocumentLogo;

  useEffect(()=>title.current?.focus(),[]);
  function focus(id:string,fallback?:string){
    requestAnimationFrame(()=>{
      const target=(document.getElementById(id)??(fallback?document.getElementById(fallback):null));
      target?.focus();
    });
  }
  function jumpToAnswer(review=false){
    const match=(item:LessonItem)=>review?needsReview(item):!item.answer;
    const group=data.categories.find(category=>category.items.some(match));
    const item=group?.items.find(match);
    if(!group||!item)return;
    if(collapsed.has(group.id))toggleCategory(group.id);
    focus('ll-answer-'+item.id);
  }
  function patch(partial:Partial<LessonData>){
    if(readonly||pending.current||exportPending.current)return;
    setState(previous=>({...previous,data:{...previous.data,...partial}}));
  }
  function categories(next:LessonCategory[]){patch({categories:next})}
  function category(id:string,change:(category:LessonCategory)=>LessonCategory){
    categories(data.categories.map(value=>value.id===id?change(value):value));
  }
  function acknowledge(id:string){
    setAnswerPrompts(previous=>{
      if(!Object.hasOwn(previous,id))return previous;
      const next={...previous};delete next[id];return next;
    });
  }
  function question(parent:string,id:string,partial:Partial<LessonItem>){
    const before=data.categories.find(value=>value.id===parent)?.items.find(item=>item.id===id);
    if(before?.answer&&partial.prompt!==undefined){
      setAnswerPrompts(previous=>Object.hasOwn(previous,id)?previous:{...previous,[id]:before.prompt});
    }
    if(partial.answer!==undefined)acknowledge(id);
    category(parent,value=>({...value,items:value.items.map(item=>item.id===id?{...item,...partial}:item)}));
  }
  function chooseProject(id:string){
    const project=projects.find(value=>value.id===id);
    if(!project||project.id===data.projectId)return;
    const choose=(prefill:boolean)=>patch({
      projectId:id,...(prefill?{projectName:project.name,projectManagerName:project.pm}:{}),
    });
    const old=projects.find(value=>value.id===data.projectId);
    const overridden=data.projectName!==(old?.name??'')||data.projectManagerName!==(old?.pm??'');
    if(overridden||dirty&&data.projectId){
      setConfirmation({title:'Ganti proyek terkait',object:project.name,
        consequence:'Checklist, narasi, penyusun, dan tanggal tetap disimpan dalam isian. Nama proyek dan Project Manager akan diisi dari proyek yang dipilih.',
        label:'Ganti dan isi ulang',run:()=>choose(true),also:()=>choose(false)});
    }else choose(true);
  }
  function addCategory(){
    const id=crypto.randomUUID();
    categories([...data.categories,{id,name:'',items:[]}]);focus('ll-category-'+id);
  }
  function addRow(parent:LessonCategory){
    const id=crypto.randomUUID();
    category(parent.id,value=>({...value,items:[...value.items,{id,prompt:'',answer:null}]}));focus('ll-item-'+id);
  }
  function deleteCategory(value:LessonCategory,index:number){
    setConfirmation({title:'Hapus kategori',object:value.name||'Kategori tanpa nama',
      consequence:value.items.length?value.items.length+' pertanyaan beserta jawabannya akan dihapus.':'Kategori kosong ini akan dihapus.',
      label:'Hapus kategori',danger:true,run:()=>{
        const next=data.categories.filter(category=>category.id!==value.id);
        categories(next);focus('ll-category-'+(next[index]?.id??next[index-1]?.id),'ll-add-category');
      }});
  }
  function deleteRow(parent:LessonCategory,item:LessonItem,index:number){
    setConfirmation({title:'Hapus pertanyaan',object:item.prompt||'Pertanyaan kosong',consequence:'Pertanyaan dan jawabannya akan dihapus.',
      label:'Hapus pertanyaan',danger:true,run:()=>{
        const next=parent.items.filter(value=>value.id!==item.id);
        category(parent.id,value=>({...value,items:next}));
        focus('ll-item-'+(next[index]?.id??next[index-1]?.id),'ll-add-'+parent.id);
      }});
  }
  function orderCategories(from:number,to:number){
    const next=moveLessonEntry(data.categories,from,to);
    if(next===data.categories)return;
    categories(next);setNotice('Kategori dipindahkan ke urutan '+(to+1)+'.');
  }
  function orderRows(parent:LessonCategory,from:number,to:number){
    const next=moveLessonEntry(parent.items,from,to);
    if(next===parent.items)return;
    category(parent.id,value=>({...value,items:next}));setNotice('Pertanyaan dipindahkan ke urutan '+(to+1)+' di kategori ini.');
  }
  function toggleCategory(id:string){
    setCollapsed(current=>{
      const next=new Set(current);
      if(next.has(id))next.delete(id);else next.add(id);
      return next;
    });
  }
  function moveRow(source:string,target:string,id:string){
    const next=moveLessonQuestion(data.categories,source,target,id);
    if(next===data.categories)return;
    if(collapsed.has(target))toggleCategory(target);
    categories(next);setNotice('Pertanyaan dipindahkan ke '+(data.categories.find(category=>category.id===target)?.name||'kategori tanpa nama')+'.');focus('ll-item-'+id);
  }
  function loadSample(){
    setConfirmation({title:'Muat contoh checklist',object:data.projectName||'Lesson Learned',
      consequence:'Kategori, pertanyaan, dan jawaban saat ini akan diganti dengan 17 pertanyaan standar tanpa jawaban.',
      label:'Muat contoh',run:()=>{categories(lessonSeed());setCollapsed(new Set());setNotice('Checklist standar dimuat.')}});
  }
  function check(target:LessonStatus){
    const result=lessonDataSchema.safeParse(data);
    const validation=result.success?[]:result.error.issues.map(issue=>issue.message);
    setInvalidPaths(result.success?[]:result.error.issues.map(issue=>issue.path.join('.')));
    if(pendingReviews)validation.push('Tinjau jawaban pada pertanyaan yang redaksinya diubah.');
    if(dateInvalid)validation.push('Tanggal dokumen tidak valid.');
    if(target==='FINAL')validation.push(...lessonFinalErrors(data));
    setErrors([...new Set(validation)]);
    if(validation.length){if(invalidStructure)setStructure(true);focus('ll-validation');return false}
    return true;
  }
  async function save(target:LessonStatus){
    if(pending.current||readonly||!check(target))return;
    pending.current=true;setSaving(target==='FINAL'?'Memfinalisasi…':'Menyimpan…');setError('');setConflict(false);
    const candidate={expectedVersion:record?.version??0, data,status:target};
    const previous=lastAttempt.current;
    const attempt=previous&&previous.expectedVersion===candidate.expectedVersion&&previous.status===target&&JSON.stringify(previous.data)===JSON.stringify(data)
      ?previous:{...candidate,requestId:crypto.randomUUID()};
    lastAttempt.current=attempt;
    try{
      const saved=await api<LessonRecord>(endpoint+'/'+state.id,'PUT',attempt);
      setState({id:saved.id,record:saved,data:saved.data,initial:saved.data});
      setConfirmation(undefined);lastAttempt.current=undefined;
      notify(target==='FINAL'?'Lesson Learned difinalisasi.':'Draf Lesson Learned disimpan.');
    }catch(error){
      setError(errorMessage(error));setConflict(error instanceof ApiError&&error.status===409);
      setConfirmation(undefined);focus('ll-save-error');
    }finally{pending.current=false;setSaving('')}
  }
  function reloadVersion(){
    setConfirmation({title:'Muat versi tersimpan',object:data.projectName||'Lesson Learned',
      consequence:'Jika versi terbaru berhasil dimuat, isian lokal akan diganti.',label:'Muat versi terbaru',run:()=>{
        setConfirmation(undefined);
        if(pending.current)return;
        pending.current=true;setSaving('Memuat versi…');
        void api<LessonRecord>(endpoint+'/'+state.id).then(latest=>{
          setState({id:latest.id,record:latest,data:latest.data,initial:latest.data});
          setFieldEpoch(value=>value+1);setDateInvalid(false);setAnswerPrompts({});setConflict(false);setError('');setErrors([]);setInvalidPaths([]);
          lastAttempt.current=undefined;
        }).catch(error=>setError(errorMessage(error))).finally(()=>{pending.current=false;setSaving('')});
      }});
  }
  async function output(format?:DownloadFormat){
    if(!canOutput||!paper.current||exportPending.current)return;
    exportPending.current=true;setExporting(true);setError('');
    const name='Lesson Learned - '+(record.data.projectName||record.id).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-')+(record.status==='DRAFT'?' - Draf':'');
    try{
      if(format)await downloadLesson(format,record.data,record.logo,paper.current,name);
      else await printDocument(paper.current,name);
    }catch(error){setError(errorMessage(error));focus('ll-save-error')}
    finally{exportPending.current=false;setExporting(false)}
  }
  const controlsDisabled=readonly||Boolean(saving)||exporting;
  const invalid=(path:string)=>invalidPaths.some(value=>value===path);
  let ordinal=0;
  return <section className="lesson-module">
    <ShellBack label="Arsip Lesson Learned" onClick={()=>guard.exit(archive)}/>
    <div>
    <Heading title="Lesson Learned" description={<><Pill tone={record?.status==='FINAL'?'green':'neutral'}>{record?statusLabel(record.status):'Draf baru'}{dirty?' · Belum disimpan':''}</Pill>
      {!readonly&&<span className="lesson-header-readiness">
        {ready?'Siap finalisasi':!data.projectId?<Button className="table-link" onClick={()=>focus('ll-project')}>Pilih proyek</Button>:
          counts.unanswered?<Button className="table-link" onClick={()=>jumpToAnswer()}>{counts.unanswered} pertanyaan belum terisi</Button>:
          <Button className="table-link" onClick={()=>focus('ll-readiness')}>Lihat kelengkapan dokumen</Button>}
      </span>}
    </>} actions={<>
      <Button className="button" onClick={()=>guard.exit(archive)} disabled={Boolean(saving)||exporting}>Arsip dokumen</Button>
      {editable(user)&&projects.length>0&&<Button className="button" disabled={Boolean(saving)||exporting} onClick={()=>guard.exit(createNew)}><RotateCcw size={16} aria-hidden="true"/> Buat checklist baru</Button>}
      {!readonly&&<Button className="button" disabled={controlsDisabled} onClick={loadSample}><NavIcon name="sample"/> Muat contoh</Button>}
    </>}/>
    <h2 ref={title} className="sr-only" tabIndex={-1}>Editor Lesson Learned</h2>
    {error&&<div id="ll-save-error" tabIndex={-1}><ErrorBox message={error}/>
      {conflict&&<Button className="button" onClick={reloadVersion}>Muat versi terbaru</Button>}
    </div>}
    {errors.length>0&&<div id="ll-validation" className="error-box" tabIndex={-1} role="alert">
      <strong>Periksa isian dokumen</strong><ul>{errors.map(message=><li key={message}>{message}</li>)}</ul>
    </div>}
    <DocumentWorkspace userId={user.id} className="lesson-workspace" preview={
      <DocumentPreview paper={paper} toolbar={<><Pill tone={record?.status==='FINAL'?'green':'neutral'}>{record?statusLabel(record.status):'Draf baru'}</Pill>
        {!readonly&&<span className="muted">{ready?'Siap finalisasi':counts.answered+'/'+counts.total+' terjawab'}</span>}</>}
        actions={canOutput?<><DownloadMenu available={['Word','Excel','PDF']} busy={exporting} download={format=>void output(format)}/>
          <Button className="button" disabled={exporting} onClick={()=>void output()}>Cetak</Button></>:undefined}>
        <LessonPaper data={data} logo={logo} paper={paper}/>
      </DocumentPreview>
    }>
      <div className="lesson-editor">
        <section className="card lesson-card">
          <h3>Identitas dokumen</h3>
          <div className="lesson-identity-grid">
            <div className="lesson-span"><FieldLabel label="Proyek terkait" required/>
              <SearchableSelect id="ll-project" label="Proyek terkait" options={projects.map(project=>({id:project.id,label:project.name,keywords:[project.id,project.pm].join(' ')}))}
                value={data.projectId} legacyLabel={data.projectName} emptyLabel="Pilih proyek" required disabled={controlsDisabled} onChange={chooseProject}/>
            </div>
            {([
              ['projectName','Nama proyek','Modernisasi layanan TI',220],
              ['preparedByName','Disusun oleh','Nama penyusun',160],
              ['projectManagerName','Project Manager','Nama manajer proyek',160],
            ] as const).map(([key,label,placeholder,max])=><label key={key}><FieldLabel label={label} required/>
              <TextInput id={'ll-'+key} value={data[key]} placeholder={placeholder} maxLength={max} readOnly={controlsDisabled} aria-required="true"
                onChange={event=>patch({[key]:event.target.value})}/>
            </label>)}
            <label><FieldLabel label="Tanggal dokumen" required/>
              <DateInput id="ll-document-date" key={fieldEpoch} label="Tanggal dokumen" value={data.documentDate} readOnly={controlsDisabled} aria-required="true"
                onValue={documentDate=>patch({documentDate})} onInvalidDraft={setDateInvalid}/>
            </label>
          </div>
        </section>
        <section className="card lesson-card" id="ll-checklist" tabIndex={-1}>
          <div className="split lesson-checklist-title">
            <h3>Checklist</h3>
            {!readonly&&<Button type="button" className="button" disabled={controlsDisabled} aria-pressed={structure}
              onClick={()=>setStructure(value=>!value)}><Pencil size={15} aria-hidden="true"/> {structure?'Selesai edit struktur':'Edit struktur checklist'}</Button>}
          </div>
          <div className="lesson-counts"><strong>{counts.answered} dari {counts.total} terjawab</strong>
            {!readonly&&counts.unanswered>0&&<Button className="table-link" onClick={()=>jumpToAnswer()}>Ke pertanyaan belum terisi</Button>}
          </div>
          <Meter value={counts.progress*100}/>
          <div className="sr-only" role="status">{notice}</div>
          {!data.categories.length&&<Empty>Belum ada kategori.</Empty>}
          {data.categories.map((value,index)=>{
            const count=lessonCounts([value]);
            const expanded=!collapsed.has(value.id);
            const contentId='ll-category-content-'+value.id;
            return <section className="lesson-category record-group" key={value.id} aria-label={value.name||'Kategori '+(index+1)}>
              <div className="lesson-category-heading">
                <Button type="button" className="icon-button record-toggle" aria-expanded={expanded} aria-controls={contentId}
                  aria-label={(expanded?'Tutup ':'Buka ')+(value.name||'kategori '+(index+1))} onClick={()=>toggleCategory(value.id)}><ChevronDown size={17} aria-hidden="true"/></Button>
                {structure?<TextInput id={'ll-category-'+value.id} aria-label={'Nama kategori '+(index+1)} value={value.name} maxLength={160}
                  aria-invalid={invalid('categories.'+index+'.name')||undefined} readOnly={controlsDisabled} placeholder="Nama kategori"
                  onChange={event=>category(value.id,category=>({...category,name:event.target.value}))}/>:
                  <strong className="lesson-category-name">{value.name||'Kategori tanpa nama'}</strong>}
                <span className="muted">{count.answered} dari {count.total} terjawab</span>
                {structure&&!readonly&&<div className="lesson-row-actions">
                  <OrderButtons name="kategori" disabled={controlsDisabled} index={index} length={data.categories.length} move={to=>orderCategories(index,to)}/>
                  <Button className="icon-button danger" disabled={controlsDisabled} title="Hapus kategori" aria-label={'Hapus kategori '+(value.name||index+1)} onClick={()=>deleteCategory(value,index)}><NavIcon name="trash"/></Button>
                </div>}
              </div>
              <div className="record-details" id={contentId} hidden={!expanded}>
              {!value.items.length?<Empty>Belum ada pertanyaan.</Empty>:<ol className="lesson-question-list">
                {value.items.map((item,row)=>{
                  const number=++ordinal;
                  const promptId='ll-item-'+item.id;
                  return <li key={item.id} className="lesson-question" data-answer={item.answer??undefined}>
                    <span className="lesson-question-number" aria-hidden="true">{number}.</span>
                    {structure?<Textarea id={promptId} aria-label={'Pertanyaan '+number} value={item.prompt} maxLength={1500}
                      readOnly={controlsDisabled} rows={3} placeholder="Tuliskan pertanyaan" aria-invalid={invalid('categories.'+index+'.items.'+row+'.prompt')||undefined}
                      onChange={event=>question(value.id,item.id,{prompt:event.target.value})}/>:
                      <p id={promptId} className="lesson-question-prompt">{item.prompt||'Pertanyaan belum ditulis'}</p>}
                    {readonly?<span className="lesson-question-answer">{item.answer?answerLabels[item.answer]:'Belum terisi'}</span>:
                      <div className="lesson-question-answer">
                        <fieldset className="lesson-answer-options" disabled={controlsDisabled} aria-describedby={promptId}>
                          <legend className="sr-only">Jawaban pertanyaan {number}</legend>
                          {lessonAnswers.map(([answer],index)=><label className="lesson-answer-option" key={answer}>
                            <input type="radio" id={index===0?'ll-answer-'+item.id:undefined} name={'ll-answer-'+item.id}
                              checked={item.answer===answer} onChange={()=>question(value.id,item.id,{answer})}/>
                            <span>{answerLabels[answer]}</span>
                          </label>)}
                        </fieldset>
                        {item.answer?<Button className="table-link" disabled={controlsDisabled} aria-label={'Kosongkan jawaban pertanyaan '+number}
                          onClick={()=>{question(value.id,item.id,{answer:null});focus('ll-answer-'+item.id)}}>Kosongkan</Button>:<small className="muted">Belum terisi</small>}
                        {needsReview(item)&&<><small role="status">Redaksi berubah. Tinjau jawaban ini.</small>
                          <Button type="button" className="button" disabled={controlsDisabled} onClick={()=>{acknowledge(item.id);focus('ll-answer-'+item.id)}}>Pertahankan jawaban</Button></>}
                      </div>}
                    {structure&&!readonly&&<div className="lesson-row-actions lesson-structure-actions">
                      <OrderButtons name={'pertanyaan '+number} disabled={controlsDisabled} index={row} length={value.items.length} move={to=>orderRows(value,row,to)}/>
                      {data.categories.length>1&&<ActionMenu compact disabled={controlsDisabled} label={'Pindahkan pertanyaan '+number}
                        icon={<ArrowRightLeft size={15} aria-hidden="true"/>} items={data.categories.flatMap((target,i)=>target.id===value.id?[]:[{
                          id:target.id,label:(i+1)+'. '+(target.name||'Kategori tanpa nama'),icon:null,run:()=>moveRow(value.id,target.id,item.id),
                        }])}/>}
                      <Button className="icon-button danger" title="Hapus pertanyaan" aria-label={'Hapus pertanyaan '+number} disabled={controlsDisabled} onClick={()=>deleteRow(value,item,row)}><NavIcon name="trash"/></Button>
                    </div>}
                  </li>;
                })}
              </ol>}
              {structure&&!readonly&&<Button id={'ll-add-'+value.id} className="button record-add" disabled={controlsDisabled||counts.total>=300} onClick={()=>addRow(value)}><Plus size={16} aria-hidden="true"/> Tambah baris</Button>}
              </div>
            </section>;
          })}
          {structure&&!readonly&&<Button id="ll-add-category" className="button record-add" disabled={controlsDisabled||data.categories.length>=100} onClick={addCategory}><Plus size={16} aria-hidden="true"/> Tambah kategori</Button>}
        </section>
        <section className="card lesson-card">
          <h3><label htmlFor="ll-description">Deskripsi Lesson Learned</label></h3>
          <Textarea id="ll-description" grow="paragraph" placeholder="Tuliskan pembelajaran dari pelaksanaan proyek." value={data.description}
            maxLength={24000} readOnly={controlsDisabled} onChange={event=>patch({description:event.target.value})}/>
        </section>
        {!readonly&&<section className="card lesson-card">
          <div id="ll-readiness" className="lesson-readiness" tabIndex={-1} aria-live="polite">
            <h3>Kesiapan finalisasi</h3>
            {ready?<Pill tone="green">Siap finalisasi</Pill>:<ul>
              {regularIssues.map(issue=><li key={issue.id}><Button className="table-link" onClick={()=>focus(issue.id)}>{issue.label}</Button></li>)}
              {!counts.total&&<li><Button className="table-link" onClick={()=>{setStructure(true);focus('ll-checklist')}}>Tambahkan minimal satu pertanyaan</Button></li>}
              {counts.unanswered>0&&<li><Button className="table-link" onClick={()=>jumpToAnswer()}>{counts.unanswered} pertanyaan belum terisi</Button></li>}
              {invalidStructure&&<li><Button className="table-link" onClick={()=>{setStructure(true);focus('ll-checklist')}}>Periksa nama kategori dan teks pertanyaan</Button></li>}
              {pendingReviews&&<li><Button className="table-link" onClick={()=>jumpToAnswer(true)}>Tinjau jawaban yang redaksinya berubah</Button></li>}
            </ul>}
          </div>
        </section>}
      </div>
      {!readonly&&<DocumentEditorFooter status={<span role="status">{error?'Belum tersimpan':saving||(!data.projectId?'Pilih proyek untuk menyimpan':ready?'Siap finalisasi':dirty?'Perubahan belum disimpan':record?'Draf tersimpan':'Draf baru')}</span>}>
        <Button className="button" pending={saving==='Menyimpan…'?saving:undefined}
          disabled={!data.projectId||Boolean(record&&!dirty)||Boolean(saving)||exporting} onClick={()=>void save('DRAFT')}>{error?'Coba simpan lagi':'Simpan draf'}</Button>
        <Button className="button primary" disabled={!ready||Boolean(saving)||exporting} aria-describedby="ll-readiness" pending={saving==='Memfinalisasi…'?saving:undefined} onClick={()=>{
          if(check('FINAL'))setConfirmation({title:'Finalisasi Lesson Learned',object:data.projectName,
            consequence:'Isian akan disimpan sebagai dokumen final yang terkunci dan tersedia di arsip.',label:'Finalisasi dokumen',run:()=>void save('FINAL')});
        }}>Finalisasi</Button>
      </DocumentEditorFooter>}
    </DocumentWorkspace>
    </div>
    {confirmation?.also&&<Dialog title={confirmation.title} close={()=>setConfirmation(undefined)} restoreFocus>
      <p><strong>{confirmation.object}</strong></p><p>{confirmation.consequence}</p>
      <div className="dialog-actions">
        <Button className="button" onClick={()=>setConfirmation(undefined)}>Batal</Button>
        <Button className="button" onClick={()=>{confirmation.also?.();setConfirmation(undefined)}}>Ganti dan pertahankan identitas</Button>
        <Button className="button primary" onClick={()=>{confirmation.run();setConfirmation(undefined)}}>{confirmation.label}</Button>
      </div>
    </Dialog>}
    {confirmation&&!confirmation.also&&<ConfirmDialog title={confirmation.title} object={confirmation.object} consequence={confirmation.consequence}
      confirmLabel={confirmation.label} cancelLabel="Batal" danger={confirmation.danger} deleteAction={confirmation.danger}
      pending={saving||undefined} onCancel={()=>{if(!pending.current)setConfirmation(undefined)}} onConfirm={()=>{
        if(pending.current)return;
        if(confirmation.title!=='Finalisasi Lesson Learned')setConfirmation(undefined);
        confirmation.run();
      }}/>}
    {guard.confirming&&<ConfirmDialog title="Buang perubahan Lesson Learned" object={data.projectName||'Checklist baru'}
      consequence="Isian yang belum disimpan akan dibuang." confirmLabel="Buang perubahan" cancelLabel="Lanjutkan edit" danger
      onCancel={guard.continueEditing} onConfirm={guard.discardChanges}/>}
  </section>;
}

function OrderButtons({name,index,length,disabled,move}:{name:string;index:number;length:number;disabled:boolean;move:(to:number)=>void}){
  return <>
    <Button className="icon-button" disabled={disabled} aria-disabled={index===0||undefined} title="Naikkan urutan" aria-label={'Naikkan urutan '+name} onClick={()=>move(index-1)}><ArrowUp size={15}/></Button>
    <Button className="icon-button" disabled={disabled} aria-disabled={index===length-1||undefined} title="Turunkan urutan" aria-label={'Turunkan urutan '+name} onClick={()=>move(index+1)}><ArrowDown size={15}/></Button>
  </>;
}
