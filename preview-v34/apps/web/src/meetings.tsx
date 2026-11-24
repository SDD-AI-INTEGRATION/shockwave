import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, FileText, LockKeyhole, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { actionStatuses, categoryOptions, formatContractValue, healthOptions, meetingReadiness, previousCondition, reviewText, type Meeting, type ProjectRow, type Review } from '../../../packages/shared/domain';
import { api, ButtonConfirm, DataTable, dateLabel, Dialog, Empty, ErrorBox, Heading, Meter, Pill, PendingButton, PendingStatus, type User } from './ui';
import { LoadingArea, useLoadingList } from './loading-list';
import { DocumentExport } from './document-export';

const nextWeek=(date:string)=>{
  const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+7);return day.toISOString().slice(0,10);
};
const reviewLabels:Record<Review['status'],string>={pending:'Belum ditinjau',updated:'Pembaruan',none:'Sama / belum ada update',source:'Arsip sumber'};
const reviewTones:Record<Review['status'],string>={pending:'amber',updated:'green',none:'violet',source:'neutral'};
const healthTones:Record<Review['health'],string>={'Belum dinilai':'neutral','On Track':'green','Needs Attention':'amber',Critical:'red'};
const canVerify = (user:User)=>['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO'].includes(user.role);
const canEdit = (user:User)=>['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','NOTULIS'].includes(user.role);

export function Meetings({user,projects,notify,onChange,reloadProjects}: {user:User;projects:ProjectRow[];notify:(msg:string)=>void;onChange:(meetings:Meeting[])=>void;reloadProjects:()=>Promise<void>}) {
  const {items:rows,setItems:setRows,loading,error:loadError,retry}=useLoadingList<Meeting>('/meetings',onChange);
  const [current,setCurrent]=useState('');
  const [focusProject,setFocusProject]=useState('');
  const [mode,setMode]=useState<'list'|'work'|'preview'>('list');
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState<Meeting|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [deleteRow,setDeleteRow]=useState<Meeting|null>(null);
  const editable=canEdit(user);

  function put(meeting:Meeting) {
    setRows(old=>{
      const updated=[meeting,...old.filter(row=>row.id!==meeting.id)].sort((a,b)=>b.date.localeCompare(a.date));
      queueMicrotask(()=>onChange(updated));
      return updated;
    });
  }
  function open(row:Meeting,view:'work'|'preview',projectId=''){setCurrent(row.id);setFocusProject(projectId);setMode(view);window.scrollTo(0,0)}
  function back(){setMode('list');setError('');window.scrollTo(0,0)}
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);setError('');
    try{
      const row=editing?await api<Meeting>('/meetings/'+editing.id,'PATCH',{...data,version:editing.version}):await api<Meeting>('/meetings','POST',data);
      put(row);setCreating(false);setEditing(null);
      if(!editing)open(row,'work');
      notify(editing?'Draf rapat diperbarui.':'Draf rapat dibuat.');
    }
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function remove(row:Meeting){
    setDeleteRow(null);setError('');
    try{await api('/meetings/'+row.id,'DELETE',{version:row.version});const updated=rows.filter(m=>m.id!==row.id);setRows(updated);onChange(updated);notify('Draf dihapus.')}
    catch(e){setError((e as Error).message)}
  }
  async function verifyProject(id:string){
    await api('/projects/'+encodeURIComponent(id)+'/verify','POST');
    const [list]=await Promise.all([api<Meeting[]>('/meetings'),reloadProjects()]);
    setRows(list);onChange(list);
    notify('Data sumber proyek ditandai terverifikasi.');
  }
  if(loading||loadError)return <>
    <Heading title="Rapat korporat" description="Tinjauan proyek mingguan dan arsip rapat korporat."/>
    <LoadingArea message="Memuat daftar rapat…" error={loadError} retry={retry}/>
  </>;
  const row=rows.find(row=>row.id===current);
  const selected=row?.status==='draft'?{...row,projects:row.projects.map(p=>({...p,verification:projects.find(source=>source.id===p.id)?.verification??p.verification}))}:row;
  if(mode==='work'&&selected) return <Workspace key={selected.id} initialProject={focusProject} meeting={selected} user={user} put={put} back={back} preview={id=>open(selected,'preview',id)} notify={notify}/>;
  if(mode==='preview'&&selected) return <MeetingPreview meeting={selected} user={user} back={()=>selected.status==='final'?back():open(selected,'work',focusProject)} reviewProject={id=>open(selected,'work',id)} put={put} notify={notify} verifyProject={verifyProject}/>;
  const proposed = rows[0] ? nextWeek(rows[0].date) : nextWeek(new Date().toISOString().slice(0,10));
  const last=[...rows.slice(0,3)].reverse();
  const previous=rows[0];
  const carry=previous?.projects.flatMap(p=>p.review.actions).filter(a=>a.status!=='Selesai').length??0;
  return <><Heading title="Rapat korporat" description="Tinjauan proyek mingguan dan arsip rapat korporat." actions={editable&&<button className="button primary" onClick={()=>{setEditing(null);setCreating(true);setError('')}}><Plus size={17}/> Buat rapat</button>}/>
    {error&&!creating&&<ErrorBox message={error}/>}
    <section className="panel padded timeline-card"><h2>Linimasa rapat</h2><div className="meeting-timeline">{last.map(row=><button onClick={()=>open(row,row.status==='final'?'preview':'work')} key={row.id}><span className={row.status==='final'?'done-marker':'draft-marker'}>{row.status==='final'?<Check size={16}/>:<Clock3 size={16}/>}</span><strong>{dateLabel(row.date,'short')}</strong><small>{row.status==='final'?'Final':'Draf berjalan'}</small></button>)}{editable&&<button onClick={()=>{setEditing(null);setCreating(true);setError('')}}><span className="next-marker"><Plus size={16}/></span><strong>{dateLabel(proposed,'short')}</strong><small>Rapat berikutnya</small></button>}</div></section>
    <section className="panel"><div className="table-heading spaced"><div><h2>Daftar rapat</h2><p>{rows.length} rapat</p></div><label className="search-box"><Search size={15}/><input aria-label="Cari rapat" placeholder="Cari judul atau moderator" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <DataTable rows={rows.filter(row=>[row.title,row.moderator,row.date].join(' ').toLowerCase().includes(query.toLowerCase()))} rowKey={row=>row.id} searchKey={query} columns={[
      {id:'date',label:'Tanggal',sort:r=>r.date,render:r=><strong>{dateLabel(r.date,'short')}</strong>},
      {id:'title',label:'Judul',sort:r=>r.title,render:r=><><button className="table-link" onClick={()=>open(r,r.status==='final'?'preview':'work')}>{r.title}</button><small className="block muted">{r.projects.length} proyek</small></>},
      {id:'moderator',label:'Moderator',sort:r=>r.moderator,render:r=>r.moderator||'—'},
      {id:'status',label:'Status',sort:r=>r.status,render:r=><Pill tone={r.status==='final'?'green':'violet'} dot>{r.status==='final'?'Final':'Draf'}</Pill>},
      {id:'review',label:'Tinjauan',sort:r=>r.projects.filter(p=>p.review.status!=='pending').length,render:r=>{const done=r.projects.filter(p=>p.review.status!=='pending').length;return <div className="meeting-meter"><small>{done} / {r.projects.length}</small><Meter value={r.projects.length?100*done/r.projects.length:0}/></div>}},
      {id:'ref',label:'Referensi',render:r=>dateLabel(r.previousDate,'short')},
      {id:'actions',label:'Tindakan',render:r=><div className="heading-actions"><button className="button" onClick={()=>open(r,r.status==='final'?'preview':'work')}>{r.status==='final'?'Buka dokumen':'Lanjutkan review'} <ArrowRight size={14}/></button>{r.status==='draft'&&<><button className="icon-button" aria-label="Pratinjau dokumen" onClick={()=>open(r,'preview')}><FileText size={17}/></button>{editable&&<button className="icon-button" type="button" aria-label="Ubah rapat" onClick={()=>{setEditing(r);setCreating(true);setError('')}}><Pencil size={16}/></button>}{editable&&!rows.some(m=>m.previousId===r.id)&&<button className="icon-button" aria-label="Hapus draf" onClick={()=>setDeleteRow(r)}><Trash2 size={16}/></button>}</>}</div>},
    ]} empty="Belum ada rapat yang cocok."/></section>
    {creating&&<Dialog title={editing?'Ubah rapat':'Buat rapat'} className="meeting-form-dialog" close={()=>{if(!busy)setCreating(false)}}>
      <form onSubmit={create}>
        <div className="dialog-content fields">
          <label>Tanggal rapat<input name="date" type="date" defaultValue={editing?.date??proposed} readOnly={Boolean(editing&&rows.some(row=>row.previousId===editing.id))} required/></label>
          <label>Judul<input name="title" defaultValue={editing?.title??'Rapat Korporat'} required maxLength={300}/></label>
          <label>Moderator<input name="moderator" defaultValue={editing?.moderator}/></label>
          <label>Catatan<textarea name="notes" defaultValue={editing?.notes}/></label>
          {!editing&&<div className="document-card"><h3>Isi rapat baru</h3><p>{projects.length} proyek akan dimuat untuk ditinjau.</p><p>{carry} tindak lanjut terbuka dari rapat referensi.</p></div>}
          {error&&<ErrorBox message={error}/>}
        </div>
        <div className="dialog-actions"><button className="button" type="button" disabled={busy} onClick={()=>setCreating(false)}>Batal</button><button className="button primary" disabled={busy}>{editing?'Simpan perubahan':'Buat rapat'}</button></div>
      </form>
    </Dialog>}
    {deleteRow&&<ButtonConfirm value="Hapus draf rapat dan tinjauannya?" onCancel={()=>setDeleteRow(null)} onConfirm={()=>remove(deleteRow)}/>}
  </>;
}

function Workspace({meeting,initialProject,user,put,back,preview,notify}: {meeting:Meeting;initialProject:string;user:User;put:(m:Meeting)=>void;back:()=>void;preview:(id:string)=>void;notify:(text:string)=>void}) {
  const [index,setIndex]=useState(()=>Math.max(0,meeting.projects.findIndex(p=>p.id===initialProject)));
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [info,setInfo]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [saveState,setSaveState]=useState('');
  const [conflict,setConflict]=useState(false);
  const project=meeting.projects[index];
  const [current,setCurrent]=useState<Review>(project.review);
  const [detailsOpen,setDetailsOpen]=useState(true);
  const previousHealth=previousCondition(project);
  const conditionChanged=current.status==='updated'&&current.health!==previousHealth;
  const conditionTone=healthTones[current.health];
  const latest = useRef(meeting);
  const path='/meetings/'+meeting.id;
  useEffect(()=>{latest.current=meeting},[meeting]);
  const readiness=meetingReadiness(meeting);
  const own=user.role==='PM'&&project.detail.pm.trim().toLowerCase()===user.name.trim().toLowerCase();
  const editable=meeting.status==='draft'&&(canEdit(user)||own);
  const dirty=current!==project.review && saveState!=='Tersimpan';
  const working=useRef(false);
  const revision=useRef(0);
  function update(input:Partial<Review>) {revision.current++;setCurrent(value=>({...value,...input,status:'updated'}));setSaveState('Perubahan belum disimpan');setError('')}
  async function save(review=current,force=false){
    if(!editable||working.current)return false;
    if(!force&&!dirty)return true;
    const at=revision.current;
    working.current=true;setSaveState('Menyimpan…');setError('');setConflict(false);
    try{
      const result=await api<Meeting>(path+'/projects/'+project.id,'PATCH',{version:latest.current.version,review});
      latest.current=result;put(result);
      if(revision.current===at){setCurrent(result.projects[index].review);setSaveState('Tersimpan')}
      return true;
    } catch(e){setSaveState('Gagal menyimpan');setError((e as Error).message);setConflict((e as Error).message.includes('diubah pengguna lain'));return false}
    finally{working.current=false}
  }
  useEffect(()=>{
    if(!editable||!dirty||saveState==='Gagal menyimpan'||saveState==='Menyimpan…'||saveState.startsWith('Versi server')) return;
    const timer=setTimeout(()=>void save(),1500);
    return ()=>clearTimeout(timer);
  },[current,dirty,editable,saveState]);
  async function reloadLatest() {
    try {
      const fresh=(await api<Meeting[]>('/meetings')).find(row=>row.id===meeting.id);
      if(!fresh) {setError('Draf rapat sudah tidak tersedia.');return;}
      latest.current=fresh;
      put(fresh);
      if(fresh.status==='final'){preview(project.id);return;}
      setConflict(false);setError('');setSaveState('Versi server dimuat. Isian Anda siap disimpan kembali.');
    } catch(e) {setError((e as Error).message)}
  }
  async function move(next:number){
    if(next===index||working.current)return;
    if(dirty&&!await save())return;
    setIndex(next);setDetailsOpen(true);setCurrent(latest.current.projects[next].review);setSaveState('');setError('');
  }
  async function leave(action:()=>void){if(!working.current&&(!dirty||await save()))action()}
  async function unchanged(){setConfirm(false);if(await save({...current,status:'none'},true))notify('Proyek ditandai tanpa perubahan.')}
  function markUnchanged(){
    if(current.status==='none'||working.current)return;
    const hasDraft=current.summary.trim()||current.items.some(item=>item.text.trim())||
      current.actions.some(action=>!action.carried&&(action.text.trim()||action.pic.trim()||action.due))||
      (current.health!=='Belum dinilai'&&current.health!==previousCondition(project));
    if(hasDraft)setConfirm(true);else void unchanged();
  }
  useEffect(()=>{
    function shortcut(e:KeyboardEvent){
      if(e.altKey||e.ctrlKey||e.metaKey||(e.target as Element)?.closest('input,textarea,select,button,[contenteditable]')) return;
      if(e.key.toLowerCase()==='j'&&index<meeting.projects.length-1)void move(index+1);
      if(e.key.toLowerCase()==='k'&&index>0)void move(index-1);
      if(e.key.toLowerCase()==='u'&&editable&&!working.current)markUnchanged();
    }
    window.addEventListener('keydown',shortcut);
    return ()=>window.removeEventListener('keydown',shortcut);
  });
  async function updateInfo(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
    try{const next=await api<Meeting>(path,'PATCH',{...values,version:latest.current.version});put(next);setCurrent(next.projects[index].review);setInfo(false);notify('Info rapat diperbarui.')}
    catch(e){setError((e as Error).message)}
  }
  const addItem=()=>update({items:[...current.items,{category:categoryOptions[0],text:''}]});
  const addAction=()=>update({actions:[...current.actions,{text:'',pic:'',due:'',status:'Belum dimulai'}]});
  return <>
    <div className="back-line"><button className="subtle-button" onClick={()=>leave(back)}><ArrowLeft size={15}/> Daftar rapat</button><span role="status" className="muted">{saveState}</span></div>
    <Heading title="Ruang kerja rapat" description={<>{dateLabel(meeting.previousDate,'short')} – {dateLabel(meeting.date,'short')} <Pill tone="violet">Draf</Pill></>} actions={<>{canEdit(user)&&<button className="button" onClick={()=>leave(()=>setInfo(true))}>Info rapat</button>}<button className="button primary" disabled={saveState==='Menyimpan…'} onClick={()=>leave(()=>preview(project.id))}><FileText size={16}/> Pratinjau dokumen</button></>}/>
    <section className="panel padded review-progress"><div><h2>{readiness.reviewed} dari {readiness.total} proyek ditinjau</h2><Pill dot tone={readiness.ready?'green':'amber'}>{readiness.ready?'Siap difinalkan':readiness.pending.length+' belum ditinjau · '+readiness.incomplete.length+' perlu dilengkapi'}</Pill></div><div className="review-strip">{meeting.projects.map((p,i)=><button onClick={()=>move(i)} title={p.detail.name+' · '+reviewLabels[p.review.status]} aria-label={p.detail.name+' · '+reviewLabels[p.review.status]} key={p.id} className={i===index?'current':p.review.status}>{p.number}</button>)}</div></section>
    {error&&<ErrorBox message={error}/>}
    {conflict&&<div className="heading-actions conflict-actions"><button className="button" onClick={reloadLatest}>Muat versi terbaru, pertahankan isian</button></div>}
    <div className="review-layout"><aside className="panel review-queue"><h3>Antrean proyek</h3><label className="search-box"><Search size={14}/><input placeholder="Cari proyek" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="chips">{[['all','Semua'],['pending','Belum'],['updated','Pembaruan'],['none','Tanpa perubahan']].map(([key,label])=><button key={key} onClick={()=>setFilter(key)} className={'chip '+(filter===key?'selected':'')}>{label}</button>)}</div><div className="queue-list">{meeting.projects.map((p,i)=>({p,i})).filter(({p})=>(filter==='all'||filter===p.review.status)&&p.detail.name.toLowerCase().includes(query.toLowerCase())).map(({p,i})=><button key={p.id} className={i===index?'current':''} onClick={()=>move(i)}><i className={'review-dot '+p.review.status}/><span>{p.detail.name}<small>{p.detail.customer}</small></span></button>)}</div><small className="queue-shortcuts">J / K pindah proyek · U tanpa perubahan</small></aside>
    <section className="panel review-editor"><div className="padded"><Pill tone={current.status==='updated'?'green':current.status==='none'?'violet':'neutral'}>{reviewLabels[current.status]}</Pill><h2 className="space-small">{project.detail.name}</h2><p className="muted project-lock"><LockKeyhole size={13}/> {project.detail.customer||'—'} · PM {project.detail.pm||'—'} · {project.id}</p><details open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>Detail proyek SIMPRO</summary><dl className="detail-grid">{[['Periode',project.detail.period],['Nilai kontrak',project.detail.value],['Sales',project.detail.sales],['Catatan SPK / PKS',project.detail.notes]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></details></div>
    <div className="padded form-section fields"><div className="split"><h3>Ringkasan status</h3>{editable&&<button className="button" onClick={markUnchanged} disabled={current.status==='none'}>Sama / belum ada update</button>}</div><label>Kondisi<select value={current.health} onChange={e=>update({health:e.target.value as Review['health']})} disabled={!editable}>{healthOptions.map(option=><option key={option}>{option}</option>)}</select></label><label>Ringkasan<textarea rows={3} maxLength={16000} placeholder="Tulis ringkasan proyek dalam 1–3 kalimat" value={current.summary} onChange={e=>update({summary:e.target.value})} readOnly={!editable}/><small className="muted">{current.summary.length} karakter</small></label></div>
    <div className="padded form-section fields"><div className="split"><h3>Pembaruan proyek</h3>{editable&&<button className="subtle-button" onClick={addItem}><Plus size={15}/> Tambah</button>}</div>{current.items.length===0&&<p className="muted">Belum ada pembaruan.</p>}{current.items.map((item,i)=><div className="row-editor fields" key={i}><label>Kategori<select value={item.category} onChange={e=>update({items:current.items.map((v,n)=>n===i?{...v,category:e.target.value as typeof item.category}:v)})} disabled={!editable}>{categoryOptions.map(v=><option key={v}>{v}</option>)}</select></label><label>Uraian<textarea value={item.text} readOnly={!editable} onChange={e=>update({items:current.items.map((v,n)=>n===i?{...v,text:e.target.value}:v)})}/></label>{editable&&<button className="subtle-button" onClick={()=>update({items:current.items.filter((_,n)=>n!==i)})}><Trash2 size={14}/> Hapus</button>}</div>)}</div>
    <div className="padded form-section fields"><div className="split"><h3>Tindak lanjut</h3>{editable&&<button className="subtle-button" onClick={addAction}><Plus size={15}/> Tambah</button>}</div>{current.actions.length===0&&<p className="muted">Belum ada tindak lanjut.</p>}{current.actions.map((item,i)=>{
      function edit(values:Partial<typeof item>){update({actions:current.actions.map((v,n)=>n===i?{...v,...values,carried:false}:v)})}
      return <div className="row-editor field-grid" key={i}><label className="span-full">Uraian<textarea value={item.text} readOnly={!editable} onChange={e=>edit({text:e.target.value})}/></label><label>PIC<input value={item.pic} readOnly={!editable} onChange={e=>edit({pic:e.target.value})}/></label><label>Target<input type="date" value={item.due} readOnly={!editable} onChange={e=>edit({due:e.target.value})}/></label><label>Status<select value={item.status} disabled={!editable} onChange={e=>edit({status:e.target.value as typeof item.status})}>{actionStatuses.map(v=><option key={v}>{v}</option>)}</select></label>{editable&&<button className="subtle-button" onClick={()=>update({actions:current.actions.filter((_,n)=>n!==i)})}><Trash2 size={14}/> Hapus</button>}</div>
    })}</div>
    <div className="padded editor-footer">{editable&&<button className="button" disabled={!dirty||saveState==='Menyimpan…'} onClick={()=>save()}>Simpan</button>}<button className="button primary" disabled={saveState==='Menyimpan…'} onClick={()=>index===meeting.projects.length-1?leave(()=>{setIndex(0);setCurrent(latest.current.projects[0].review);setSaveState('')}):move(index+1)}>{editable?'Simpan & lanjut':'Proyek berikutnya'} <ArrowRight size={15}/></button></div></section>
    <aside className="panel padded reference-panel"><h3>Minggu lalu</h3><small className="block muted space-small">{dateLabel(meeting.previousDate,'short')}</small>{project.verification&&<div className="warning-box"><CircleAlert size={15}/> Perlu verifikasi data sumber.</div>}<p className="pre-wrap">{project.previousText||'Belum ada catatan dari rapat referensi.'}</p><h3>Perubahan minggu ini</h3>
      {conditionChanged&&<div className="review-condition" role="status"><small>Kondisi berubah</small><span>{previousHealth} <ArrowRight size={14}/> <Pill tone={conditionTone} dot>{current.health}</Pill></span></div>}
      {current.status==='updated'?<p className="pre-wrap">{reviewText({...current,health:'Belum dinilai'},project.previousText)||'Belum ada uraian.'}</p>:<p><Pill tone={current.status==='none'?'violet':'neutral'}>{current.status==='pending'?'Belum ada update':reviewLabels[current.status]}</Pill></p>}</aside>
    </div>
    {confirm&&<ButtonConfirm value="Tandai proyek tanpa perubahan? Isian pembaruan akan dihapus. Tindak lanjut bawaan tetap tersimpan." onConfirm={unchanged} onCancel={()=>setConfirm(false)}/>}
    {info&&<Dialog title="Info rapat" close={()=>setInfo(false)}><form onSubmit={updateInfo}><div className="dialog-content fields">{[['title','Judul'],['moderator','Moderator'],['notes','Catatan']].map(([key,label])=><label key={key}>{label}{key==='notes'?<textarea name={key} defaultValue={meeting.notes}/>:<input required={key==='title'} name={key} defaultValue={meeting[key as 'title'|'moderator']}/>}</label>)}{error&&<ErrorBox message={error}/>}</div><div className="dialog-actions"><button className="button primary">Simpan info</button></div></form></Dialog>}
  </>;
}

function ReviewBadges({project}: {project:Meeting['projects'][number]}){
  const {review}=project;
  const health=review.status==='none'?previousCondition(project):review.health;
  return <div className="preview-status-badges">
    <Pill tone={reviewTones[review.status]} dot>{reviewLabels[review.status]}</Pill>
    {(review.status==='updated'||review.status==='none')&&health!=='Belum dinilai'&&<Pill tone={healthTones[health]}>{health}</Pill>}
  </div>;
}

function MeetingPreview({meeting,user,back,reviewProject,put,notify,verifyProject}:{
  meeting:Meeting;user:User;back:()=>void;reviewProject:(id:string)=>void;put:(m:Meeting)=>void;notify:(text:string)=>void;verifyProject:(id:string)=>Promise<void>;
}) {
  const [kind,setKind]=useState('summary');
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [finalizing,setFinalizing]=useState(false);
  const [finalizeError,setFinalizeError]=useState('');
  const working=useRef(false);
  function closeConfirmation(){
    if(!working.current){setConfirm(false);setFinalizeError('')}
  }
  const stats=meetingReadiness(meeting);
  const final=meeting.status==='final';
  const title=kind==='summary'?'Ringkasan & Memo Rapat Korporat':'Memo Eksekutif';
  const metadata=[meeting.title,dateLabel(meeting.date),...(meeting.moderator?['Moderator: '+meeting.moderator]:[]),...(meeting.notes?[meeting.notes]:[])];
  const tableHead=['No','Proyek','Tindak lanjut rapat lalu','Status & tindak lanjut s.d. '+dateLabel(meeting.date,'short')];
  const projectNotes=(p:Meeting['projects'][number])=>[
    p.detail.name,'Pelanggan: '+(p.detail.customer||'—'),'Periode: '+(p.detail.period||'—'),'PM: '+(p.detail.pm||'—'),
    'Nilai: '+formatContractValue(p.detail.value),'Penagihan: '+(p.detail.billing||'—'),...(p.verification?['Perlu verifikasi']:[]),
  ].join('\n');
  const reviewBody=(p:Meeting['projects'][number])=>p.review.status==='updated'?reviewText({...p.review,health:'Belum dinilai'},p.previousText):reviewText(p.review,p.previousText);
  const reportLine=[
    'Ditinjau '+stats.reviewed+' dari '+stats.total,'Diperbarui '+stats.updated,'Sama '+stats.unchanged,
    ...(stats.source?['Arsip sumber '+stats.source]:[]),'Belum ditinjau '+stats.pending.length,
  ].join(' · ');
  const paper=useRef<HTMLElement>(null);
  const flagged=meeting.projects.filter(project=>project.verification);
  async function verify(verification:Meeting['projects'][number]){
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{await verifyProject(verification.id)}
    catch(e){setError((e as Error).message)}finally{working.current=false;setBusy(false)}
  }
  async function finalize(){
    if(working.current||!stats.ready||final)return;
    working.current=true;setFinalizing(true);setFinalizeError('');
    try{
      put(await api<Meeting>('/meetings/'+meeting.id+'/finalize','POST',{version:meeting.version}));
      setConfirm(false);notify('Rapat difinalkan dan dikunci.');
    }catch(e){setFinalizeError((e as Error).message)}
    finally{working.current=false;setFinalizing(false)}
  }
  return <div className="print-scope">
    <div className="back-line no-print"><button className="subtle-button" onClick={back}><ArrowLeft size={15}/> {final?'Daftar rapat':'Ruang kerja'}</button></div>
    <div className="no-print"><Heading title="Pratinjau dokumen" description={<>{dateLabel(meeting.date)} <Pill tone={final?'green':'violet'} dot>{final?'Final':'Draf'}</Pill></>} actions={<DocumentExport paper={paper} name={'Rapat-'+meeting.date+'-'+(kind==='memo'?'Memo':'Ringkasan')} onError={setError}/>}/></div>
    {error&&<ErrorBox message={error}/>}
    <div className="preview-layout meeting-preview-layout">
      <section className="paper-stage">
        <div className="document-tabs no-print">{[['summary','Tabel ringkasan'],['memo','Memo eksekutif']].map(([id,label])=><button className={'chip '+(kind===id?'selected':'')} key={id} onClick={()=>setKind(id)}>{label}</button>)}</div>
        <article ref={paper} className="paper">
          {!final&&<span className="watermark">DRAF</span>}
          <img className="paper-logo" src="/brand/sdd.png" alt="Swadharma Duta Data"/>
          <h2>{title}</h2>
          <div className="paper-meta">{metadata.map((line,i)=><p key={i}>{line}</p>)}</div>
          {kind==='summary'?<table><thead><tr>{tableHead.map(label=><th key={label}>{label}</th>)}</tr></thead>
            <tbody>{meeting.projects.map(p=><tr key={p.id}><td>{p.number}</td><td>{projectNotes(p)}</td><td>{p.previousText||'—'}</td>
              <td><ReviewBadges project={p}/><p className="pre-wrap">{reviewBody(p)}</p></td></tr>)}</tbody></table>:
            <><section className="paper-section"><h3>Ringkasan pelaporan</h3><p>{reportLine}</p></section>
              {meeting.projects.map(p=><section className="paper-section" key={p.id}><h3>{p.number}. {p.detail.name}</h3><ReviewBadges project={p}/><p className="pre-wrap">{reviewBody(p)}</p></section>)}</>}
          <footer className="paper-footer">Dokumen internal PMO · {final?'Final':'Draf'}</footer>
        </article>
      </section>
      <aside className="panel padded no-print">
        <div className="split"><h2>{final?'Arsip final':'Siap difinalkan?'}</h2><Pill tone={final||stats.ready?'green':'amber'}>{final?'Dikunci':stats.ready?'Siap':'Belum siap'}</Pill></div>
        <div className="checklist">
          <p>{stats.pending.length?<CircleAlert size={18}/>:<Check size={18}/>} {stats.reviewed} dari {stats.total} proyek ditinjau</p>
          <p>{stats.incomplete.length?<CircleAlert size={18}/>:<Check size={18}/>} {stats.incomplete.length?stats.incomplete.length+' proyek perlu dilengkapi':'Tidak ada isian tinjauan yang kurang'}</p>

        </div>
        {!final&&flagged.length>0&&<div className="source-verification">
          <h3><CircleAlert size={16}/> Verifikasi data sumber</h3>
          <p>Periksa detail proyek ke sumber resmi. Status ini terpisah dari tinjauan mingguan.</p>
          <ul>{flagged.map(project=><li key={project.id}>
            <button className="table-link" onClick={()=>reviewProject(project.id)}>{project.detail.name}</button>
            {canVerify(user)&&<button className="button" disabled={busy} onClick={()=>void verify(project)}>Tandai terverifikasi</button>}
          </li>)}</ul>
        </div>}
        {!final&&!stats.ready&&<div className="readiness-group">
          {!stats.total&&<p className="muted">Belum ada proyek untuk ditinjau.</p>}
          {stats.pending.length>0&&<details open><summary>{stats.pending.length} belum ditinjau</summary><ul>{stats.pending.map(p=><li key={p.id}><button className="table-link" onClick={()=>reviewProject(p.id)}>{p.label}</button></li>)}</ul></details>}
          {stats.incomplete.length>0&&<details open><summary>{stats.incomplete.length} perlu dilengkapi</summary><ul>{stats.incomplete.map(p=><li key={p.id}><button className="table-link" onClick={()=>reviewProject(p.id)}>{p.label}</button><small className="block muted">{p.problems.join(' ')}</small></li>)}</ul></details>}
        </div>}
        {!final&&['SUPER_ADMIN','MANAGER_PMO'].includes(user.role)&&<button className="button primary space-top" disabled={!stats.ready||busy} onClick={()=>setConfirm(true)}><LockKeyhole size={15}/> Finalkan rapat</button>}
      </aside>
    </div>
        {confirm&&<Dialog restoreFocus title="Finalkan rapat" close={closeConfirmation}>
      <div className="dialog-content fields">
        <p>Finalkan rapat dan kunci seluruh tinjauan proyek?</p>
        <PendingStatus hidden message={finalizing?'Memfinalkan rapat…':undefined}/>
        {finalizeError&&<ErrorBox message={finalizeError}/>}
      </div>
      <div className="dialog-actions">
        <button autoFocus type="button" className="button" disabled={finalizing} onClick={closeConfirmation}>Batal</button>
        <PendingButton type="button" className="button primary" pending={finalizing?'Memfinalkan rapat…':undefined}
          onClick={()=>void finalize()}>Finalkan rapat</PendingButton>
      </div>
    </Dialog>}
  </div>;
}
