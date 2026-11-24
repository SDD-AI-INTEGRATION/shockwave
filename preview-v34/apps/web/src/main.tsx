import './styles.css';
import {
  Archive, ArrowRight, CalendarDays, Check, ChevronRight, FileText, FolderClosed,
  LayoutGrid, LogOut, Menu, Paperclip, PanelLeftClose, PanelLeftOpen, Search, Settings2, Shield, Sparkles, TriangleAlert, UsersRound, X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { roleNames, type Meeting, type ProjectRow } from '../../../packages/shared/domain';
import { PendingStatus, api, defaultAppearance, Dialog, ErrorBox, Pill, type User } from './ui';
import { ProjectDrawer, Projects } from './projects';
import { Meetings } from './meetings';
import { Documents, Operations } from './modules';
import { Bast } from './bast';
import { Account, Admin, Login } from './account';
import { acceptedAssistantFiles, extractAssistantFile } from './assistant-files';
import type { AssistantAttachment, AssistantStatus } from '../../../packages/shared/assistant-knowledge';
import type { MomData } from '../../../packages/shared/mom-sample';
import { AssistantMomFile } from './mom-document';
import { AssistantPrompts, type PromptOption } from './assistant-prompts';
import { AssistantRevenueExport, AssistantWeeklyExport } from './assistant-reports';
import type { AssistantReportReply } from '../../../packages/shared/assistant-reports';

import type { ProjectCatalog } from '../../../packages/shared/project-entry';

const navigation = [
  {group:'Korporat', items:[
    {id:'projects',label:'Proyek', icon:FolderClosed},
    {id:'meetings',label:'Rapat korporat', icon:CalendarDays},
  ]},
  {group:'PMO', items:[
    {id:'assignment',label:'Penunjukan PM', icon:UsersRound},
    {id:'risk',label:'Daftar risiko', icon:TriangleAlert},
    {id:'operations',label:'Operasional', icon:LayoutGrid},
    {id:'mom',label:'Notulen (MOM)', icon:FileText},
    {id:'bast',label:'BAST', icon:Archive},
  ]},
  {group:'Admin',items:[{id:'admin',label:'Pengguna & audit',icon:Shield}]},
];
const labels: Record<string,string> = {...Object.fromEntries(navigation.flatMap(g=>g.items.map(i=>[i.id,i.label]))), account:'Pengaturan'};
const readPage = (hash:string) => {
  const path = hash.slice(1).split('/')[0] || 'projects';
  return Object.hasOwn(labels,path)?path:'projects';
};

function App() {
  const [user,setUser]=useState<User|null>(null);
  const [demo,setDemo]=useState(false);
  const [resetAvailable,setResetAvailable]=useState(false);
  const [googleAvailable,setGoogleAvailable]=useState(false);
  const [passkeyAvailable,setPasskeyAvailable]=useState(false);
  const [booting,setBooting]=useState(true);
  const [error,setError]=useState('');
  const [appearance,setAppearance]=useState(defaultAppearance);
  const [collapsed,setCollapsed]=useState(false);
  const [projects,setProjects]=useState<ProjectRow[]>([]);
  const [projectCatalog,setProjectCatalog]=useState<ProjectCatalog>();
  const [catalogError,setCatalogError]=useState('');
  const [draftCount,setDraftCount]=useState(0);
  const [ready,setReady]=useState(false);
  const [hash,setHash]=useState(()=>location.hash);
  const showLogin=!user||hash.startsWith('#reset/');
  const [mobile,setMobile]=useState(false);
  const [search,setSearch]=useState(false);
  const [assistant,setAssistant]=useState(false);
  const [detail,setDetail]=useState<ProjectRow|null>(null);
  const [toast,setToast]=useState('');
  const [account,setAccount]=useState(false);
  const navigate = useCallback((next:string)=>{
    location.hash=next; setHash(location.hash);
    setMobile(false); setAccount(false); window.scrollTo(0,0);
  },[]);
  const notify = useCallback((message:string)=>setToast(message),[]);
  useEffect(()=>{
    if(!toast)return;
    const timer=setTimeout(()=>setToast(''),3600);
    return ()=>clearTimeout(timer);
  },[toast]);
  useEffect(()=>{
    let live=true;
    (async()=>{
      try {
        const session=await api<{user:User|null;demoEnabled:boolean;resetAvailable:boolean;googleAvailable?:boolean;passkeyAvailable?:boolean}>('/auth/me');
        const current=session.user || (session.demoEnabled && location.hash!=='#login' && !location.hash.startsWith('#reset/') ? (await api<{user:User}>('/auth/demo','POST')).user : null);
        if(live){setUser(current);setDemo(session.demoEnabled);setResetAvailable(session.resetAvailable);setGoogleAvailable(Boolean(session.googleAvailable));setPasskeyAvailable(Boolean(session.passkeyAvailable));}
      } catch(e){if(live)setError((e as Error).message)}
      finally{if(live)setBooting(false)}
    })();
    return ()=>{live=false};
  },[]);
  const reload=useCallback(async()=>{setProjects(await api<ProjectRow[]>('/projects'));},[]);
  const updateCount=useCallback((meetings:Meeting[])=>setDraftCount(meetings.find(m=>m.status==='draft')?.projects.filter(p=>p.review.status==='pending').length||0),[]);
  useEffect(()=>{
    if(!user){setReady(false);return}
    setError('');
    Promise.all([reload(),api<{collapsed:boolean}>('/me/preferences').then(value=>setCollapsed(Boolean(value.collapsed))),api<Meeting[]>('/meetings').then(updateCount)])
      .then(()=>setReady(true)).catch(e=>setError(e.message));
  },[user,reload,updateCount]);
  useEffect(()=>{
    setProjectCatalog(undefined);setCatalogError('');
    if(!user||user.role==='VIEWER'||(user.menus&&!user.menus.includes('projects')))return;
    let live=true;
    api<ProjectCatalog>('/projects/catalog').then(value=>{if(live)setProjectCatalog(value)})
      .catch(error=>{if(live)setCatalogError(error.message)});
    return ()=>{live=false};
  },[user]);
  async function toggleRail() {
    const next=!collapsed;
    setCollapsed(next);
    try {await api('/me/preferences','PUT',{...defaultAppearance,collapsed:next})}
    catch(e){setCollapsed(!next);notify((e as Error).message)}
  }
  const {theme,accent}=showLogin?defaultAppearance:appearance;
  useLayoutEffect(()=>{
    const {dataset}=document.documentElement;
    dataset.accent=accent;
    if(theme!=='system'){
      dataset.theme=theme;
      return;
    }
    const os=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{dataset.theme=os.matches?'dark':'light'};
    apply();
    os.addEventListener('change',apply);
    return ()=>os.removeEventListener('change',apply);
  },[theme,accent]);
  useEffect(()=>{
    const onHashChange=()=>setHash(location.hash);
    const key=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&user&&!detail){event.preventDefault();setSearch(true)}
      if(event.key==='Escape'){setMobile(false);setAccount(false)}
    };
    function expired(){setUser(null);setReady(false);setError('Sesi berakhir. Silakan masuk kembali.');location.hash='login'}
    addEventListener('shockwave-session-expired',expired);addEventListener('hashchange',onHashChange);addEventListener('keydown',key);
    return ()=>{removeEventListener('shockwave-session-expired',expired);removeEventListener('hashchange',onHashChange);removeEventListener('keydown',key)};
  },[user,detail]);
  async function logout() {
    try {await api('/auth/logout','POST');setUser(null);setAccount(false);location.hash='login';} catch(e){notify((e as Error).message)}
  }
  function login(next:User) {
    setAppearance(defaultAppearance);
    setUser(next);
    navigate('projects');
  }
  if(booting) return <div className="boot"><img src="/brand/shockwave-mark.png" alt=""/><PendingStatus message="Memeriksa sesi…"/></div>;
  if(showLogin)return <Login demo={demo} loggedIn={login} startupError={error} resetAvailable={resetAvailable} googleAvailable={googleAvailable} passkeyAvailable={passkeyAvailable}/>;
  const initials=user.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  const canManage=user.menus?user.role!=='VIEWER'&&user.menus.includes('projects'):['SUPER_ADMIN','ADMIN_PMO'].includes(user.role);
  const available=(id:string)=>id==='account'||(id==='admin'?user.role==='SUPER_ADMIN'&&!user.menus:
    !user.menus||user.menus.some(menu=>menu===id));
  const visibleNavigation=navigation.map(group=>({...group,items:group.items.filter(item=>available(item.id))})).filter(group=>group.items.length);
  const page=readPage(hash);
  const currentPage=available(page)&&!(page==='assignment'&&user.role==='NOTULIS')?page:visibleNavigation[0]?.items[0].id??'account';
  function renderProjectDrawer(ordered:ProjectRow[]=[]) {
    if(!detail||!available('projects'))return null;
    return <ProjectDrawer project={projects.find(project=>project.id===detail.id)??detail}
      ordered={ordered} catalog={projectCatalog} close={()=>setDetail(null)} navigate={setDetail} canManage={canManage}
      saved={updated=>{setProjects(previous=>previous.map(project=>project.id===updated.id?updated:project));setDetail(updated)}}/>;
  }
  const railToggleLabel=collapsed?'Perluas sidebar':'Ciutkan sidebar';
  return <div className={'app-shell '+(collapsed?'rail-collapsed':'')}>
    {mobile&&<button className="mobile-backdrop" onClick={()=>setMobile(false)} aria-label="Tutup navigasi"/>}
    <aside className={'rail '+(mobile?'mobile-open':'')} aria-label="Navigasi utama">
      <button className="brand" onClick={()=>navigate('projects')} title="Shockwave PMO"><img src="/brand/shockwave-mark.png" alt=""/><span><strong>Shockwave</strong><small>SDD Project Management Office</small></span></button>
      <button className="icon-button mobile-close" onClick={()=>setMobile(false)} aria-label="Tutup navigasi"><X size={19}/></button>
      <nav>{visibleNavigation.map(group=><div className="nav-group" key={group.group}><div className="nav-group-title">{group.group}</div>{group.items.filter(item=>item.id!=='assignment'||user.role!=='NOTULIS').map(item=><button title={item.label} key={item.id} onClick={()=>navigate(item.id)} className="nav-item" aria-current={currentPage===item.id?'page':undefined}><item.icon size={18}/><span>{item.label}</span>{item.id==='meetings'&&draftCount>0&&<b className="nav-count">{draftCount}</b>}</button>)}</div>)}</nav>
      <div className="rail-bottom">
        <button className="nav-item" onClick={()=>navigate('account')} aria-current={currentPage==='account'?'page':undefined} title="Pengaturan"><Settings2 size={18}/><span>Pengaturan</span></button>
        <button className="nav-item rail-toggle" onClick={toggleRail} title={railToggleLabel} aria-label={railToggleLabel}>
          {collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}
          <span>{railToggleLabel}</span>
        </button>
        <div className="account-wrap">
          {account&&<div className="account-menu">
            <div className="account-identity">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button className={user.demo?undefined:'logout-button'} onClick={logout}><LogOut size={16}/>{user.demo?'Masuk dengan akun':'Keluar'}</button>
          </div>}
          <button className="rail-profile" onClick={()=>setAccount(!account)} aria-expanded={account} title={user.name}><span className="avatar">{initials}</span><span className="profile-text"><strong>{user.name}</strong><small>{user.demo?'Admin PMO':roleNames[user.role]}</small></span><ChevronRight size={16} className="profile-arrow"/></button>
        </div>
      </div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div className="breadcrumbs"><button className="icon-button mobile-toggle" onClick={()=>setMobile(true)} aria-label="Buka navigasi"><Menu size={21}/></button><span className="breadcrumb-root">{navigation.find(g=>g.items.some(item=>item.id===currentPage))?.group||'Akun'}</span><ChevronRight size={13}/><strong>{labels[currentPage]}</strong></div>
        <div className="topbar-actions"><button className="global-search" aria-label="Pencarian global" onClick={()=>setSearch(true)}><Search size={16}/><span>Cari proyek, rapat, dokumen</span><kbd>Ctrl K</kbd></button>{available('assistant')&&<button className="button assistant-button" aria-label="Tanya asisten" onClick={()=>setAssistant(true)}><Sparkles size={16}/><span>Tanya asisten</span></button>}</div>
      </header>
      <main className="content">
        {error&&<ErrorBox message={error}/>}
        {!ready&&!error&&<div className="fields"><PendingStatus message="Memuat ruang kerja…"/><div className="skeleton" aria-hidden="true"/></div>}
        {ready&&currentPage==='projects'&&<Projects projects={projects} catalog={projectCatalog} catalogError={catalogError} canImport={Boolean(user.workspaceAdmin)} canManage={canManage} reload={reload} notify={notify} openProject={setDetail} renderDrawer={renderProjectDrawer}/>}
        {ready&&currentPage==='meetings'&&<Meetings user={user} projects={projects} notify={notify} onChange={updateCount} reloadProjects={reload}/>}
        {ready&&['assignment','risk','mom'].includes(currentPage)&&<Documents key={currentPage} kind={currentPage as 'assignment'|'risk'|'mom'} projects={projects} user={user} notify={notify}/>}
        {ready&&currentPage==='operations'&&<Operations projects={projects} user={user} notify={notify}/>}
        {ready&&currentPage==='bast'&&<Bast projects={projects}/>}
        {ready&&currentPage==='account'&&<Account passkeyAvailable={passkeyAvailable&&user.workspaceAdmin!==false} user={user} appearance={appearance} changeAppearance={setAppearance} logout={logout} notify={notify}/>}
        {ready&&currentPage==='admin'&&<Admin notify={notify} user={user}/>}
      </main>
    </div>
    {search&&<GlobalSearch available={available} projects={available('projects')?projects:[]} close={()=>setSearch(false)} choose={value=>{setSearch(false);if(typeof value==='string')navigate(value);else setDetail(value)}}/>}
    {assistant&&available('assistant')&&<Assistant menus={user.menus} close={()=>setAssistant(false)} projects={projects} open={p=>{setAssistant(false);setDetail(p)}} navigate={next=>{setAssistant(false);navigate(next)}} reload={reload} notify={notify} updateCount={updateCount}/>}
    {(!ready||currentPage!=='projects')&&renderProjectDrawer()}
    {toast&&<div className="toast" role="status"><span><Check size={15}/></span>{toast}<button className="icon-button" onClick={()=>setToast('')} aria-label="Tutup notifikasi"><X size={16}/></button></div>}
  </div>;
}

function GlobalSearch({projects, close, choose, available}: {projects:ProjectRow[];close:()=>void;choose:(value:ProjectRow|string)=>void;available:(id:string)=>boolean}) {
  const [query,setQuery]=useState('');
  const q=query.trim().toLowerCase();
  const pages=navigation.flatMap(group=>group.items).filter(p=>available(p.id)&&p.id!=='admin'&&p.label.toLowerCase().includes(q));
  const matching=q?projects.filter(p=>[p.id,p.detail.name,p.detail.customer,p.detail.pm].join(' ').toLowerCase().includes(q)).slice(0,7):[];
  return <Dialog title="Pencarian global" close={close}><div className="dialog-content command-search"><label className="search-box"><Search size={18}/><input autoFocus placeholder="Cari proyek, rapat, dokumen…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {matching.length>0&&<div className="command-results"><small>Proyek</small>{matching.map(p=><button key={p.id} onClick={()=>choose(p)}><FolderClosed size={16}/><span>{p.detail.name}</span><ChevronRight size={16}/></button>)}</div>}
    {pages.length>0&&<div className="command-results"><small>Halaman</small>{pages.map(p=><button key={p.id} onClick={()=>choose(p.id)}><p.icon size={16}/><span>{p.label}</span><ChevronRight size={16}/></button>)}</div>}
    {pages.length===0&&matching.length===0&&<p className="muted">Tidak ada hasil untuk “{query}”.</p>}
  </div></Dialog>;
}

type Proposal={token:string;action:{type:string;date?:string;moderator?:string;name?:string;customer?:string;pm?:string;project?:string;summary?:string}};
type Reply=AssistantReportReply & {projects?:string[];export?:boolean;proposal?:Proposal;files?:string[];mom?:MomData};
function Assistant({close,projects,open,navigate,notify,updateCount,reload,menus}: {
  menus?:User['menus'];close:()=>void;projects:ProjectRow[];open:(p:ProjectRow)=>void;navigate:(page:string)=>void;notify:(msg:string)=>void;updateCount:(m:Meeting[])=>void;reload:()=>Promise<void>;
}) {
  const [query,setQuery]=useState('');
  const [messages,setMessages]=useState<(Reply&{mine:boolean})[]>([]);
  const [busy,setBusy]=useState(false);
  const [assistantStatus,setAssistantStatus]=useState<AssistantStatus>({gateway:false,proposalPrompts:[]});
  const [promptsOpen,setPromptsOpen]=useState(true);
  const promptInput=useRef<HTMLInputElement>(null);
  const uploadInput=useRef<HTMLInputElement>(null);
  const [files,setFiles]=useState<AssistantAttachment[]>([]);
  const [useAttachments,setUseAttachments]=useState(true);
  const activeAttachments=useAttachments?files:[];
  const [fileBusy,setFileBusy]=useState(false);
  const [fileError,setFileError]=useState('');
  async function attach(list:FileList|null) {
    if(!list?.length||fileBusy)return;
    setFileError('');
    if(files.length+list.length>3){setFileError('Tambahkan maksimal 3 lampiran.');return}
    setFileBusy(true);
    try{
      const extracted=await Promise.all(Array.from(list).map(extractAssistantFile));
      setFiles(items=>[...items,...extracted]);
    }catch(error){setFileError((error as Error).message)}
    finally{setFileBusy(false)}
  }
  useEffect(()=>{api<AssistantStatus>('/assistant/status').then(setAssistantStatus).catch(()=>{})},[]);
  async function send(value:string, attachments=activeAttachments) {
    const text=value.trim();if(!text||busy||fileBusy)return;
    setMessages(m=>[...m,{mine:true,text,files:attachments.map(file=>file.name)}]);setQuery('');setUseAttachments(true);setBusy(true);
    try{
      const result=await api<Reply>('/assistant/chat','POST',{message:text,attachments});
      setMessages(m=>[...m,{mine:false,...result}]);
    }catch(e){setMessages(m=>[...m,{mine:false,text:(e as Error).message}])}
    finally{setBusy(false)}
  }
  function selectPrompt(option:PromptOption){
    setPromptsOpen(false);
    if(option.attachment&&!files.length){
      setUseAttachments(true);
      setQuery(option.prompt);
      uploadInput.current?.click();
    }else if(option.edit){
      setUseAttachments(!!option.attachment);
      setQuery(option.prompt);
      promptInput.current?.focus();
    }else{
      void send(option.prompt,option.attachment?files:[]);
    }
  }
  async function apply(index:number,proposal:Proposal) {
    setBusy(true);
    try {
      const result=await api<{page:string}>('/assistant/apply','POST',{token:proposal.token});
      await Promise.all([reload(),api<Meeting[]>('/meetings').then(updateCount)]);
      notify('Usulan diterapkan.');navigate(result.page);
    } catch(e){setMessages(m=>[...m.map((msg,i)=>i===index?{...msg,proposal:undefined}:msg),{mine:false,text:(e as Error).message}])}
    finally{setBusy(false)}
  }
  return <Dialog title="Tanya asisten" className="drawer assistant-drawer" close={close}><div className="dialog-content assistant-content"><Pill tone="violet" dot>{assistantStatus.gateway?'Mode layanan AI':'Mode lokal'}</Pill>
    <AssistantPrompts menus={menus} projectId={projects[0]?.id} proposals={assistantStatus.proposalPrompts??[]} open={promptsOpen} setOpen={setPromptsOpen} disabled={busy||fileBusy} select={selectPrompt}/>
    {messages.map((m,i)=><div key={i} className={'chat-message '+(m.mine?'mine':'')}><p className="pre-wrap">{m.text}</p>{m.files?.length?<small className="muted">Lampiran · {m.files.join(' · ')}</small>:null}{m.references?.length?<ol className="assistant-sources">{m.references.map(source=><li key={source}>{source}</li>)}</ol>:null}{m.projects?.map(id=>projects.find(p=>p.id===id)).filter((p):p is ProjectRow=>Boolean(p)).map(p=><button className="table-link" key={p.id} onClick={()=>open(p)}>{p.detail.name} <ChevronRight size={14}/></button>)}{m.mom&&<AssistantMomFile mom={m.mom}/>}
      {m.weeklyExport&&<AssistantWeeklyExport request={m.weeklyExport}/>}
      {m.revenueExport&&<AssistantRevenueExport report={m.revenueExport}/>}
      {m.reportChoices?.map(choice=><button type="button" key={choice.prompt} className="table-link" disabled={busy||fileBusy} onClick={()=>void send(choice.prompt,[])}>{choice.label} <ChevronRight size={14}/></button>)}
      {m.export&&<a className="button space-top" href="/api/v1/projects/export.xlsx">Unduh Excel</a>}{m.proposal&&<div className="assistant-proposal"><p>{(({date,moderator,name,customer,pm,project,summary})=>[date,moderator,name,customer,pm,project,summary].filter(Boolean).join(' · '))(m.proposal.action)}</p><button className="button" onClick={()=>setMessages(v=>v.map((item,k)=>k===i?{...item,text:'Usulan dibatalkan.',proposal:undefined}:item))}>Batal</button> <button className="button primary" onClick={()=>apply(i,m.proposal!)} disabled={busy}>Terapkan</button></div>}</div>)}
    {busy&&<p className="muted space-top" role="status">Memproses…</p>}</div><form className="assistant-form assistant-compose" onSubmit={(e:FormEvent)=>{e.preventDefault();void send(query.trim()||(activeAttachments.length?'Ringkas lampiran':''))}}>
      {fileError&&<ErrorBox message={fileError}/>}
      {files.length>0&&<ul className="assistant-attachments" aria-label="File terlampir">{files.map((file,i)=><li key={file.name+i}>{file.name}<button type="button" className="icon-button" onClick={()=>setFiles(items=>items.filter((_,index)=>index!==i))} aria-label={'Lepas '+file.name}><X size={14}/></button></li>)}</ul>}
      {!useAttachments&&files.length>0&&<small className="muted">Lampiran tersedia untuk pertanyaan berikutnya.</small>}
      <div className="assistant-input-row">
        <label className={'button assistant-upload '+(fileBusy?'disabled':'')} title="Lampirkan file pendukung"><Paperclip size={16}/><span className="visually-hidden">Lampirkan file</span><input ref={uploadInput} type="file" accept={acceptedAssistantFiles} multiple disabled={fileBusy||busy||files.length>=3} onChange={event=>{if(event.currentTarget.files?.length)setUseAttachments(true);void attach(event.currentTarget.files);event.currentTarget.value=''}}/></label>
        <input ref={promptInput} value={query} onChange={e=>setQuery(e.target.value)} maxLength={2000} placeholder={activeAttachments.length?'Tanya isi lampiran…':'Tanya atau ketik perintah…'} aria-label="Pesan"/>
        <button className="button primary" disabled={(!query.trim()&&!activeAttachments.length)||busy||fileBusy} aria-label="Kirim"><ArrowRight size={17}/></button>
      </div>
      {fileBusy&&<small role="status" className="muted">Membaca lampiran…</small>}
    </form></Dialog>;
}

import { prepareReview } from './review-ready';
const root=createRoot(document.getElementById('root')!);
root.render(<div className="boot"><PendingStatus message="Menyiapkan Shockwave PMO…"/></div>);
prepareReview().then(()=>root.render(<App/>)).catch(error=>root.render(<div className="boot"><ErrorBox message={error.message}/></div>));
