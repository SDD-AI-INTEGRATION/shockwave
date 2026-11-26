import { defaultDocumentBranding, type DocumentBranding, type DocumentLogoMenu } from '../../../packages/shared/document-branding';
import { DocumentBrandingContext } from './document-branding';
import { TextInput } from './form-controls';
import './styles.css';
import { NavIcon } from './nav-icon';
import { ShellBackTarget } from './shell-back';
import {
  ArrowRight, ChevronRight, FolderClosed,
  Paperclip, Search, X,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { roleNames, type Meeting, type ProjectRow } from '../../../packages/shared/domain';
import { Button, PendingButton, PendingStatus, api, dateLabel, defaultAppearance, Dialog, ErrorBox, Pill, type Appearance, type User, Toast } from './ui';
import { initialProjectListState, ProjectDrawer, Projects } from './projects';
import { ProjectExitGuard, type ProjectExitRequestHandler } from './project-edit-guard';
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
    {id:'projects',label:'Proyek'},
    {id:'meetings',label:'Rapat korporat'},
  ]},
  {group:'PMO', items:[
    {id:'assignment',label:'Penunjukan PM'},
    {id:'risk',label:'Daftar risiko'},
    {id:'operations',label:'Operasional'},
    {id:'mom',label:'Notulen (MOM)'},
    {id:'bast',label:'BAST'},
  ]},
  {group:'Admin',items:[{id:'admin',label:'Pengguna & audit'}]},
];
const labels: Record<string,string> = {...Object.fromEntries(navigation.flatMap(g=>g.items.map(i=>[i.id,i.label]))), account:'Pengaturan'};
const readPage = (hash:string) => {
  const path = hash.slice(1).split('/')[0] || 'projects';
  return Object.hasOwn(labels,path)?path:'projects';
};

const browserNavigation=(window as Window&{navigation?:{
  currentEntry?:{key:string};
  entries:()=>Array<{key:string}>;
  traverseTo:(key:string)=>{finished:Promise<unknown>};
}}).navigation;

function AssistantSpark() {
  return <svg className="assistant-spark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path className="assistant-star" d="M6.37599 6.96137L3.65785 8.03339C2.78072 8.37932 2.78072 9.62067 3.65784 9.96661L6.37599 11.0386C6.64378 11.1442 6.85575 11.3562 6.96137 11.624L8.03339 14.3422C8.37932 15.2193 9.62067 15.2193 9.96661 14.3422L11.0386 11.624C11.1442 11.3562 11.3562 11.1442 11.624 11.0386L14.3422 9.96661C15.2193 9.62068 15.2193 8.37932 14.3422 8.03339L11.624 6.96137C11.3562 6.85576 11.1442 6.64378 11.0386 6.37599L9.96661 3.65785C9.62068 2.78072 8.37932 2.78072 8.03339 3.65784L6.96137 6.37599C6.85576 6.64378 6.64378 6.85575 6.37599 6.96137Z"/><path className="assistant-star assistant-star-small" d="M15.3781 15.6879L13.3481 16.4885C12.884 16.6715 12.884 17.3285 13.3481 17.5115L15.3781 18.3121C15.5198 18.368 15.632 18.4802 15.6879 18.6219L16.4885 20.6519C16.6715 21.116 17.3285 21.116 17.5115 20.6519L18.3121 18.6219C18.368 18.4802 18.4802 18.368 18.6219 18.3121L20.6519 17.5115C21.116 17.3285 21.116 16.6715 20.6519 16.4885L18.6219 15.6879C18.4802 15.632 18.368 15.5198 18.3121 15.3781L17.5115 13.3481C17.3285 12.884 16.6715 12.884 16.4885 13.3481L15.6879 15.3781C15.632 15.5198 15.5198 15.632 15.3781 15.6879Z"/></g>
  </svg>;
}

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
  const [animateRail,setAnimateRail]=useState(false);
  const [projectList,setProjectList]=useState(initialProjectListState);
  const projectScroll=useRef(0);
  const [projects,setProjects]=useState<ProjectRow[]>([]);
  const [projectCatalog,setProjectCatalog]=useState<ProjectCatalog>();
  const [catalogError,setCatalogError]=useState('');
  const [draftBadge,setDraftBadge]=useState<{count:number;date:string}|null>(null);
  const [ready,setReady]=useState(false);
  const [hash,setHash]=useState(()=>location.hash);
  const routeHash=useRef(hash);
  const routeEntry=useRef(browserNavigation?.currentEntry?.key);
  const projectExitGuard=useRef<ProjectExitRequestHandler|null>(null);
  const applyHash=useCallback((next:string)=>{
    routeHash.current=next;
    routeEntry.current=browserNavigation?.currentEntry?.key;
    setHash(next);
  },[]);
  const showLogin=!user||hash.startsWith('#reset/');
  const [mobile,setMobile]=useState(false);
  const rail=useRef<HTMLElement>(null);
  const menuTrigger=useRef<HTMLButtonElement>(null);
  const menuClose=useRef<HTMLButtonElement>(null);
  const [backTarget,setBackTarget]=useState<HTMLDivElement|null>(null);
  const [railHint,setRailHint]=useState<{text:string;top:number;left:number}>();
  const [documentBranding,setDocumentBranding]=useState(defaultDocumentBranding);
  const brandingQueue=useRef(Promise.resolve());
  const brandingSession=useRef(0);
  function updateDocumentBranding(scope:DocumentLogoMenu|'global',logo:string){
    const session=brandingSession.current;
    const update=brandingQueue.current.then(async()=>{
      if(session!==brandingSession.current)throw new Error('Sesi logo dokumen telah berakhir.');
      const next=await api<DocumentBranding>('/me/document-branding','PATCH',{scope,logo});
      if(session===brandingSession.current)setDocumentBranding(next);
    });
    brandingQueue.current=update.catch(()=>{});
    return update;
  }
  const appearanceRef=useRef(appearance);
  const appearanceQueue=useRef(Promise.resolve());
  const appearanceRevision=useRef(0);
  const stableAppearance=useRef(defaultAppearance);
  function closeMobile(){
    setMobile(false);
    menuTrigger.current?.focus({preventScroll:true});
  }
  function showRailHint(button:HTMLElement,label:string){
    if(!collapsed||mobile)return;
    const rect=button.getBoundingClientRect();
    setRailHint({text:label,top:rect.top+rect.height/2,left:rect.right+12});
  }
  useEffect(()=>{
    if(!mobile)return;
    const desktop=matchMedia('(min-width: 1100.01px)');
    const closeAtDesktop=()=>{if(desktop.matches)setMobile(false)};
    desktop.addEventListener?.('change',closeAtDesktop);
    menuClose.current?.focus();
    return ()=>desktop.removeEventListener?.('change',closeAtDesktop);
  },[mobile]);
  const [search,setSearch]=useState(false);
  const [assistant,setAssistant]=useState(false);
  const [assistantWidth,setAssistantWidth]=useState(384);
  const assistantTrigger=useRef<HTMLButtonElement>(null);
  const [detail,setDetail]=useState<ProjectRow|null>(null);
  const [toast,setToast]=useState('');
  const [account,setAccount]=useState(false);
  const navigate = useCallback((next:string)=>{
    function proceed(){
      if(readPage(routeHash.current)==='projects')projectScroll.current=window.scrollY;
      location.hash=next;
      applyHash(location.hash);
      setMobile(false);setAccount(false);
      if(readPage(location.hash)!=='projects')window.scrollTo(0,0);
    }
    const leavePage=readPage('#'+next)!==readPage(routeHash.current);
    if(!leavePage||!projectExitGuard.current?.({proceed}))proceed();
  },[applyHash]);
  useEffect(()=>{
    function onHashChange(){
      const current=routeHash.current;
      const next=location.hash;
      if(next===current){
        routeEntry.current=browserNavigation?.currentEntry?.key;
        return;
      }
      const previousEntry=routeEntry.current;
      function restoreHash(hash:string){
        if(location.hash!==hash)history.replaceState(history.state,'',hash||location.pathname+location.search);
      }
      const proceed=()=>{restoreHash(next);applyHash(next)};
      function cancel(){
        if(browserNavigation&&previousEntry&&browserNavigation.entries().some(entry=>entry.key===previousEntry)){
          void browserNavigation.traverseTo(previousEntry).finished.catch(()=>restoreHash(current));
        }else restoreHash(current);
      }
      const leavePage=readPage(next)!==readPage(current)||next.startsWith('#reset/');
      if(!leavePage||!projectExitGuard.current?.({proceed,cancel}))proceed();
    }
    window.addEventListener('hashchange',onHashChange);
    return ()=>window.removeEventListener('hashchange',onHashChange);
  },[applyHash]);
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
  const updateCount=useCallback((meetings:Meeting[])=>{
    const draft=meetings.find(meeting=>meeting.status==='draft');
    setDraftBadge(draft?{count:draft.projects.filter(project=>project.review.status==='pending').length,date:draft.date}:null);
  },[]);
  useEffect(()=>{
    if(!user){setReady(false);return}
    setError('');
    let live=true;
    Promise.all([reload(),api<Appearance&{collapsed:boolean;documentBranding?:DocumentBranding}>('/me/preferences'),api<Meeting[]>('/meetings')])
      .then(([,preferences,meetings])=>{
        if(!live)return;
        setCollapsed(Boolean(preferences.collapsed));
        const next={theme:preferences.theme??defaultAppearance.theme,accent:preferences.accent??defaultAppearance.accent};
        stableAppearance.current=appearanceRef.current=next;
        setAppearance(next);
        setDocumentBranding(preferences.documentBranding??defaultDocumentBranding);
        updateCount(meetings);
        setReady(true);
      }).catch(e=>{if(live)setError(e.message)});
    return ()=>{live=false};
  },[user,reload,updateCount]);
  useEffect(()=>{
    setProjectCatalog(undefined);setCatalogError('');
    if(!user||user.role==='VIEWER'||(user.menus&&!user.menus.includes('projects')))return;
    let live=true;
    api<ProjectCatalog>('/projects/catalog').then(value=>{if(live)setProjectCatalog(value)})
      .catch(error=>{if(live)setCatalogError(error.message)});
    return ()=>{live=false};
  },[user]);
  function changeAppearance(next:Appearance){
    const patch:Partial<Appearance>={};
    if(next.theme!==appearanceRef.current.theme)patch.theme=next.theme;
    if(next.accent!==appearanceRef.current.accent)patch.accent=next.accent;
    if(!Object.keys(patch).length)return;
    const revision=++appearanceRevision.current;
    appearanceRef.current=next;
    setAppearance(next);
    appearanceQueue.current=appearanceQueue.current.then(async()=>{
      try {
        const saved=await api<Appearance>('/me/preferences','PATCH',patch);
        stableAppearance.current={theme:saved.theme,accent:saved.accent};
      }catch(error){notify((error as Error).message)}
      if(revision===appearanceRevision.current){
        appearanceRef.current=stableAppearance.current;
        setAppearance(stableAppearance.current);
        try{localStorage.setItem('shockwave:appearance',JSON.stringify(stableAppearance.current))}catch{}
      }
    });
  }
  async function toggleRail(){
    setRailHint(undefined);
    const next=!collapsed;
    setAnimateRail(true);
    setCollapsed(next);
    try{await api('/me/preferences','PATCH',{collapsed:next})}
    catch(error){setCollapsed(value=>value===next?!next:value);notify((error as Error).message)}
  }
  const {theme,accent}=showLogin?defaultAppearance:appearance;
  useLayoutEffect(()=>{
    if(booting||(!showLogin&&!ready))return;
    const {dataset}=document.documentElement;
    const os=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{
      const resolved=theme==='system'?(os.matches?'dark':'light'):theme;
      dataset.theme=resolved;
      dataset.accent=accent;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='dark'?'#111528':'#f6f7fb');
    };
    apply();
    if(theme!=='system')return;
    if(typeof os.addEventListener==='function'){
      os.addEventListener('change',apply);
      return ()=>os.removeEventListener('change',apply);
    }
    os.addListener(apply);
    return ()=>os.removeListener(apply);
  },[theme,accent,booting,showLogin,ready]);
  useEffect(()=>{
    if(!ready||showLogin)return;
    try{localStorage.setItem('shockwave:appearance',JSON.stringify(stableAppearance.current))}catch{}
  },[ready,showLogin]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&user&&!detail){event.preventDefault();setSearch(true)}
      if(event.key==='Escape'&&!event.defaultPrevented){if(mobile)closeMobile();setAccount(false);setRailHint(undefined)}
    };
    function expired(){brandingSession.current++;setUser(null);setReady(false);setError('Sesi berakhir. Silakan masuk kembali.');location.hash='login';applyHash(location.hash)}
    addEventListener('shockwave-session-expired',expired);addEventListener('keydown',key);
    return ()=>{removeEventListener('shockwave-session-expired',expired);removeEventListener('keydown',key)};
  },[user,detail,mobile,applyHash]);
  async function logout() {
    brandingSession.current++;
    try {await api('/auth/logout','POST');setUser(null);setAccount(false);try{localStorage.removeItem('shockwave:appearance')}catch{}location.hash='login';} catch(e){notify((e as Error).message)}
  }
  function login(next:User) {
    brandingSession.current++;
    setDocumentBranding(defaultDocumentBranding);
    stableAppearance.current=appearanceRef.current=defaultAppearance;
    setAppearance(defaultAppearance);
    setProjectList(initialProjectListState);
    setReady(false);
    setUser(next);
    navigate('projects');
    projectScroll.current=0;
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
  const showAssistant=assistant&&available('assistant');
  return <DocumentBrandingContext.Provider value={{branding:documentBranding,update:updateDocumentBranding}}><ProjectExitGuard.Provider value={projectExitGuard}><div className={'app-shell '+(animateRail?'motion-shell ':'')+(collapsed?'rail-collapsed ':'')+(showAssistant?'with-assistant':'')}
    style={{'--assistant-width':assistantWidth+'px'} as CSSProperties}>
    {mobile&&<div className="mobile-backdrop" onClick={closeMobile} aria-hidden="true"/>}
    <aside id="primary-navigation" ref={rail} className={'rail '+(mobile?'mobile-open':'')} aria-label="Navigasi utama" onKeyDown={event=>{
      if(!mobile||event.key!=='Tab')return;
      const targets=[...(rail.current?.querySelectorAll<HTMLElement>('button:not([disabled])')??[])].filter(element=>element.getClientRects().length);
      const first=targets[0], last=targets.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }}>
      <button className="brand" onClick={()=>navigate('projects')} title="Shockwave PMO"><img src="/brand/shockwave-mark.png" alt=""/><span><strong>Shockwave</strong><small>SDD Project Management Office</small></span></button>
      <button className="icon-button mobile-close" ref={menuClose} onClick={closeMobile} aria-label="Tutup navigasi"><X size={19}/></button>
      <nav>{visibleNavigation.map(group=><div className="nav-group" key={group.group}><div className="nav-group-title">{group.group}</div>{group.items.filter(item=>item.id!=='assignment'||user.role!=='NOTULIS').map(item=><button aria-label={item.label} key={item.id} onPointerEnter={e=>showRailHint(e.currentTarget,item.id==='meetings'&&draftBadge?.count?draftBadge.count+' proyek belum ditinjau · Draf '+dateLabel(draftBadge.date,'short'):item.label)} onPointerLeave={()=>setRailHint(undefined)} onFocus={e=>showRailHint(e.currentTarget,item.id==='meetings'&&draftBadge?.count?draftBadge.count+' proyek belum ditinjau · Draf '+dateLabel(draftBadge.date,'short'):item.label)} onBlur={()=>setRailHint(undefined)} onClick={()=>{setRailHint(undefined);navigate(item.id)}} className="nav-item" aria-current={currentPage===item.id?'page':undefined}><NavIcon name={item.id}/><span>{item.label}</span>{item.id==='meetings'&&draftBadge&&draftBadge.count>0&&<b className="nav-count" title={draftBadge.count+' proyek belum ditinjau pada draf '+dateLabel(draftBadge.date)}>{draftBadge.count}</b>}</button>)}</div>)}</nav>
      <div className="rail-bottom">
        <button className="nav-item" onClick={()=>navigate('account')} aria-current={currentPage==='account'?'page':undefined} aria-label="Pengaturan" onPointerEnter={e=>showRailHint(e.currentTarget,'Pengaturan')} onPointerLeave={()=>setRailHint(undefined)} onFocus={e=>showRailHint(e.currentTarget,'Pengaturan')} onBlur={()=>setRailHint(undefined)}><NavIcon name="settings"/><span>Pengaturan</span></button>
        <button className="nav-item rail-toggle" onClick={toggleRail} title={railToggleLabel} aria-label={railToggleLabel}>
          <NavIcon name={collapsed?'expand':'collapse'}/>
          <span>{railToggleLabel}</span>
        </button>
        <div className="account-wrap">
          {account&&<div className="account-menu">
            <div className="account-identity">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button className={user.demo?undefined:'logout-button'} onClick={logout}><NavIcon name="signout"/>{user.demo?'Masuk dengan akun':'Keluar'}</button>
          </div>}
          <button className="rail-profile" onClick={()=>setAccount(!account)} aria-expanded={account} title={user.name}><span className="avatar">{initials}</span><span className="profile-text"><strong>{user.name}</strong><small>{user.demo?'Admin PMO':roleNames[user.role]}</small></span><ChevronRight size={16} className="profile-arrow"/></button>
        </div>
      </div>
    </aside>
    {railHint&&collapsed&&!mobile&&<span className="rail-hint" aria-hidden="true" style={{top:railHint.top,left:railHint.left}}>{railHint.text}</span>}
    <div className="app-main">
      <header className="topbar">
        <div className="topbar-leading">
          <button className="icon-button mobile-toggle" ref={menuTrigger} onClick={()=>{setRailHint(undefined);setMobile(true)}}
            aria-label="Buka navigasi" aria-controls="primary-navigation" aria-expanded={mobile}><NavIcon name="menu"/></button>
          <div className="topbar-context" ref={setBackTarget}/>
        </div>
        <div className="topbar-actions"><button className="global-search" aria-label="Cari proyek atau halaman" onClick={()=>setSearch(true)}><NavIcon name="search"/><span>Cari proyek atau halaman</span><kbd>Ctrl K</kbd></button>{available('assistant')&&<Button className="button assistant-button" data-sweep-paused={!ready||showAssistant?'true':undefined} aria-label="Tanya asisten" aria-expanded={showAssistant} aria-controls={showAssistant?'assistant-workspace':undefined} ref={assistantTrigger} onClick={()=>setAssistant(value=>!value)}><AssistantSpark/><span>Tanya asisten</span></Button>}</div>
      </header>
      <ShellBackTarget.Provider value={backTarget}><main key={currentPage} className={'content content-'+currentPage+(ready?' motion-page':'')}>
        {error&&<ErrorBox message={error}/>}
        {!ready&&!error&&<div className="fields"><PendingStatus message="Memuat ruang kerja…"/><div className="skeleton" aria-hidden="true"/></div>}
        {ready&&currentPage==='projects'&&<Projects projects={projects} catalog={projectCatalog} catalogError={catalogError} canImport={Boolean(user.workspaceAdmin)} canManage={canManage} reload={reload} notify={notify} openProject={setDetail} renderDrawer={renderProjectDrawer} list={projectList} updateList={setProjectList} scroll={projectScroll}/>}
        {ready&&currentPage==='meetings'&&<Meetings user={user} projects={projects} notify={notify} onChange={updateCount}/>}
        {ready&&['assignment','risk','mom'].includes(currentPage)&&<Documents key={currentPage} kind={currentPage as 'assignment'|'risk'|'mom'} projects={projects} user={user} notify={notify}/>}
        {ready&&currentPage==='operations'&&<Operations projects={projects} user={user} notify={notify}/>}
        {ready&&currentPage==='bast'&&<Bast projects={projects} userId={user.id} allowLogoChange={!user.demo&&user.role!=='VIEWER'}/>}
        {ready&&currentPage==='account'&&<Account passkeyAvailable={passkeyAvailable&&user.workspaceAdmin!==false} user={user} appearance={appearance} changeAppearance={changeAppearance} notify={notify}/>}
        {ready&&currentPage==='admin'&&<Admin notify={notify} user={user}/>}
      </main></ShellBackTarget.Provider>
    </div>
    {search&&<GlobalSearch available={available} projects={available('projects')?projects:[]} close={()=>setSearch(false)} choose={value=>{setSearch(false);if(typeof value==='string')navigate(value);else setDetail(value)}}/>}
    {showAssistant&&<Assistant menus={user.menus} width={assistantWidth} resize={setAssistantWidth}
      close={()=>{setAssistant(false);assistantTrigger.current?.focus()}} projects={projects} open={setDetail} navigate={navigate}
      reload={reload} notify={notify} updateCount={updateCount}/>}
    {(!ready||currentPage!=='projects')&&renderProjectDrawer()}
    {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}
  </div></ProjectExitGuard.Provider></DocumentBrandingContext.Provider>;
}

function GlobalSearch({projects, close, choose, available}: {projects:ProjectRow[];close:()=>void;choose:(value:ProjectRow|string)=>void;available:(id:string)=>boolean}) {
  const [query,setQuery]=useState('');
  const q=query.trim().toLowerCase();
  const pages=navigation.flatMap(group=>group.items).filter(p=>available(p.id)&&p.id!=='admin'&&p.label.toLowerCase().includes(q));
  const matching=q?projects.filter(p=>[p.id,p.detail.name,p.detail.customer,p.detail.pm].join(' ').toLowerCase().includes(q)).slice(0,7):[];
  const field=useRef<HTMLInputElement>(null);
  function move(event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    const results=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('.command-results button')];
    if(!results.length)return;
    event.preventDefault();
    const index=results.indexOf(document.activeElement as HTMLButtonElement);
    const step=event.key==='ArrowDown'?1:-1;
    const to=index<0?(step>0?0:results.length-1):index+step;
    (results[to]??field.current)?.focus();
  }
  return <Dialog title="Cari proyek atau halaman" close={close} restoreFocus initialFocus={field} className="global-search-dialog">
    <div className="dialog-content command-search" onKeyDown={move}>
      <label className="search-box"><Search size={18} aria-hidden="true"/>
        <TextInput ref={field} aria-label="Cari proyek atau halaman" placeholder="Cari proyek…" value={query} onChange={e=>setQuery(e.target.value)}/>
      </label>
      {matching.length>0&&<div className="command-results"><small>Proyek</small>{matching.map(p=><button type="button" key={p.id} onClick={()=>choose(p)}>
        <FolderClosed size={17} aria-hidden="true"/><span className="command-label"><strong>{p.detail.name}</strong>
          <small>{[p.id,p.detail.customer,p.detail.pm].filter(Boolean).join(' · ')}</small></span><ChevronRight size={16} aria-hidden="true"/>
      </button>)}</div>}
      {pages.length>0&&<div className="command-results"><small>Halaman</small>{pages.map(p=><button type="button" key={p.id} onClick={()=>choose(p.id)}>
        <NavIcon name={p.id}/><span className="command-label"><strong>{p.label}</strong></span><ChevronRight size={16} aria-hidden="true"/>
      </button>)}</div>}
      {pages.length===0&&matching.length===0&&<p role="status" className="muted">Tidak ada hasil untuk “{query}”.</p>}
    </div>
  </Dialog>;
}

type Proposal={token:string;action:{type:string;date?:string;moderator?:string;name?:string;customer?:string;pm?:string;project?:string;summary?:string}};
type Reply=AssistantReportReply & {projects?:string[];export?:boolean;proposal?:Proposal;files?:string[];mom?:MomData};
function Assistant({close,projects,open,navigate,notify,updateCount,reload,menus,width,resize}: {
  width:number;resize:(width:number)=>void;menus?:User['menus'];close:()=>void;projects:ProjectRow[];open:(p:ProjectRow)=>void;navigate:(page:string)=>void;notify:(msg:string)=>void;updateCount:(m:Meeting[])=>void;reload:()=>Promise<void>;
}) {
  const [query,setQuery]=useState('');
  const [messages,setMessages]=useState<(Reply&{mine:boolean})[]>([]);
  const [busy,setBusy]=useState(false);
  const [assistantStatus,setAssistantStatus]=useState<AssistantStatus>({gateway:false,proposalPrompts:[]});
  const [promptsOpen,setPromptsOpen]=useState(true);
  const panel=useRef<HTMLElement>(null);
  const conversation=useRef<HTMLDivElement>(null);
  const resizeStart=useRef<{x:number;width:number}|null>(null);
  const promptInput=useRef<HTMLInputElement>(null);
  const uploadInput=useRef<HTMLInputElement>(null);
  const [files,setFiles]=useState<(AssistantAttachment&{fileType:string})[]>([]);
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
      const extracted=await Promise.all(Array.from(list).map(async file=>({
        ...await extractAssistantFile(file),fileType:file.name.split('.').pop()?.toUpperCase()||'File',
      })));
      setFiles(items=>[...items,...extracted]);
    }catch(error){setFileError((error as Error).message)}
    finally{setFileBusy(false)}
  }
  useEffect(()=>{api<AssistantStatus>('/assistant/status').then(setAssistantStatus).catch(()=>{})},[]);
  async function send(value:string, attachments=activeAttachments) {
    const text=value.trim();if(!text||busy||fileBusy)return;
    setPromptsOpen(false);
    setMessages(m=>[...m,{mine:true,text,files:attachments.map(file=>file.name)}]);setQuery('');setUseAttachments(true);setBusy(true);
    try{
      const result=await api<Reply>('/assistant/chat','POST',{message:text,attachments:attachments.map(({name,text})=>({name,text}))});
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
  useEffect(()=>{promptInput.current?.focus({preventScroll:true})},[]);
  useEffect(()=>{
    if(conversation.current)conversation.current.scrollTop=conversation.current.scrollHeight;
  },[messages,busy]);
  const clampWidth=(value:number)=>Math.min(Math.max(360,value),600);
  return <aside id="assistant-workspace" ref={panel} className="assistant-workspace" aria-label="Tanya asisten"
    onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close()}}}>
    <div className="assistant-resizer" role="separator" aria-orientation="vertical" aria-label="Lebar panel asisten"
      aria-valuemin={360} aria-valuemax={600} aria-valuenow={width} tabIndex={0} title="Seret atau gunakan tombol panah"
      onPointerDown={event=>{resizeStart.current={x:event.clientX,width:panel.current?.offsetWidth??width};event.currentTarget.setPointerCapture(event.pointerId)}}
      onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId)&&resizeStart.current)resize(clampWidth(resizeStart.current.width+resizeStart.current.x-event.clientX))}}
      onKeyDown={event=>{
        if(event.key==='Home'){event.preventDefault();resize(384)}
        if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();resize(clampWidth(width+(event.key==='ArrowLeft'?20:-20)))}
      }}/>
    <header className="assistant-header">
      <h2>Tanya asisten</h2>
      <Button type="button" className="icon-button assistant-close" onClick={close} aria-label="Tutup asisten" title="Tutup asisten"><X size={19}/></Button>
      <div className="assistant-header-actions">
        <span className="assistant-mode">{assistantStatus.gateway?'Mode layanan AI':'Mode lokal · Pertanyaan dan tindakan yang tersedia'}</span>
        <Button className="button" type="button" disabled={busy||fileBusy||!messages.length&&!query&&!files.length}
          onClick={()=>{setMessages([]);setFiles([]);setQuery('');setFileError('');setUseAttachments(true);setPromptsOpen(true);promptInput.current?.focus()}}>Percakapan baru</Button>
      </div>
    </header>
    <div ref={conversation} className="assistant-content" role="log" aria-live="polite">
    <AssistantPrompts menus={menus} projectId={projects[0]?.id} proposals={assistantStatus.proposalPrompts??[]} open={promptsOpen} setOpen={setPromptsOpen} disabled={busy||fileBusy} select={selectPrompt}/>
    {!messages.length&&!busy&&<p className="muted space-small">Pilih contoh pertanyaan atau tulis pesan untuk mulai.</p>}
    {messages.map((m,i)=><div key={i} className={'chat-message '+(m.mine?'mine':'')}><p className="pre-wrap">{m.text}</p>{m.files?.length?<small className="muted">Lampiran · {m.files.join(' · ')}</small>:null}{m.references?.length?<ol className="assistant-sources">{m.references.map(source=><li key={source}>{source}</li>)}</ol>:null}{m.projects?.map(id=>projects.find(p=>p.id===id)).filter((p):p is ProjectRow=>Boolean(p)).map(p=><button className="table-link" key={p.id} onClick={()=>open(p)}>{p.detail.name} <ChevronRight size={14}/></button>)}{m.mom&&<AssistantMomFile mom={m.mom}/>}
      {m.weeklyExport&&<AssistantWeeklyExport request={m.weeklyExport}/>}
      {m.revenueExport&&<AssistantRevenueExport report={m.revenueExport}/>}
      {m.reportChoices?.map(choice=><button type="button" key={choice.prompt} className="table-link" disabled={busy||fileBusy} onClick={()=>void send(choice.prompt,[])}>{choice.label} <ChevronRight size={14}/></button>)}
      {m.export&&<a className="button space-top" href="/api/v1/projects/export.xlsx">Unduh Excel</a>}{m.proposal&&<div className="assistant-proposal"><p>{(({date,moderator,name,customer,pm,project,summary})=>[date,moderator,name,customer,pm,project,summary].filter(Boolean).join(' · '))(m.proposal.action)}</p><Button className="button" onClick={()=>setMessages(v=>v.map((item,k)=>k===i?{...item,text:'Usulan dibatalkan.',proposal:undefined}:item))}>Batal</Button> <Button className="button primary" onClick={()=>apply(i,m.proposal!)} disabled={busy}>Terapkan</Button></div>}</div>)}
    {busy&&<p className="muted space-top" role="status">Memproses…</p>}</div><form className="assistant-form assistant-compose" onSubmit={(e:FormEvent)=>{e.preventDefault();void send(query.trim()||(activeAttachments.length?'Ringkas lampiran':''))}}>
      {fileError&&<ErrorBox message={fileError}/>}
      {files.length>0&&<ul className="assistant-attachments" aria-label="File terlampir">{files.map((file,i)=><li key={file.name+i}><span>{file.name}</span><small>{file.fileType}</small><button type="button" className="icon-button" onClick={()=>setFiles(items=>items.filter((_,index)=>index!==i))} aria-label={'Lepas '+file.name}><X size={14}/></button></li>)}</ul>}
      {!useAttachments&&files.length>0&&<small className="muted">Lampiran tersedia untuk pertanyaan berikutnya.</small>}
      <div className="assistant-input-row">
        <label className={'button assistant-upload '+(fileBusy?'disabled':'')} title="Lampirkan file pendukung"><Paperclip size={16}/><span className="visually-hidden">Lampirkan file</span><input ref={uploadInput} type="file" accept={acceptedAssistantFiles} multiple disabled={fileBusy||busy||files.length>=3} onChange={event=>{if(event.currentTarget.files?.length)setUseAttachments(true);void attach(event.currentTarget.files);event.currentTarget.value=''}}/></label>
        <TextInput ref={promptInput} value={query} onChange={e=>setQuery(e.target.value)} maxLength={2000} placeholder={activeAttachments.length?'Ringkas isi lampiran':'Berapa jumlah proyek aktif?'} aria-label="Pesan"/>
        <PendingButton type="submit" className="button primary" disabled={(!query.trim()&&!activeAttachments.length)||fileBusy} pending={busy?'Mengirim…':undefined} aria-label={busy?'Mengirim pesan':'Kirim'}><ArrowRight size={17}/></PendingButton>
      </div>
      {fileBusy&&<small role="status" className="muted">Membaca lampiran…</small>}
    </form></aside>;
}

import { prepareReview } from './review-ready';
const root=createRoot(document.getElementById('root')!);
root.render(<div className="boot"><PendingStatus message="Menyiapkan Shockwave PMO…"/></div>);
prepareReview().then(()=>root.render(<App/>)).catch(error=>root.render(<div className="boot"><ErrorBox message={error.message}/></div>));
