import { FilterChips } from './choice-bar';
import { CountUp } from './count-up';
import { FormatIcon } from './download-menu';
import { TextInput } from './form-controls';
import { ChevronLeft, ChevronRight, FolderOpen, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type MutableRefObject } from 'react';
import { formatContractValue, pillars, type Pillar, type ProjectRow } from '../../../packages/shared/domain';
import { projectDraft, validateProjectDraft, type ProjectCatalog, type ProjectDraft, type ProjectErrors } from '../../../packages/shared/project-entry';
import { projectCustomer, selectProjectRows } from '../../../packages/shared/project-list';
import { downloadFile } from './download';
import { ProjectFields } from './project-fields';
import { DiscardProjectChanges, projectDraftChanged, useProjectEditGuard } from './project-edit-guard';
import { spreadsheetType } from './workspace-workbooks';
import { ProjectImport } from './project-import';
import { Button, api, DataTable, dateLabel, Dialog, ErrorBox, Heading, initialTableState, Meter, PendingButton, PendingStatus, Pill, rupiah, type Column, type TableState } from './ui';

const palette = ['var(--pillar-infrastructure)','var(--pillar-service)','var(--pillar-software)'];
export type ProjectListState=TableState&{status:string;pillars:Pillar[];query:string};
export const initialProjectListState:ProjectListState={...initialTableState,status:'',pillars:[],query:''};

function ActionIcon({name}:{name:'download'|'upload'|'add'}){
  return <span className={'project-action-icon '+name} aria-hidden="true"/>;
}

export function Projects({projects,catalog,catalogError,canImport,canManage, reload, notify, openProject, renderDrawer, list, updateList, scroll}: {
  projects:ProjectRow[]; catalog?:ProjectCatalog;catalogError:string;canImport:boolean; canManage:boolean; reload:()=>Promise<void>; notify:(text:string)=>void; openProject:(project:ProjectRow)=>void; renderDrawer:(ordered:ProjectRow[])=>ReactNode;
  list:ProjectListState;updateList:(state:ProjectListState)=>void;scroll:MutableRefObject<number>;
}) {
  const {status,pillars:selected,query:q,sort}=list;
  function filter(change:Partial<ProjectListState>){updateList({...list,...change,page:1})}
  function togglePillar(pillar:Pillar){
    filter({pillars:selected.includes(pillar)?selected.filter(value=>value!==pillar):[...selected,pillar]});
  }
  useLayoutEffect(()=>{
    window.scrollTo(0,scroll.current);
    function remember(){scroll.current=window.scrollY}
    window.addEventListener('scroll',remember,{passive:true});
    return ()=>window.removeEventListener('scroll',remember);
  },[scroll]);
  const [overlay,setOverlay]=useState<'add'|'import'>();
  const [exporting,setExporting]=useState(false);
  const exportPending=useRef(false);
  const active=projects.filter(p=>p.status==='Aktif').length;
  const complete=projects.filter(p=>p.status==='Selesai').length;
  const recorded=projects.filter(p=>p.actualAvailable);
  const planned=projects.filter(p=>p.planAvailable);
  const paired=recorded.filter(p=>p.planAvailable);
  const actual=recorded.reduce((sum,p)=>sum+p.actual,0);
  const plan=planned.reduce((sum,p)=>sum+p.plan,0);
  const pairedPlan=paired.reduce((sum,p)=>sum+p.plan,0);
  const realization=pairedPlan>0?Math.round(100*paired.reduce((sum,p)=>sum+p.actual,0)/pairedPlan):null;
  const composition=pillars.map(pillar=>recorded.filter(p=>p.pillar===pillar));
  const params=new URLSearchParams();
  if(status) params.set('status',status);
  for(const pillar of pillars)if(selected.includes(pillar))params.append('pillar',pillar);
  if(q.trim())params.set('q',q.trim());
  if(sort.id){params.set('sort',sort.id);params.set('direction',sort.direction===-1?'desc':'asc')}
  const filtered=selectProjectRows(projects,params,true);
  const filters=params.toString();
  const hasFilters=status!==initialProjectListState.status||selected.length>0;
  const defaultStatus=useRef<HTMLButtonElement>(null);
  function clear(){
    filter({status:initialProjectListState.status,pillars:initialProjectListState.pillars});
    defaultStatus.current?.focus({preventScroll:true});
  }
  async function exportProjects(){
    if(exportPending.current)return;
    exportPending.current=true;
    setExporting(true);
    try{
      const response=await fetch('/api/v1/projects/export.xlsx?'+filters);
      if(!response.ok||response.headers.get('Content-Type')?.split(';')[0]!==spreadsheetType)
        throw new Error('Ekspor Excel gagal. Coba lagi.');
      const file=await response.blob();
      if(!file.size)throw new Error('File Excel kosong. Coba lagi.');
      downloadFile(file,'Proyek-Shockwave.xlsx');
    }catch(error){notify((error as Error).message)}
    finally{exportPending.current=false;setExporting(false)}
  }
  const columns: Column<ProjectRow>[]=[
    {id:'number',label:'No', className:'col-number',render:(_,index)=><span className="muted row-number">{index+1}</span>},
    {id:'name',label:'Proyek',className:'col-project',sortable:true,render:p=><><button className="table-link" onClick={()=>openProject(p)}>{p.detail.name}</button><small className="block muted">{p.id}</small></>},
    {id:'pillar',label:'Pilar',className:'col-pillar',sortable:true,render:p=><div className="pillar-cell"><i style={{background:palette[pillars.indexOf(p.pillar)]}}/><div>{p.pillar}<small>{p.sub}</small></div></div>},
    {id:'customer',label:'Pelanggan',className:'col-customer',sortable:true,render:p=><span title={projectCustomer(p)||undefined}>{projectCustomer(p)||'—'}</span>},
    {id:'pm',label:'PM',className:'col-pm',sortable:true,render:p=><span className="project-ellipsis" title={p.detail.pm||undefined}>{p.detail.pm||'—'}</span>},
    {id:'end',label:'Berakhir',className:'col-end',sortable:true,render:p=>dateLabel(p.end,'month')},
    {id:'revenue',label:'Pendapatan 2026',className:'col-revenue',sortable:true,render:p=><div className="row-revenue"><div><strong>{p.actualAvailable?rupiah(p.actual):'—'}</strong>{p.actualAvailable&&p.planAvailable&&p.plan>0&&<span>{p.percent}%</span>}</div>
      {p.actualAvailable&&p.planAvailable&&p.plan>0&&<Meter value={p.percent}/>}
      <small>{p.planAvailable?'Prognosa '+rupiah(p.plan):'Prognosa belum tersedia'}</small></div>},
    {id:'status',label:'Status',className:'col-status',sortable:true,render:p=><Pill dot tone={p.status==='Aktif'?'green':'neutral'}>{p.status}</Pill>},
    {id:'open',label:'',className:'col-open',render:p=><button className="icon-button row-arrow" onClick={()=>openProject(p)} aria-label={'Lihat '+p.detail.name}><ChevronRight size={17}/></button>},
  ];
  return <>
    <Heading title="Proyek" description="Pantau portofolio proyek, realisasi pendapatan, dan status kontrak." actions={<>
      <PendingStatus hidden message={exporting?'Menyiapkan Excel…':undefined}/>
      <PendingButton className="button" pending={exporting?'Menyiapkan Excel…':undefined} onClick={()=>void exportProjects()}>
        <FormatIcon format="Excel"/> Ekspor Excel
      </PendingButton>
      {canImport&&<Button className="button" disabled={!catalog} onClick={()=>setOverlay('import')}><ActionIcon name="upload"/> Impor Excel</Button>}
      {canManage&&<Button className="button primary" disabled={!catalog} onClick={()=>setOverlay('add')}><ActionIcon name="add"/> Tambah proyek</Button>}
    </>}/>
    {catalogError&&<ErrorBox message={'Referensi proyek gagal dimuat. '+catalogError}/>}
    <section className="panel project-overview" aria-label="Ringkasan portofolio">
      <div className="revenue-main">
        <div className="revenue-label">Realisasi pendapatan · Seluruh portofolio 2026</div>
        <div className="hero-number"><CountUp value={recorded.length?actual:null} format={rupiah}/></div>
        <div className="secondary">Prognosa <strong><CountUp value={planned.length?plan:null} format={rupiah}/></strong></div>
        {actual>0&&<div className="composition" aria-hidden="true">{composition.map((items,index)=>{
          const total=items.reduce((sum,p)=>sum+p.actual,0);
          return total>0&&<span key={pillars[index]} style={{width:(100*total/actual)+'%',background:palette[index]}}/>;
        })}</div>}
        <div className="composition-labels">{composition.map((items,index)=><div key={pillars[index]}>
          <i style={{background:palette[index]}}/><span>{pillars[index]}</span><strong><CountUp value={items.length?items.reduce((sum,p)=>sum+p.actual,0):null} format={rupiah}/></strong></div>)}</div>
      </div>
      <div className="overview-stats">
        <button className="overview-stat" onClick={()=>filter({status:status==='Aktif'?'':'Aktif'})} aria-pressed={status==='Aktif'}><span>Proyek aktif</span><strong><CountUp value={active}/></strong><small>Dari {projects.length} proyek</small></button>
        <button className="overview-stat" onClick={()=>filter({status:status==='Selesai'?'':'Selesai'})} aria-pressed={status==='Selesai'}><span>Proyek selesai</span><strong><CountUp value={complete}/></strong><small>Dari {projects.length} proyek</small></button>
        <div className="overview-stat static-stat"><span>Capaian prognosa</span><strong className="blue-text"><CountUp value={realization} format={value=>value+'%'}/></strong><small>Untuk proyek dengan realisasi dan prognosa</small></div>
      </div>
    </section>
    <section className="panel projects-panel" aria-label="Daftar proyek">
      <div className="table-heading"><div><h2>Daftar proyek</h2><p role="status">{filtered.length} dari {projects.length} proyek dalam hasil</p></div></div>
      <div className="table-toolbar">
        <div className="project-filter-groups">
          <div className="project-filter-group"><span>Status</span><FilterChips label="Status" choices={[
            {id:'',label:'Semua',count:projects.length},{id:'Aktif',label:'Aktif',count:active},{id:'Selesai',label:'Selesai',count:complete}
          ]} value={status} defaultButton={defaultStatus} onChange={value=>filter({status:value})}/></div>
          <div role="group" aria-label="Pilar" className="project-filter-group"><span>Pilar</span><div className="chips">
          {pillars.map((value,index)=><button type="button" className={'chip pillar-chip '+(selected.includes(value)?'filter-selected':'')} key={value} onClick={()=>togglePillar(value)} aria-pressed={selected.includes(value)}><i style={{background:palette[index]}}/>{value}</button>)}
          </div></div>
          <button type="button" className="subtle-button" disabled={!hasFilters} aria-hidden={!hasFilters||undefined} onClick={clear}>Reset filter</button>
        </div>
        <div className="search-box"><Search size={16}/><TextInput type="search" placeholder="Cari proyek…" value={q} onChange={e=>filter({query:e.target.value})} aria-label="Cari dalam daftar proyek"/>{q&&<button type="button" className="icon-button" onClick={()=>filter({query:''})} aria-label="Hapus pencarian" title="Hapus pencarian"><X size={13}/></button>}</div>
      </div>
      <DataTable rows={filtered} columns={columns} rowKey={row=>row.id} onRow={openProject} state={list}
        stickyHeader onStateChange={table=>updateList({...list,...table})} renderAfter={renderDrawer}
        empty={<><FolderOpen size={26}/><strong>{projects.length?(q.trim()?'Proyek tidak ditemukan':'Tidak ada proyek yang sesuai'):'Belum ada proyek'}</strong>
          <span>{projects.length?(q.trim()?'Coba kata kunci lain.':'Coba kombinasi status atau pilar lain.'):'Proyek yang ditambahkan akan tampil di sini.'}</span>
          {projects.length?(q.trim()?<Button className="button" onClick={()=>filter({query:''})}>Hapus pencarian</Button>:hasFilters&&<Button className="button" onClick={clear}>Reset filter</Button>):
          <div className="heading-actions">{canImport&&catalog&&<Button className="button" onClick={()=>setOverlay('import')}>Impor Excel</Button>}
            {canManage&&catalog&&<Button className="button primary" onClick={()=>setOverlay('add')}>Tambah proyek</Button>}</div>}</>}/>
    </section>
    {catalog&&overlay==='add'&&<ProjectForm catalog={catalog} close={()=>setOverlay(undefined)} saved={async()=>{
      try{await reload();notify('Proyek ditambahkan.')}
      catch{notify('Proyek tersimpan. Daftar belum diperbarui.')}
      finally{setOverlay(undefined)}
    }}/>}
    {catalog&&overlay==='import'&&<ProjectImport catalog={catalog} projects={projects} close={()=>setOverlay(undefined)} reload={reload} notify={notify}/>}
  </>;
}

function validateForm(form:HTMLFormElement,draft:ProjectDraft,catalog:ProjectCatalog,previous?:ProjectRow){
  const result=validateProjectDraft(draft,catalog,previous);
  for(const field of ['start','end'] as const){
    if(form.querySelector<HTMLInputElement>('[data-date-name="'+field+'"]')?.validity.customError)result.errors[field]='Masukkan tanggal dengan format HH/BB/TTTT.';
  }
  const invalid=Object.keys(result.errors)[0];
  if(invalid)(form.querySelector<HTMLElement>('[data-date-name="'+invalid+'"]')??form.elements.namedItem(invalid) as HTMLElement|null)?.focus();
  return result.errors;
}

function ProjectForm({catalog,close,saved}: {catalog:ProjectCatalog;close:()=>void;saved:()=>Promise<void>}) {
  const [draft,setDraft]=useState(()=>projectDraft());
  const [errors,setErrors]=useState<ProjectErrors>({});
  const [error,setError]=useState('');
  const [phase,setPhase]=useState<'save'|'refresh'>();
  const busy=Boolean(phase);
  const status=phase==='save'?'Menyimpan proyek…':phase==='refresh'?'Memperbarui daftar…':undefined;
  const [baseline]=useState(()=>projectDraft());
  const [savedAlready,setSaved]=useState(false);
  const [invalidDates,setInvalidDates]=useState({start:false,end:false});
  const pending=useRef(false);
  const nameField=useRef<HTMLInputElement>(null);
  const dirty=!savedAlready&&(invalidDates.start||invalidDates.end||projectDraftChanged(baseline,draft));
  const guard=useProjectEditGuard(dirty,()=>pending.current,close);
  const exit=()=>guard.exit(close);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending.current||guard.confirming)return;
    const validation=validateForm(event.currentTarget,draft,catalog);
    setErrors(validation);
    if(Object.keys(validation).length)return;
    pending.current=true;setPhase('save');setError('');
    try{await api('/projects','POST',draft);setSaved(true);setPhase('refresh');await saved();}
    catch(error){setError((error as Error).message)}
    finally{pending.current=false;setPhase(undefined)}
  }
  return <Dialog restoreFocus title="Tambah proyek" initialFocus={nameField} close={exit} className="project-modal">
    <form className="project-drawer-form" onSubmit={submit} noValidate>
      <div className="dialog-content">
        <ProjectFields draft={draft} errors={errors} catalog={catalog} disabled={busy} nameField={nameField}
          onInvalidDate={(key,invalid)=>setInvalidDates(previous=>({...previous,[key]:invalid}))}
          update={(key,value)=>{setDraft(previous=>({...previous,[key]:value}));setErrors(previous=>({...previous,[key]:undefined}));setError('')}}/>
        {error&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions project-drawer-footer">
        <Button type="button" className="button" disabled={busy} onClick={exit}>Batal</Button>
        <PendingStatus hidden message={status}/><PendingButton className="button primary" pending={status}>Simpan proyek</PendingButton>
      </div>
    </form>
    <DiscardProjectChanges name={draft.name.trim()||'Proyek baru'} guard={guard}/>
  </Dialog>;
}

function ProjectFacts({title, facts}: {title:string;facts:Array<[string,ReactNode]>}) {
  return <section className="project-facts">
    <h3>{title}</h3>
    <dl className="detail-grid">{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
  </section>;
}

export function ProjectDrawer({project, ordered, catalog, canManage, close, navigate, saved}: {
  project:ProjectRow;
  ordered:ProjectRow[];
  catalog?:ProjectCatalog;
  canManage:boolean;
  close:()=>void;
  navigate:(project:ProjectRow)=>void;
  saved:(project:ProjectRow)=>void;
}) {
  const [draft,setDraft] = useState<ProjectDraft|null>(null);
  const baseline=useRef<ProjectDraft|null>(null);
  const [invalidDates,setInvalidDates]=useState({start:false,end:false});
  const [errors,setErrors] = useState<ProjectErrors>({});
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [savedId,setSavedId] = useState<string|null>(null);
  const pending = useRef(false);
  const nameField = useRef<HTMLInputElement>(null);
  const identity = useRef<HTMLHeadingElement>(null);
  const editing = draft !== null;
  const dirty=Boolean(draft&&baseline.current&&
    (invalidDates.start||invalidDates.end||projectDraftChanged(baseline.current,draft)));
  const guard=useProjectEditGuard(dirty,()=>pending.current,close);
  const index = ordered.findIndex(row=>row.id===project.id);
  const detail = project.detail;

  useEffect(()=>{
    if(editing) nameField.current?.focus({preventScroll:true});
    else identity.current?.focus({preventScroll:true});
  },[editing,project.id]);

  function toView() {
    baseline.current=null;
    setDraft(null);
    setInvalidDates({start:false,end:false});
    setErrors({});
    setError('');
  }

  function update<K extends keyof ProjectDraft>(key:K,value:ProjectDraft[K]) {
    setDraft(previous=>previous && {...previous,[key]:value});
    setErrors(previous=>({...previous,[key]:undefined}));
    setError('');
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!draft||!catalog||!canManage||pending.current||guard.confirming) return;
    const validation=validateForm(event.currentTarget,draft,catalog,project);
    setErrors(validation);
    if(Object.keys(validation).length)return;
    if(!dirty){toView();return;}
    pending.current=true;
    setBusy(true);
    setError('');
    try {
      const updated=await api<ProjectRow>('/projects/'+project.id,'PATCH',draft);
      saved(updated);
      setSavedId(updated.id);
      toView();
    } catch(e){
      setError((e as Error).message);
    } finally {
      pending.current=false;
      setBusy(false);
    }
  }

  return <Dialog restoreFocus title={editing?'Ubah detail proyek':'Detail proyek'} className={'drawer project-drawer '+(editing?'project-drawer-edit':'project-drawer-view')} close={()=>guard.exit(close)}>
    {draft&&catalog ? <form className="project-drawer-form motion-project-mode" onSubmit={submit} noValidate>
      <div className="dialog-content">
        <ProjectFields draft={draft} errors={errors} catalog={catalog} disabled={busy} previous={project} nameField={nameField} update={update}
          onInvalidDate={(key,invalid)=>setInvalidDates(previous=>({...previous,[key]:invalid}))}/>
        {error&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions project-drawer-footer">
          <Button type="button" className="button" disabled={busy} onClick={()=>guard.exit(toView)}>Batal</Button>
          <PendingStatus hidden message={busy?'Menyimpan perubahan…':undefined}/>
          <PendingButton className="button primary" pending={busy?'Menyimpan perubahan…':undefined}>Simpan perubahan</PendingButton>
      </div>
    </form> : <>
      <div className="dialog-content project-detail motion-project-mode">
        <div className="muted" role="status">{savedId===project.id&&'Detail proyek diperbarui.'}</div>
        <div className="project-identity" key={project.id}><div className="detail-tags">
          <span className="project-id">{project.id} · {project.pillar}</span>
          <Pill tone={project.status==='Aktif'?'green':'neutral'} dot>{project.status}</Pill>
          {project.entrySource&&<Pill>{project.entrySource==='excel'?'Excel':'Manual'}</Pill>}
        </div><h2 ref={identity} tabIndex={-1}>{detail.name}</h2></div>
        <ProjectFacts title="Informasi utama" facts={[
          ['Pelanggan',projectCustomer(project)||'—'],['Project Manager',detail.pm||'—'],
          ['Periode kontrak',detail.period||'—'],['Nilai kontrak keseluruhan',formatContractValue(detail.value)],
        ]}/>
        <section className="project-facts">
          <h3>Pendapatan 2026</h3>
          <dl className="detail-grid"><div><dt>Realisasi tahunan</dt><dd><strong>{project.actualAvailable?rupiah(project.actual):'Belum tersedia'}</strong>
            {project.actualAvailable&&project.planAvailable&&project.plan>0&&' · '+project.percent+'%'}</dd></div>
            <div><dt>Prognosa tahunan</dt><dd>{project.planAvailable?rupiah(project.plan):'Belum tersedia'}</dd></div></dl>
          {project.actualAvailable&&project.planAvailable&&project.plan>0&&<Meter value={project.percent}/>}
        </section>
        <ProjectFacts title="Informasi tambahan" facts={[
          ['Sales',detail.sales||'—'],['Ketentuan penagihan',detail.billing||'—'],
          ['Jumlah sumber daya',detail.resourceCount===''?'—':detail.resourceCount],['Catatan SPK / PKS',detail.notes||'—'],
        ]}/>
      </div>
      <div className="dialog-actions project-drawer-footer">
        {index>=0&&<nav className="project-drawer-nav" aria-label="Navigasi detail proyek">
          <button type="button" className="icon-button" aria-label="Proyek sebelumnya" title="Sebelumnya" disabled={index===0} onClick={()=>{setSavedId(null);navigate(ordered[index-1])}}><ChevronLeft size={18}/></button>
          <span aria-live="polite">{index+1} dari {ordered.length}</span>
          <button type="button" className="icon-button" aria-label="Proyek berikutnya" title="Berikutnya" disabled={index===ordered.length-1} onClick={()=>{setSavedId(null);navigate(ordered[index+1])}}><ChevronRight size={18}/></button>
        </nav>}
        <Button className="button" onClick={close}>Tutup</Button>
        {canManage&&<Button className="button primary" disabled={!catalog} onClick={()=>{setSavedId(null);baseline.current=projectDraft(project);setDraft(baseline.current)}}>Ubah detail</Button>}
      </div>
    </>}
    <DiscardProjectChanges name={detail.name} guard={guard}/>
  </Dialog>;
}
