import { ChevronLeft, ChevronRight, CircleAlert, FolderOpen, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { formatContractValue, pillars, type ProjectRow } from '../../../packages/shared/domain';
import { projectDraft, validateProjectDraft, type ProjectCatalog, type ProjectDraft, type ProjectErrors } from '../../../packages/shared/project-entry';
import { downloadFile } from './download';
import { ProjectFields } from './project-fields';
import { spreadsheetType } from './workspace-workbooks';
import { ProjectImport } from './project-import';
import { api, DataTable, dateLabel, Dialog, ErrorBox, Heading, Meter, PendingButton, PendingStatus, Pill, rupiah, type Column } from './ui';

const palette = ['#138e82','#7655e6','#2656df'];

function ActionIcon({name}:{name:'download'|'upload'|'add'}){
  return <span className={'project-action-icon '+name} aria-hidden="true"/>;
}

export function Projects({projects,catalog,catalogError,canImport,canManage, reload, notify, openProject, renderDrawer}: {
  projects:ProjectRow[]; catalog?:ProjectCatalog;catalogError:string;canImport:boolean; canManage:boolean; reload:()=>Promise<void>; notify:(text:string)=>void; openProject:(project:ProjectRow)=>void; renderDrawer:(ordered:ProjectRow[])=>ReactNode;
}) {
  const [status,setStatus]=useState('');
  const [pillar,setPillar]=useState('');
  const [q,setQ]=useState('');
  const [verify,setVerify]=useState(false);
  const [overlay,setOverlay]=useState<'add'|'import'>();
  const [exporting,setExporting]=useState(false);
  const exportPending=useRef(false);
  const active=projects.filter(p=>p.status==='Aktif').length;
  const complete=projects.filter(p=>p.status==='Selesai').length;
  const verifyCount=projects.filter(p=>p.verification).length;
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
  if(pillar) params.set('pillar',pillar);
  if(q.trim()) params.set('q',q.trim());
  if(verify) params.set('verification','true');
  const filters = params.toString();
  const query = q.trim().toLowerCase();
  const filtered = projects.filter(p=>(!status||p.status===status)&&(!pillar||p.pillar===pillar)&&(!verify||p.verification)&&
    [p.id,p.detail.name,p.detail.customer,p.detail.pm,p.pillar,p.sub].join(' ').toLowerCase().includes(query))
    .sort((a,b)=>pillars.indexOf(a.pillar)-pillars.indexOf(b.pillar));
  function clear() {setStatus('');setPillar('');setQ('');setVerify(false)}
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
    {id:'number',label:'No', className:'col-number',sort:p=>p.number,render:p=><span className="muted row-number">{String(p.number).padStart(2,'0')}</span>},
    {id:'name',label:'Proyek',className:'col-project',sort:p=>p.detail.name,render:p=><><button className="table-link" onClick={()=>openProject(p)}>{p.detail.name}</button>{p.verification&&<div className="verification"><CircleAlert size={12}/>{p.id==='P004'&&!p.references?.customerId?'Pelanggan & periode tertukar di sumber':'Perlu verifikasi data sumber'}</div>}</>},
    {id:'pillar',label:'Pilar',className:'col-pillar',sort:p=>pillars.indexOf(p.pillar),render:p=><div className="pillar-cell"><i style={{background:palette[pillars.indexOf(p.pillar)]}}/><div>{p.pillar}<small>{p.sub}</small></div></div>},
    {id:'customer',label:'Pelanggan',className:'col-customer',sort:p=>p.detail.customer,render:p=><span>{p.id==='P004'&&p.verification&&!p.references?.customerId?'—':p.detail.customer||'—'}</span>},
    {id:'pm',label:'PM',className:'col-pm',sort:p=>p.detail.pm,render:p=>p.detail.pm||'—'},
    {id:'end',label:'Berakhir',className:'col-end',sort:p=>p.end||'',render:p=>dateLabel(p.end,'month')},
    {id:'revenue',label:'Pendapatan 2026',className:'col-revenue',sort:p=>p.actual,render:p=><div className="row-revenue"><div><strong>{p.actualAvailable?rupiah(p.actual):'—'}</strong>{p.actualAvailable&&p.planAvailable&&p.plan>0&&<span>{p.percent}%</span>}</div>
      {p.actualAvailable&&p.planAvailable&&p.plan>0&&<Meter value={p.percent}/>}
      <small>{p.planAvailable?'Prognosa '+rupiah(p.plan):'Prognosa belum tersedia'}</small></div>},
    {id:'status',label:'Status',className:'col-status',sort:p=>p.status,render:p=><Pill dot tone={p.status==='Aktif'?'green':'neutral'}>{p.status}</Pill>},
    {id:'open',label:'',className:'col-open',render:p=><button className="icon-button row-arrow" onClick={()=>openProject(p)} aria-label={'Lihat '+p.detail.name}><ChevronRight size={17}/></button>},
  ];
  return <>
    <Heading title="Proyek" description="Pantau portofolio proyek, realisasi pendapatan, dan status kontrak." actions={<>
      <PendingStatus hidden message={exporting?'Menyiapkan Excel…':undefined}/>
      <PendingButton className="button" pending={exporting?'Menyiapkan Excel…':undefined} onClick={()=>void exportProjects()}>
        <ActionIcon name="download"/> Ekspor Excel
      </PendingButton>
      {canImport&&<button className="button" disabled={!catalog} onClick={()=>setOverlay('import')}><ActionIcon name="upload"/> Impor Excel</button>}
      {canManage&&<button className="button primary" disabled={!catalog} onClick={()=>setOverlay('add')}><ActionIcon name="add"/> Tambah proyek</button>}
    </>}/>
    {catalogError&&<ErrorBox message={'Referensi proyek gagal dimuat. '+catalogError}/>}
    <section className="panel project-overview" aria-label="Ringkasan portofolio">
      <div className="revenue-main">
        <div className="revenue-label">Pendapatan 2026 terealisasi</div>
        <div className="hero-number">{recorded.length?rupiah(actual):'—'}</div>
        <div className="secondary">Prognosa <strong>{planned.length?rupiah(plan):'—'}</strong></div>
        {actual>0&&<div className="composition" aria-label="Komposisi pendapatan per pilar">{composition.map((items,index)=>{
          const total=items.reduce((sum,p)=>sum+p.actual,0);
          return total>0&&<button type="button" key={pillars[index]} style={{width:(100*total/actual)+'%',background:palette[index]}}
            aria-label={'Filter '+pillars[index]} title={pillars[index]+' · '+rupiah(total)} onClick={()=>setPillar(pillar===pillars[index]?'':pillars[index])}/>;
        })}</div>}
        <div className="composition-labels">{composition.map((items,index)=><button key={pillars[index]} onClick={()=>setPillar(pillar===pillars[index]?'':pillars[index])}>
          <i style={{background:palette[index]}}/><span>{pillars[index]}</span><strong>{items.length?rupiah(items.reduce((sum,p)=>sum+p.actual,0)).replace('Rp ',''):'—'}</strong></button>)}</div>
      </div>
      <div className="overview-stats">
        <button className="overview-stat" onClick={()=>setStatus(status==='Aktif'?'':'Aktif')} aria-pressed={status==='Aktif'}><span>Proyek aktif</span><strong>{active}</strong><small>{projects.length?Math.round(100*active/projects.length):0}% dari {projects.length} proyek</small></button>
        <button className="overview-stat" onClick={()=>setStatus(status==='Selesai'?'':'Selesai')} aria-pressed={status==='Selesai'}><span>Selesai</span><strong>{complete}</strong><small>Status ditetapkan manual</small></button>
        <div className="overview-stat static-stat"><span>Realisasi</span><strong className="blue-text">{realization===null?'—':realization+'%'}</strong><small>Untuk proyek dengan realisasi dan prognosa</small></div>
        <button className="overview-stat" onClick={()=>setVerify(!verify)} aria-pressed={verify}><span>Perlu verifikasi</span><strong className="amber-text">{verifyCount}</strong><small>Data sumber perlu diperiksa</small></button>
      </div>
    </section>
    <section className="panel projects-panel" aria-label="Daftar proyek">
      <div className="table-heading"><div><h2>Daftar proyek</h2><p>{filtered.length} dari {projects.length} proyek</p></div></div>
      <div className="table-toolbar">
        <div className="chips">
          {[['','Semua',projects.length],['Aktif','Aktif',active],['Selesai','Selesai',complete]].map(([value,label,count])=><button className={'chip '+(status===value?'selected':'')} key={label} onClick={()=>setStatus(String(value))} aria-pressed={status===value}>{label}<span>{count}</span></button>)}
          <span className="chip-divider"/>
          {pillars.map((value,index)=><button className={'chip pillar-chip '+(pillar===value?'filter-selected':'')} key={value} onClick={()=>setPillar(pillar===value?'':value)} aria-pressed={pillar===value}><i style={{background:palette[index]}}/>{value}</button>)}
          {verify&&<button className="chip filter-selected" onClick={()=>setVerify(false)}>Perlu verifikasi <X size={13}/></button>}
        </div>
        <label className="search-box"><Search size={16}/><input placeholder="Cari nama, pelanggan, PM" value={q} onChange={e=>setQ(e.target.value)} aria-label="Cari proyek"/>{q&&<button className="icon-button" onClick={()=>setQ('')} aria-label="Hapus pencarian"><X size={13}/></button>}</label>
      </div>
      {filters&&<div className="filter-reset"><button className="subtle-button" onClick={clear}><X size={14}/> Hapus semua filter</button></div>}
      <DataTable rows={filtered} columns={columns} rowKey={row=>row.id} onRow={openProject} searchKey={filters} renderAfter={renderDrawer} rowClass={row=>row.verification?'row-verify':''} empty={<><FolderOpen size={26}/><strong>Proyek tidak ditemukan</strong><span>Coba kata kunci atau filter lain.</span></>}/>
    </section>
    <p className="source-note"><CircleAlert size={14}/> Perubahan Preview tersimpan di browser ini.</p>
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
  for(const field of ['start','end','resourceCount'] as const){
    if((form.elements.namedItem(field) as HTMLInputElement).validity.badInput)result.errors[field]='Periksa format isian.';
  }
  const invalid=Object.keys(result.errors)[0];
  if(invalid)(form.elements.namedItem(invalid) as HTMLElement)?.focus();
  return result.errors;
}

function ProjectForm({catalog,close,saved}: {catalog:ProjectCatalog;close:()=>void;saved:()=>Promise<void>}) {
  const [draft,setDraft]=useState(()=>projectDraft());
  const [errors,setErrors]=useState<ProjectErrors>({});
  const [error,setError]=useState('');
  const [phase,setPhase]=useState<'save'|'refresh'>();
  const busy=Boolean(phase);
  const status=phase==='save'?'Menyimpan proyek…':phase==='refresh'?'Memperbarui daftar…':undefined;
  const [confirm,setConfirm]=useState(false);
  const pending=useRef(false);
  const nameField=useRef<HTMLInputElement>(null);
  const keepEditing=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(confirm)keepEditing.current?.focus();
    else nameField.current?.focus({preventScroll:true});
  },[confirm]);
  function exit(){
    if(pending.current)return;
    if(confirm){setConfirm(false);return;}
    const initial=projectDraft();
    if(Object.keys(initial).some(key=>initial[key as keyof ProjectDraft]!==draft[key as keyof ProjectDraft]))setConfirm(true);
    else close();
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending.current||confirm)return;
    const validation=validateForm(event.currentTarget,draft,catalog);
    setErrors(validation);
    if(Object.keys(validation).length)return;
    pending.current=true;setPhase('save');setError('');
    try{await api('/projects','POST',draft);setPhase('refresh');await saved();}
    catch(error){setError((error as Error).message)}
    finally{pending.current=false;setPhase(undefined)}
  }
  return <Dialog restoreFocus title="Tambah proyek" close={exit} className="project-modal">
    <form className="project-drawer-form" onSubmit={submit} noValidate>
      <div className="dialog-content">
        <ProjectFields draft={draft} errors={errors} catalog={catalog} disabled={busy||confirm} nameField={nameField}
          update={(key,value)=>{setDraft(previous=>({...previous,[key]:value}));setErrors(previous=>({...previous,[key]:undefined}));setError('')}}/>
        {error&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions project-drawer-footer">{confirm?<DiscardActions keepEditing={keepEditing} cancel={()=>setConfirm(false)} discard={close}/>:<>
        <button type="button" className="button" disabled={busy} onClick={exit}>Batal</button>
        <PendingStatus hidden message={status}/><PendingButton className="button primary" pending={status}>Simpan proyek</PendingButton>
      </>}</div>
    </form>
  </Dialog>;
}

function DiscardActions({keepEditing,cancel,discard}:{keepEditing:Ref<HTMLButtonElement>;cancel:()=>void;discard:()=>void}){
  return <>
    <p className="project-confirm-label" role="alert">Buang perubahan yang belum disimpan?</p>
    <button type="button" ref={keepEditing} className="button" onClick={cancel}>Lanjutkan edit</button>
    <button type="button" className="button logout-button" onClick={discard}>Buang perubahan</button>
  </>;
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
  const [confirm,setConfirm] = useState<'close'|'view'|null>(null);
  const [errors,setErrors] = useState<ProjectErrors>({});
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [savedId,setSavedId] = useState<string|null>(null);
  const pending = useRef(false);
  const nameField = useRef<HTMLInputElement>(null);
  const identity = useRef<HTMLHeadingElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  const initial = projectDraft(project);
  const dirty = editing && Object.keys(initial).some(key=>initial[key as keyof ProjectDraft]!==draft[key as keyof ProjectDraft]);
  const index = ordered.findIndex(row=>row.id===project.id);
  const detail = project.detail;

  useEffect(()=>{
    if(confirm) keepEditing.current?.focus({preventScroll:true});
    else if(editing) nameField.current?.focus({preventScroll:true});
    else identity.current?.focus({preventScroll:true});
  },[editing,confirm,project.id]);

  function toView() {
    setDraft(null);
    setConfirm(null);
    setErrors({});
    setError('');
  }

  function requestExit(action:'close'|'view') {
    if(pending.current) return;
    if(confirm){setConfirm(null);return;}
    if(dirty) {setConfirm(action);return;}
    if(action==='close') close();
    else toView();
  }

  function update<K extends keyof ProjectDraft>(key:K,value:ProjectDraft[K]) {
    setDraft(previous=>previous && {...previous,[key]:value});
    setErrors(previous=>({...previous,[key]:undefined}));
    setError('');
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!draft||!catalog||!canManage||pending.current||confirm) return;
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

  return <Dialog restoreFocus title={editing?'Ubah detail proyek':'Detail proyek'} className={'drawer project-drawer'+(editing?' is-editing':'')} close={()=>requestExit('close')}
    headingDetails={<div className="detail-tags"><Pill tone={project.status==='Aktif'?'green':'neutral'} dot>{project.status}</Pill>{project.entrySource&&<Pill>{project.entrySource==='excel'?'Excel':'Manual'}</Pill>}</div>}>
    {draft&&catalog ? <form className="project-drawer-form" onSubmit={submit} noValidate>
      <div className="dialog-content">
        <ProjectFields draft={draft} errors={errors} catalog={catalog} disabled={busy||Boolean(confirm)} previous={project} nameField={nameField} update={update}/>
        {error&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions project-drawer-footer">
        {confirm ? <DiscardActions keepEditing={keepEditing} cancel={()=>setConfirm(null)} discard={confirm==='close'?close:toView}/> : <>
          <button type="button" className="button" disabled={busy} onClick={()=>requestExit('view')}>Batal</button>
          <PendingStatus hidden message={busy?'Menyimpan perubahan…':undefined}/>
          <PendingButton className="button primary" pending={busy?'Menyimpan perubahan…':undefined}>Simpan perubahan</PendingButton>
        </>}
      </div>
    </form> : <>
      <div className="dialog-content project-detail">
        <div className="muted" role="status">{savedId===project.id&&'Detail proyek diperbarui.'}</div>
        <div><h2 ref={identity} tabIndex={-1}>{detail.name}</h2><div className="project-id">{project.id} · {project.pillar}</div></div>
        <ProjectFacts title="Informasi utama" facts={[
          ['Pelanggan',project.id==='P004'&&project.verification&&!project.references?.customerId?'—':detail.customer||'—'],['Project Manager',detail.pm||'—'],
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
        {project.verification&&<div className="warning-box"><CircleAlert size={18}/><span>Data proyek perlu diperiksa ke sumber resmi.</span></div>}
      </div>
      <div className="dialog-actions project-drawer-footer">
        {index>=0&&<nav className="project-drawer-nav" aria-label="Navigasi detail proyek">
          <button type="button" className="icon-button" aria-label="Proyek sebelumnya" title="Sebelumnya" disabled={index===0} onClick={()=>{setSavedId(null);navigate(ordered[index-1])}}><ChevronLeft size={18}/></button>
          <span aria-live="polite">{index+1} dari {ordered.length}</span>
          <button type="button" className="icon-button" aria-label="Proyek berikutnya" title="Berikutnya" disabled={index===ordered.length-1} onClick={()=>{setSavedId(null);navigate(ordered[index+1])}}><ChevronRight size={18}/></button>
        </nav>}
        <button className="button" onClick={close}>Tutup</button>
        {canManage&&<button className="button primary" disabled={!catalog} onClick={()=>{setSavedId(null);setDraft(initial)}}>Ubah detail</button>}
      </div>
    </>}
  </Dialog>;
}
