import { NavIcon } from './nav-icon';
import { FilterChips } from './choice-bar';
import { defaultDocumentLogo } from './document-logo';
import { SearchableSelect } from './search-select';
import type { MeetingModerator } from '../../../packages/shared/workspace-admin';
import { useProjectEditGuard } from './project-edit-guard';
import { ShellBack } from './shell-back';
import { FormField, TextInput, Textarea, Select } from './form-controls';
import { ArrowLeft, ArrowRight, Check, FileText, Info, LockKeyhole, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { actionStatuses, categoryOptions, formatContractValue, healthOptions, meetingReadiness, previousCondition, reviewText, type Meeting, type ProjectRow, type Review } from '../../../packages/shared/domain';
import { Button, api, FieldLabel, ConfirmDialog, DataTable, dateLabel, Dialog, Empty, ErrorBox, Heading, Meter, Pill, PendingButton, PendingStatus, type User } from './ui';
import { LoadingArea, useLoadingList } from './loading-list';
import { DateInput } from './date-input';
import { ActionMenu } from './action-menu';
import { DocumentPreview } from './document-workspace';
import { DocumentExport } from './document-export';
import { ExecutiveMemoContents, ExecutiveMemoControl, useExecutiveMemo } from './executive-memo';

function addDays(date:string,days:number){
  const day=new Date(date+'T12:00:00Z');
  day.setUTCDate(day.getUTCDate()+days);
  return day.toISOString().slice(0,10);
}

function currentWeek(){
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'}).format(new Date());
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  return addDays(date,-((day+6)%7));
}

const meetingMonthLabels=new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'UTC'});
const meetingMonths=Array.from({length:12},(_,index)=>
  meetingMonthLabels.format(new Date(Date.UTC(2000,index,1))).toLowerCase());
function meetingSearchDate(query:string){
  const text=query.trim().toLowerCase();
  const iso=/^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(text);
  const numeric=/^(\d{1,2})\/(\d{1,2})\/([1-9]\d{3})$/.exec(text);
  const named=/^(\d{1,2})\s+([^\s]+)\s+([1-9]\d{3})$/.exec(text);
  let date=iso?.[0];
  if(numeric)date=numeric[3]+'-'+numeric[2].padStart(2,'0')+'-'+numeric[1].padStart(2,'0');
  if(named){
    const month=meetingMonths.indexOf(named[2])+1;
    if(month)date=named[3]+'-'+String(month).padStart(2,'0')+'-'+named[1].padStart(2,'0');
  }
  if(!date)return undefined;
  const parsed=new Date(date+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===date?date:undefined;
}

function timelineStart(){return addDays(currentWeek(),-14)}
function MeetingTimeline({rows,open,create}:{rows:Meeting[];open:(row:Meeting)=>void;create?:()=>void}){
  const [start,setStart]=useState(timelineStart);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'}).format(new Date());
  const weeks=Array.from({length:4},(_,index)=>addDays(start,index*7));
  return <section className="panel padded timeline-card" aria-label="Linimasa rapat">
    <div className="split"><h2>Linimasa rapat</h2><div className="heading-actions">
      <button type="button" className="icon-button" title="Periode sebelumnya" aria-label="Periode sebelumnya" onClick={()=>setStart(addDays(start,-28))}><ArrowLeft size={16}/></button>
      <Button type="button" className="button" onClick={()=>setStart(timelineStart())}>Minggu ini</Button>
      <button type="button" className="icon-button" title="Periode berikutnya" aria-label="Periode berikutnya" onClick={()=>setStart(addDays(start,28))}><ArrowRight size={16}/></button>
    </div></div>
    <div className="meeting-timeline" tabIndex={0} role="region" aria-label="Empat minggu linimasa rapat">{weeks.map(week=>{
      const next=addDays(week,7);
      const meetings=rows.filter(row=>row.date>=week&&row.date<next).sort((a,b)=>a.date.localeCompare(b.date));
      const current=today>=week&&today<next;
      return <article key={week} className={'meeting-week'+(current?' current-week':'')}>
        <div className="meeting-week-heading"><strong>{dateLabel(week,'short')} – {dateLabel(addDays(week,6),'short')}</strong>
          {current&&<Pill tone="blue">Minggu ini</Pill>}</div>
        {meetings.length?meetings.map(row=>{
          const stats=meetingReadiness(row);
          return <button key={row.id} type="button" className="meeting-week-entry" onClick={()=>open(row)}>
            <time dateTime={row.date}>{dateLabel(row.date)}</time><strong>{row.title}</strong>
            <span className="meeting-week-meta"><Pill tone={row.status==='final'?'green':'neutral'}>{row.status==='final'?'Final':'Draf'}</Pill>
              <small>{stats.reviewed}/{stats.total} proyek</small></span>
          </button>;
        }):<><p className="muted">Belum ada rapat tercatat</p>
          {current&&create&&<Button type="button" className="button" onClick={create}><Plus size={16}/> Buat rapat</Button>}</>}
      </article>;

    })}</div>
  </section>;
}

const reviewLabels:Record<Review['status'],string>={pending:'Belum ditinjau',updated:'Ada perubahan',none:'Tidak ada perubahan',source:'Arsip sumber'};
const reviewTones:Record<Review['status'],string>={pending:'amber',updated:'green',none:'violet',source:'neutral'};
const healthTones:Record<Review['health'],string>={'Belum dinilai':'neutral','On Track':'green','Needs Attention':'amber',Critical:'red'};
const canEdit = (user:User)=>['SUPER_ADMIN','ADMIN_PMO','MANAGER_PMO','NOTULIS'].includes(user.role);

type ModeratorDirectory=Pick<ReturnType<typeof useLoadingList<MeetingModerator>>,'items'|'loading'|'error'|'retry'>;

function ModeratorField({directory,value,onChange,legacy,disabled=false}:{directory:ModeratorDirectory;value:string;onChange:(id:string)=>void;legacy?:string;disabled?:boolean}){
  const id=useId();
  return <div className="field">
    <label htmlFor={id}><FieldLabel label="Moderator" required/></label>
    {directory.error?<><ErrorBox message={directory.error}/><div><Button type="button" className="button" onClick={directory.retry}>Coba muat moderator lagi</Button></div></>:
      directory.loading?<PendingStatus message="Memuat master pengguna…"/>:
      <SearchableSelect id={id} label="Moderator" emptyLabel="Pilih moderator" options={directory.items} value={value} onChange={onChange}
        disabled={disabled} required describedBy={!value&&legacy?id+'-legacy':undefined}/>}
    {!value&&legacy&&<small id={id+'-legacy'} className="muted">Moderator sebelumnya: {legacy}. Pilih dari master pengguna.</small>}
  </div>;
}

function MeetingInformation({meeting,directory,editable,put,notify,close}:{meeting:Meeting;directory:ModeratorDirectory;editable:boolean;put:(meeting:Meeting)=>void;notify:(message:string)=>void;close:()=>void}){
  const [editing,setEditing]=useState(false);
  const [title,setTitle]=useState(meeting.title);
  const [notes,setNotes]=useState(meeting.notes);
  const [moderatorId,setModeratorId]=useState(meeting.moderatorId??'');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const working=useRef(false);
  const openedVersion=useRef(meeting.version);
  const valid=title.trim()&&directory.items.some(person=>person.id===moderatorId);
  const dirty=title.trim()!==meeting.title||notes.trim()!==meeting.notes||moderatorId!==(meeting.moderatorId??'');
  function edit(){
    setTitle(meeting.title);setNotes(meeting.notes);setModeratorId(meeting.moderatorId??'');setError('');
    openedVersion.current=meeting.version;setEditing(true);
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(working.current||!valid||!dirty)return;
    working.current=true;setSaving(true);setError('');
    try{
      const updated=await api<Meeting>('/meetings/'+meeting.id,'PATCH',{title,notes,moderatorId,version:openedVersion.current});
      put(updated);setEditing(false);notify('Informasi rapat diperbarui.');
    }catch(failure){setError((failure as Error).message)}
    finally{working.current=false;setSaving(false)}
  }
  const info=<dl className="meeting-info-data">
    <div><dt>Tanggal</dt><dd>{dateLabel(meeting.date)}</dd></div>
    <div><dt>Judul</dt><dd>{meeting.title}</dd></div>
    <div><dt>Moderator</dt><dd>{meeting.moderator||'Belum dipilih'}</dd></div>
    <div><dt>Catatan</dt><dd className="pre-wrap">{meeting.notes||'—'}</dd></div>
  </dl>;
  return <Dialog title="Informasi rapat" className="meeting-form-dialog" restoreFocus close={()=>{if(!working.current)close()}}>
    {editing?<form onSubmit={save}>
      <div className="dialog-content fields">
        <FormField label="Judul" required><TextInput autoFocus value={title} onChange={event=>setTitle(event.target.value)} maxLength={300} required readOnly={saving}/></FormField>
        <ModeratorField directory={directory} value={moderatorId} onChange={setModeratorId} legacy={!meeting.moderatorId?meeting.moderator:undefined} disabled={saving}/>
        <FormField label="Catatan"><Textarea grow="note" value={notes} onChange={event=>setNotes(event.target.value)} readOnly={saving}/></FormField>
        {error&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions">
        <Button type="button" className="button" disabled={saving} onClick={()=>setEditing(false)}>Batal</Button>
        <PendingButton type="submit" className="button primary" disabled={!dirty||!valid} pending={saving?'Menyimpan informasi…':undefined}>Simpan</PendingButton>
      </div>
    </form>:<>
      <div className="dialog-content">{info}</div>
      {editable&&<div className="dialog-actions"><Button type="button" className="button primary" onClick={edit}><Pencil size={16} aria-hidden="true"/> Edit</Button></div>}
    </>}
  </Dialog>;
}

export function Meetings({user,projects,notify,onChange}: {user:User;projects:ProjectRow[];notify:(msg:string)=>void;onChange:(meetings:Meeting[])=>void}) {
  const {items:rows,setItems:setRows,loading,error:loadError,retry}=useLoadingList<Meeting>('/meetings',onChange);
  const [current,setCurrent]=useState('');
  const [focusProject,setFocusProject]=useState('');
  const [mode,setMode]=useState<'list'|'work'|'preview'>('list');
  const [creating,setCreating]=useState(false);
  const [meetingDate,setMeetingDate]=useState('');
  const [moderatorId,setModeratorId]=useState('');
  const [editing,setEditing]=useState<Meeting|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [invalidMeetingDate,setInvalidMeetingDate]=useState(false);
  const [deleteRow,setDeleteRow]=useState<Meeting|null>(null);
  const editable=canEdit(user);
  const moderators=useLoadingList<MeetingModerator>(editable?'/meetings/moderators':undefined);
  const validModerator=moderators.items.some(person=>person.id===moderatorId);
  const saving=useRef(false);
  function openForm(row:Meeting|null){
    setEditing(row);
    setMeetingDate(row?.date??'');
    setModeratorId(row?.moderatorId??'');
    setInvalidMeetingDate(false);
    setCreating(true);
    setError('');
  }

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
    if(saving.current||!validModerator||invalidMeetingDate)return;
    const data={...Object.fromEntries(new FormData(e.currentTarget)),moderatorId};
    saving.current=true;setBusy(true);setError('');
    try{
      const row=editing?await api<Meeting>('/meetings/'+editing.id,'PATCH',{...data,version:editing.version}):await api<Meeting>('/meetings','POST',data);
      put(row);setCreating(false);setEditing(null);
      if(!editing)open(row,'work');
      notify(editing?'Draf rapat diperbarui.':'Draf rapat dibuat.');
    }
    catch(e){setError((e as Error).message)}finally{saving.current=false;setBusy(false)}
  }
  async function remove(row:Meeting){
    setDeleteRow(null);setError('');
    try{await api('/meetings/'+row.id,'DELETE',{version:row.version});const updated=rows.filter(m=>m.id!==row.id);setRows(updated);onChange(updated);notify('Draf dihapus.')}
    catch(e){setError((e as Error).message)}
  }
  if(loading||loadError)return <>
    <Heading title="Rapat korporat" description="Tinjauan proyek mingguan dan arsip rapat korporat."/>
    <LoadingArea message="Memuat daftar rapat…" error={loadError} retry={retry}/>
  </>;
  const selected=rows.find(row=>row.id===current);
  if(mode==='work'&&selected?.projects.length) return <Workspace key={selected.id} initialProject={focusProject} meeting={selected} previous={rows.find(row=>row.id===selected.previousId)} moderators={moderators} user={user} put={put} back={back} preview={id=>open(selected,'preview',id)} notify={notify}/>;
  if(mode!=='list'&&selected) return <MeetingPreview meeting={selected} moderators={moderators} user={user} back={()=>selected.status==='final'||!selected.projects.length?back():open(selected,'work',focusProject)} reviewProject={id=>open(selected,'work',id)} put={put} notify={notify}/>;
  const dateReady=Boolean(meetingDate)&&!invalidMeetingDate;
  const queryDate=meetingSearchDate(query);
  const queryText=query.trim().toLowerCase();
  const matching=rows.filter(row=>(!statusFilter||row.status===statusFilter)&&(
    row.date===queryDate||
    [row.title,row.moderator,row.date,row.notulis].some(value=>value?.toLowerCase().includes(queryText))||
    row.projects.some(project=>[project.id,project.detail.name].some(value=>value.toLowerCase().includes(queryText)))
  ));
  return <><Heading title="Rapat korporat" description="Tinjauan proyek mingguan dan arsip rapat korporat." actions={<>
    {editable&&<Button className="button primary" onClick={()=>openForm(null)}><Plus size={17}/> Buat rapat</Button>}
  </>}/>
    {error&&!creating&&<ErrorBox message={error}/>}
    <MeetingTimeline rows={rows} open={row=>open(row,row.status==='final'?'preview':'work')} create={editable?()=>openForm(null):undefined}/>
    <section className="panel"><div className="table-heading spaced meeting-list-filters"><div><h2>Daftar rapat</h2><p>{matching.length} dari {rows.length} rapat</p>
        <FilterChips label="Status rapat" choices={[{id:'',label:'Semua'},{id:'draft',label:'Draf'},{id:'final',label:'Final'}]}
          value={statusFilter} onChange={setStatusFilter}/>
      </div>
        <label className="search-box"><Search size={15} aria-hidden="true"/><TextInput aria-label="Cari rapat" placeholder="Cari judul, moderator, tanggal, notulis, atau proyek" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    </div>
    <DataTable rows={matching} rowKey={row=>row.id} searchKey={query+'|'+statusFilter} columns={[
      {id:'date',label:'Tanggal',sort:r=>r.date,render:r=><strong>{dateLabel(r.date,'short')}</strong>},
      {id:'title',label:'Judul',sort:r=>r.title,render:r=><><button className="table-link" onClick={()=>open(r,r.status==='final'?'preview':'work')}>{r.title}</button><small className="block muted">{r.projects.length} proyek</small></>},
      {id:'moderator',label:'Moderator',sort:r=>r.moderator,render:r=>r.moderator||'—'},
      {id:'status',label:'Status',sort:r=>r.status,render:r=><Pill tone={r.status==='final'?'green':'violet'} dot>{r.status==='final'?'Final':'Draf'}</Pill>},
      {id:'review',label:'Tinjauan',sort:r=>r.projects.filter(p=>p.review.status!=='pending').length,render:r=>{const done=r.projects.filter(p=>p.review.status!=='pending').length;return <div className="meeting-meter"><small>{done} / {r.projects.length}</small>{r.status==='draft'&&r.projects.length>done&&<small>{r.projects.length-done} proyek belum ditinjau</small>}<Meter value={r.projects.length?100*done/r.projects.length:0}/></div>}},
      {id:'ref',label:'Referensi',render:r=>dateLabel(r.previousDate,'short')},
      {id:'actions',label:'Tindakan',render:r=>{
        const final=r.status==='final';
        const stats=meetingReadiness(r);
        const preview=final||stats.ready;
        const reason=final?'Rapat final terkunci.':!editable?'Grup Anda hanya memiliki akses lihat.':rows.some(row=>row.previousId===r.id)?'Rapat dipakai sebagai referensi.':rows.length<=1?'Rapat terakhir tidak dapat dihapus.':'';
        return <div className="heading-actions">
          <Button type="button" className="button" onClick={()=>open(r,preview?'preview':'work')}>
            {final?'Lihat dokumen':stats.ready?'Tinjau dokumen':stats.reviewed?'Lanjutkan tinjauan':'Mulai tinjauan'}
          </Button>
          <ActionMenu compact label="Tindakan lainnya" items={[
            ...(!final?[
              {id:'preview',label:'Pratinjau dokumen',icon:<FileText size={16} aria-hidden="true"/>,run:()=>open(r,'preview')},
              {id:'edit',label:'Ubah rapat',icon:<Pencil size={16} aria-hidden="true"/>,disabled:!editable,run:()=>openForm(r)},
            ]:[]),
            {id:'delete',label:'Hapus draf',icon:<NavIcon name="trash"/>,disabled:Boolean(reason),disabledReason:reason,danger:true,run:()=>setDeleteRow(r)},
          ]}/>
        </div>;
      }},
    ]} empty="Belum ada rapat yang cocok."/></section>
    {creating&&<Dialog restoreFocus title={editing?'Ubah rapat':'Buat rapat'} className="meeting-form-dialog" close={()=>{if(!busy)setCreating(false)}}>
      <form onSubmit={create}>
        <div className="dialog-content fields">
          <FormField label="Tanggal rapat" required><DateInput label="Tanggal rapat" name="date" value={meetingDate} onValue={setMeetingDate} onInvalidDraft={setInvalidMeetingDate} readOnly={Boolean(editing&&rows.some(row=>row.previousId===editing.id))} required/></FormField>
          <FormField label="Judul" required><TextInput name="title" placeholder="Tinjauan Portofolio November" defaultValue={editing?.title??'Rapat Korporat'} required maxLength={300}/></FormField>
          <ModeratorField directory={moderators} value={moderatorId} onChange={setModeratorId} legacy={!editing?.moderatorId?editing?.moderator:undefined} disabled={busy}/>
          <FormField label="Catatan"><Textarea name="notes" grow="note" placeholder="Bahas persiapan UAT dan risiko jadwal." defaultValue={editing?.notes}/></FormField>
          {!editing&&dateReady&&<div className="document-card" aria-live="polite"><h3>Cakupan tinjauan</h3><p>{projects.length} proyek akan dimuat untuk ditinjau.</p></div>}
          {error&&<ErrorBox message={error}/>}
        </div>
        <div className="dialog-actions"><Button className="button" type="button" disabled={busy} onClick={()=>setCreating(false)}>Batal</Button><PendingButton type="submit" className="button primary" disabled={!validModerator||!dateReady} pending={busy?'Menyimpan rapat…':undefined}>{editing?'Simpan perubahan':'Buat rapat'}</PendingButton></div>
      </form>
    </Dialog>}
    {deleteRow&&<ConfirmDialog title="Hapus draf rapat" object={deleteRow.title} consequence="Draf dan seluruh tinjauan proyek dalam rapat ini akan dihapus." confirmLabel="Hapus draf" deleteAction onCancel={()=>setDeleteRow(null)} onConfirm={()=>remove(deleteRow)}/>}
  </>;
}

function Workspace({meeting,previous,moderators,initialProject,user,put,back,preview,notify}: {meeting:Meeting;previous?:Meeting;moderators:ModeratorDirectory;initialProject:string;user:User;put:(m:Meeting)=>void;back:()=>void;preview:(id:string)=>void;notify:(text:string)=>void}) {
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
  const projectHeading=useRef<HTMLHeadingElement>(null);
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
  const guard=useProjectEditGuard(dirty,()=>working.current,()=>{});
  function update(input:Partial<Review>) {
    revision.current++;
    setCurrent(value=>({...value,...input,status:'updated'}));
    if(!working.current)setSaveState('Perubahan belum disimpan');
    setError('');
  }
  async function save(review=current,force=false){
    if(!editable||working.current)return false;
    if(!force&&!dirty)return true;
    const at=revision.current;
    working.current=true;setSaveState('Menyimpan…');setError('');setConflict(false);
    try{
      const result=await api<Meeting>(path+'/projects/'+project.id,'PATCH',{version:latest.current.version,review});
      latest.current=result;put(result);
      if(revision.current!==at){
        setSaveState('Perubahan belum disimpan');
        return false;
      }
      setCurrent(result.projects[index].review);
      setSaveState('Tersimpan');
      return true;
    } catch(e){setSaveState('Gagal menyimpan');setError((e as Error).message);setConflict((e as Error).message.includes('diubah pengguna lain'));return false}
    finally{working.current=false}
  }
  useEffect(()=>{
    if(!editable||!dirty||guard.confirming||saveState==='Gagal menyimpan'||saveState==='Menyimpan…'||saveState.startsWith('Versi server')) return;
    const timer=setTimeout(()=>void save(),1500);
    return ()=>clearTimeout(timer);
  },[current,dirty,editable,saveState,guard.confirming]);
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
    if(next===index||next<0||next>=meeting.projects.length||working.current)return;
    if(dirty&&!await save())return;
    setIndex(next);setCurrent(latest.current.projects[next].review);setSaveState('');setError('');
    requestAnimationFrame(()=>projectHeading.current?.focus());
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
  const updatesPanel=useRef<HTMLDivElement>(null);
  const actionsPanel=useRef<HTMLDivElement>(null);
  const newCard=useRef<'update'|'action'>();
  useLayoutEffect(()=>{
    if(!newCard.current)return;
    const panel=newCard.current==='update'?updatesPanel:actionsPanel;
    newCard.current=undefined;
    Array.from(panel.current?.querySelectorAll('textarea')??[]).at(-1)?.focus();
  },[current.items.length,current.actions.length]);

  function addCard(kind:'update'|'action',clickCount:number){
    if(!editable||clickCount>1)return;
    newCard.current=kind;
    if(kind==='update')update({items:[...current.items,{category:categoryOptions[0],text:''}]});
    else update({actions:[...current.actions,{text:'',pic:'',due:'',status:'Belum dimulai'}]});
  }
  return <>
    <ShellBack label="Daftar rapat" onClick={()=>leave(back)}/><div className="back-line"><span role="status" className="muted">{saveState}</span></div>
    <Heading title={meeting.title} description={<>{dateLabel(meeting.date)} · Moderator {meeting.moderator||'belum diisi'} <Pill tone="violet">Draf</Pill></>} actions={<><Button type="button" className="button" onClick={()=>leave(()=>setInfo(true))}><Info size={16} aria-hidden="true"/> Informasi rapat</Button><Button className="button primary" disabled={saveState==='Menyimpan…'} onClick={()=>leave(()=>preview(project.id))}><FileText size={16}/> Pratinjau dokumen</Button></>}/>
    <section className="panel padded review-progress"><div><h2>{readiness.reviewed} dari {readiness.total} proyek ditinjau</h2><div className="heading-actions">{readiness.ready?<Pill dot tone="green">Siap difinalkan</Pill>:readiness.incomplete.length>0&&
      <Pill dot tone="amber">{readiness.incomplete.length} perlu dilengkapi</Pill>}<strong>{readiness.total?Math.round(100*readiness.reviewed/readiness.total):0}%</strong></div></div>
    <Meter value={readiness.total?100*readiness.reviewed/readiness.total:0}/></section>
    {error&&<ErrorBox message={error}/>}
    {conflict&&<div className="heading-actions conflict-actions"><Button className="button" onClick={reloadLatest}>Muat versi terbaru, pertahankan isian</Button></div>}
    <div className="review-layout">
    <aside className="panel review-queue">
      <div className="split"><h3 tabIndex={-1}>Antrean proyek</h3><span className="muted review-count">{readiness.reviewed}/{readiness.total}</span></div>
      <label className="search-box"><Search size={15}/><TextInput placeholder="Cari proyek…" aria-label="Cari proyek dalam antrean" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="chips">{[['all','Semua',readiness.total],['pending','Belum',readiness.pending.length],['updated','Ada perubahan',readiness.updated],['none','Tidak ada perubahan',readiness.unchanged]].map(([key,label,count])=><button key={key} onClick={()=>setFilter(String(key))} aria-pressed={filter===key} className={'chip '+(filter===key?'selected':'')}>{label}<span>{count}</span></button>)}</div>
      <div className="queue-list">{meeting.projects.map((p,i)=>({p,i})).filter(({p})=>(filter==='all'||filter===p.review.status)&&p.detail.name.toLowerCase().includes(query.toLowerCase())).map(({p,i})=>
        <button key={p.id} aria-current={i===index?'true':undefined} className={i===index?'current':undefined} data-reviewed={p.review.status!=='pending'} onClick={()=>move(i)}>
          {p.review.status==='pending'?<i className="review-dot" aria-hidden="true"/>:<Check className="review-check" size={15} aria-hidden="true"/>}<span><strong>{p.detail.name}</strong><small>{reviewLabels[p.review.status]}</small></span>
        </button>)}</div>
    </aside>
    <aside className="panel padded reference-panel" aria-label="Rapat sebelumnya">
      <h3>Rapat sebelumnya</h3>
      {!meeting.previousId&&!meeting.previousDate&&<p className="muted">Belum ada rapat referensi.</p>}
      {previous&&<p>{previous.title} <Pill tone={previous.status==='final'?'green':'neutral'}>{previous.status==='final'?'Final':'Draf'}</Pill></p>}
      <dl className="review-reference-data"><div><dt>Tanggal</dt><dd>{dateLabel(meeting.previousDate,'short')}</dd></div>
        <div><dt>Kondisi</dt><dd><Pill tone={healthTones[previousHealth]}>{previousHealth}</Pill></dd></div>
        {Array.from(project.previousText.matchAll(/^(Prognosa|Realisasi) (?:Revenue|pendapatan) 2026:\s*(.+)$/gim)).map(([line,label,value],i)=><div key={i+line}><dt>{label} 2026</dt><dd>{value}</dd></div>)}
      </dl>
      <h4>Ringkasan sebelumnya</h4>
      <p className="pre-wrap">{project.previousText.replace(/^(?:Prognosa|Realisasi) (?:Revenue|pendapatan) 2026:.*$/gim,'').trim()||'Belum ada catatan dari rapat referensi.'}</p>
      <h3>Perubahan minggu ini</h3>
      {conditionChanged&&<div className="review-condition" role="status"><small>Kondisi berubah</small><span>{previousHealth} <ArrowRight size={14}/> <Pill tone={conditionTone} dot>{current.health}</Pill></span></div>}
      {current.status==='updated'?<p className="pre-wrap">{reviewText({...current,health:'Belum dinilai'},project.previousText)||'Belum ada uraian.'}</p>:<p><Pill tone={reviewTones[current.status]}>{reviewLabels[current.status]}</Pill></p>}
    </aside>
    <section className="panel review-editor"><div className="review-editor-body"><div className="padded"><Pill tone={current.status==='updated'?'green':current.status==='none'?'violet':'neutral'}>{reviewLabels[current.status]}</Pill><h2 className="space-small" ref={projectHeading} tabIndex={-1}>{project.detail.name}</h2><p className="muted project-lock"><LockKeyhole size={13}/> {project.detail.customer||'—'} · PM {project.detail.pm||'—'} · {project.id}</p><dl className="detail-grid review-contract">{[['Periode',project.detail.period],['Nilai kontrak',project.detail.value],['Sales',project.detail.sales],['Catatan SPK / PKS',project.detail.notes]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></div>
    <div className="padded form-section fields"><div className="split"><h3>Ringkasan status</h3>{editable&&<Button className="button review-unchanged" aria-pressed={project.review.status==='none'}
      onClick={markUnchanged} disabled={current.status==='none'||saveState==='Menyimpan…'}><Check size={16} aria-hidden="true"/> Tidak ada perubahan</Button>}</div><label>Kondisi<Select value={current.health} onChange={e=>update({health:e.target.value as Review['health']})} disabled={!editable}>{healthOptions.map(option=><option key={option}>{option}</option>)}</Select></label><label>Ringkasan<Textarea grow="paragraph" maxLength={16000} placeholder="Pengujian selesai. UAT dijadwalkan pada 27 November." value={current.summary} onChange={e=>update({summary:e.target.value})} readOnly={!editable}/><small className="muted">{current.summary.length} karakter</small></label></div>
    <div className="padded form-section fields" ref={updatesPanel}><div className="split"><h3>Pembaruan proyek</h3>{editable&&<Button type="button" className="button primary" onMouseDown={event=>{if(event.detail>1)event.preventDefault()}} onClick={event=>addCard('update',event.detail)}><Plus size={15} aria-hidden="true"/> Tambah pembaruan</Button>}</div>{current.items.length===0&&<p className="muted">Belum ada pembaruan.</p>}{current.items.map((item,i)=><div className="row-editor fields" key={i}><label>Kategori<Select value={item.category} onChange={e=>update({items:current.items.map((v,n)=>n===i?{...v,category:e.target.value as typeof item.category}:v)})} disabled={!editable}>{categoryOptions.map(v=><option key={v}>{v}</option>)}</Select></label><label>Uraian<Textarea placeholder="Konfirmasi jadwal pengujian dengan pelanggan" value={item.text} readOnly={!editable} onChange={e=>update({items:current.items.map((v,n)=>n===i?{...v,text:e.target.value}:v)})}/></label>{editable&&<button className="subtle-button danger-text" onClick={()=>update({items:current.items.filter((_,n)=>n!==i)})}><NavIcon name="trash"/> Hapus</button>}</div>)}</div>
    <div className="padded form-section fields" ref={actionsPanel}><div className="split"><h3>Tindak lanjut</h3>{editable&&<Button type="button" className="button primary" onMouseDown={event=>{if(event.detail>1)event.preventDefault()}} onClick={event=>addCard('action',event.detail)}><Plus size={15} aria-hidden="true"/> Tambah tindak lanjut</Button>}</div>{current.actions.length===0&&<p className="muted">Belum ada tindak lanjut.</p>}{current.actions.map((item,i)=>{
      function edit(values:Partial<typeof item>){update({actions:current.actions.map((v,n)=>n===i?{...v,...values,carried:false}:v)})}
      return <div className="row-editor field-grid" key={i}><label className="span-full">Uraian<Textarea placeholder="Konfirmasi jadwal pengujian dengan pelanggan" value={item.text} readOnly={!editable} onChange={e=>edit({text:e.target.value})}/></label><label>PIC<TextInput placeholder="Dimas Saputra" value={item.pic} readOnly={!editable} onChange={e=>edit({pic:e.target.value})}/></label><label>Target<DateInput label="Target" value={item.due} readOnly={!editable} onValue={due=>edit({due})}/></label><label>Status<Select value={item.status} disabled={!editable} onChange={e=>edit({status:e.target.value as typeof item.status})}>{actionStatuses.map(v=><option key={v}>{v}</option>)}</Select></label>{editable&&<button className="subtle-button danger-text" onClick={()=>update({actions:current.actions.filter((_,n)=>n!==i)})}><NavIcon name="trash"/> Hapus</button>}</div>
    })}</div>
    </div><div className="padded editor-footer"><div className="heading-actions review-navigation"><Button className="button" disabled={index===0||saveState==='Menyimpan…'} onClick={()=>move(index-1)}><ArrowLeft size={15}/> Sebelumnya</Button><Button className="button" disabled={index===meeting.projects.length-1||saveState==='Menyimpan…'} onClick={()=>move(index+1)}>Berikutnya <ArrowRight size={15}/></Button></div><div className="heading-actions review-save-actions">{editable&&<PendingButton className="button" disabled={!dirty} pending={saveState==='Menyimpan…'?saveState:undefined} onClick={()=>save()}>{saveState==='Gagal menyimpan'?'Coba simpan lagi':'Simpan'}</PendingButton>}{editable&&<Button className="button primary" disabled={index===meeting.projects.length-1||saveState==='Menyimpan…'} onClick={()=>move(index+1)}>Simpan &amp; lanjut <ArrowRight size={15}/></Button>}</div></div></section>
    </div>
    {guard.confirming&&<ConfirmDialog title="Buang perubahan tinjauan" object={project.detail.name}
      consequence="Isian terbaru yang belum tersimpan akan dibuang." cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan" danger
      onCancel={guard.continueEditing} onConfirm={guard.discardChanges}/>}
    {confirm&&<ConfirmDialog title="Tandai tanpa perubahan" object={project.detail.name} consequence="Isian pembaruan akan dihapus. Tindak lanjut bawaan tetap tersimpan." confirmLabel="Tandai tanpa perubahan" onConfirm={unchanged} onCancel={()=>setConfirm(false)}/>}
    {info&&<MeetingInformation meeting={meeting} directory={moderators} editable={canEdit(user)} put={next=>{
      latest.current=next;put(next);setCurrent(next.projects[index].review);
    }} notify={notify} close={()=>setInfo(false)}/>}
  </>;
}

function ReviewBadges({project,legacy}: {project:Meeting['projects'][number];legacy:boolean}){
  const {review}=project;
  const health=review.status==='none'?previousCondition(project):review.health;
  return <div className={legacy?'preview-status-badges':'document-review-status'}>
    <Pill tone={reviewTones[review.status]} dot>{legacy&&review.status==='none'?'Sama / belum ada update':legacy&&review.status==='updated'?'Pembaruan':reviewLabels[review.status]}</Pill>
    {(review.status==='updated'||review.status==='none')&&health!=='Belum dinilai'&&<Pill tone={healthTones[health]}>{health}</Pill>}
  </div>;
}

function MeetingPreview({meeting,moderators,user,back,reviewProject,put,notify}:{
  meeting:Meeting;moderators:ModeratorDirectory;user:User;back:()=>void;reviewProject:(id:string)=>void;put:(m:Meeting)=>void;notify:(text:string)=>void;
}) {
  const [kind,setKind]=useState('summary');
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState('');
  const [finalizing,setFinalizing]=useState(false);
  const [finalizeError,setFinalizeError]=useState('');
  const working=useRef(false);
  function closeConfirmation(){
    if(!working.current){setConfirm(false);setFinalizeError('')}
  }
  const stats=meetingReadiness(meeting);
  const [info,setInfo]=useState(false);
  const validModerator=moderators.items.some(person=>person.id===meeting.moderatorId);
  const final=meeting.status==='final';
  const legacy=final&&!meeting.finalizedWithoutSourceVerification;
  const executive=useExecutiveMemo(meeting);
  const memo=final&&executive.state.status==='ready'&&executive.state.memo.sourceVersion===meeting.version?executive.state.memo:null;
  const showMemo=Boolean(memo&&kind==='memo');
  const title=showMemo?'Memo Eksekutif':'Ringkasan Rapat Korporat';
  const metadata=[meeting.title,dateLabel(meeting.date),...(meeting.moderator?['Moderator: '+meeting.moderator]:[]),...(meeting.notes?[meeting.notes]:[])];
  const tableHead=['No','Proyek','Tindak lanjut rapat lalu','Status & tindak lanjut s.d. '+dateLabel(meeting.date,'short')];
  const projectNotes=(p:Meeting['projects'][number])=>[
    p.detail.name,'Pelanggan: '+(p.detail.customer||'—'),'Periode: '+(p.detail.period||'—'),'PM: '+(p.detail.pm||'—'),
    'Nilai: '+formatContractValue(p.detail.value),'Penagihan: '+(p.detail.billing||'—'),...(legacy&&p.verification?['Perlu verifikasi']:[]),
  ].join('\n');
  const reviewBody=(p:Meeting['projects'][number])=>p.review.status==='updated'?reviewText({...p.review,health:'Belum dinilai'},p.previousText):reviewText(p.review,p.previousText);
  const paper=useRef<HTMLElement>(null);
  async function finalize(){
    if(working.current||!stats.ready||!validModerator||final)return;
    working.current=true;setFinalizing(true);setFinalizeError('');
    try{
      put(await api<Meeting>('/meetings/'+meeting.id+'/finalize','POST',{version:meeting.version}));
      setConfirm(false);notify('Rapat difinalkan dan dikunci.');
    }catch(e){setFinalizeError((e as Error).message)}
    finally{working.current=false;setFinalizing(false)}
  }
  return <div className="print-scope">
    <ShellBack label={final?'Daftar rapat':'Ruang kerja'} onClick={back}/>
    <div className="no-print"><Heading title="Pratinjau dokumen" actions={<Button type="button" className="button" onClick={()=>setInfo(true)}><Info size={16} aria-hidden="true"/> Informasi rapat</Button>} description={<>{dateLabel(meeting.date)} <Pill tone={final?'green':'neutral'} dot>{final?'Final':'Draf'}</Pill></>}/></div>
    {error&&<ErrorBox message={error}/>}
    <div className="preview-layout meeting-preview-layout">
      <DocumentPreview key={title} paper={paper} toolbar={memo?<div className="document-switch" role="group" aria-label="Jenis dokumen">
          <button type="button" aria-pressed={!showMemo} onClick={()=>setKind('summary')}>Tabel ringkasan</button>
          <button type="button" aria-pressed={showMemo} onClick={()=>setKind('memo')}>Memo eksekutif</button>
        </div>:undefined} actions={<DocumentExport paper={paper} name={'Rapat-'+meeting.date+'-'+(showMemo?'Memo':'Ringkasan')} onError={setError}/>}>
        <article ref={paper} className={'paper'+(legacy?'':' formal-paper')}>
          <img className="paper-logo" src={defaultDocumentLogo} alt="Swadharma Duta Data"/>
          <h2>{title}</h2>
          <div className="paper-meta">{metadata.map((line,i)=><p key={i}>{line}</p>)}</div>
          {showMemo&&memo?<ExecutiveMemoContents memo={memo} meeting={meeting}/>:
            <table className="meeting-paper-table"><thead><tr>{tableHead.map(label=><th key={label}>{label}</th>)}</tr></thead>
              <tbody>{meeting.projects.map(p=><tr key={p.id}><td>{p.number}</td><td>{projectNotes(p)}</td><td>{p.previousText||'—'}</td>
                <td><ReviewBadges project={p} legacy={legacy}/><p className="pre-wrap">{reviewBody(p)}</p></td></tr>)}</tbody></table>}
          <footer className="paper-footer">Dokumen internal PMO · {final?'Final':'Draf'}</footer>
        </article>
      </DocumentPreview>
      <aside className="panel padded no-print readiness-panel">
        <div className="split"><h2>Kesiapan dokumen</h2><Pill tone={final||stats.ready?'green':'amber'}>{final?'Dikunci':stats.ready?'Siap':'Belum siap'}</Pill></div>
        <p className="readiness-metric"><strong>{stats.reviewed}/{stats.total}</strong> proyek ditinjau</p>
        <Meter value={stats.total?100*stats.reviewed/stats.total:0}/>
        {!final&&!stats.ready&&<div className="readiness-group">
          {!stats.total&&<p className="muted">Belum ada proyek untuk ditinjau.</p>}
          {stats.pending.length>0&&<details open><summary>{stats.pending.length} belum ditinjau</summary><ul>{stats.pending.map(p=><li key={p.id}><button className="table-link" onClick={()=>reviewProject(p.id)}>{p.label}</button></li>)}</ul></details>}
          {stats.incomplete.length>0&&<details open><summary>{stats.incomplete.length} perlu dilengkapi</summary><ul>{stats.incomplete.map(p=><li key={p.id}><button className="table-link" onClick={()=>reviewProject(p.id)}>{p.label}</button><small className="block muted">{p.problems.join(' ')}</small></li>)}</ul></details>}
        </div>}
        {final&&<ExecutiveMemoControl state={executive.state} sending={executive.sending} canGenerate={canEdit(user)}
          refresh={executive.refresh} generate={async()=>{if(await executive.generate()){setKind('memo');notify('Memo eksekutif tersedia.')}}}/>}
        {!final&&['SUPER_ADMIN','MANAGER_PMO'].includes(user.role)&&<>
          <Button className="button primary space-top" disabled={!stats.ready||!validModerator||finalizing} onClick={()=>setConfirm(true)}><LockKeyhole size={15}/> Finalkan rapat</Button>
          {!stats.ready&&<p className="muted space-small">Selesaikan seluruh tinjauan proyek sebelum finalisasi.</p>}
          {moderators.loading?<PendingStatus message="Memeriksa moderator…"/>:!validModerator&&<div className="space-small">
            <p className="muted">Pilih moderator dari master pengguna sebelum finalisasi.</p>
            <Button type="button" className="button" onClick={()=>setInfo(true)}>Buka informasi rapat</Button>
          </div>}
        </>}
      </aside>
    </div>
    {info&&<MeetingInformation meeting={meeting} directory={moderators} editable={!final&&canEdit(user)} put={put} notify={notify} close={()=>setInfo(false)}/>}
    {confirm&&<ConfirmDialog title="Finalkan rapat" object={meeting.title}
      consequence="Seluruh tinjauan proyek akan dikunci. Dokumen rapat menjadi arsip final."
      confirmLabel="Finalkan rapat" pending={finalizing?'Memfinalkan rapat…':undefined} error={finalizeError}
      onCancel={closeConfirmation} onConfirm={()=>void finalize()}/>}
  </div>;
}
