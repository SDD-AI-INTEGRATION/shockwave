import { administratorGroup, assignGroupSchema, groupSchema, newPersonSchema, normalizedProjectName, type WorkspaceGroup, type WorkspaceMenu, type WorkspacePerson } from '../../packages/shared/workspace-admin';
import { contractAmount, parseContractDates, pillars, resolvePillar, type Project, type ProjectRow } from '../../packages/shared/domain';
import ExcelJS from 'exceljs';
import { blankReview, meetingChecks, meetingReadiness, meetingCreateSchema, meetingUpdateSchema, newMeeting, projectMetrics, reviewSchema, unchangedReview, validateMeetingDate, type Meeting } from '../../packages/shared/domain';
import {
  passkeyAuthenticationOptions, passkeyRegistrationOptions, validatePasskeyAuthentication, validatePasskeyRegistration, type StoredPasskey,
} from '../../packages/shared/passkeys';
import { prepareAssignment } from '../../packages/shared/assignment';
import { logbookSchema, logbookScope } from '../../packages/shared/logbook';
import { assistantQuestionSchema, referenceAnswer } from '../../packages/shared/assistant-knowledge';
import { sampleMomReply } from '../../packages/shared/mom-sample';
import { assistantReportReply } from '../../packages/shared/assistant-reports';
import { duplicateProjectName, projectCatalog, projectImportRows, validateProjectDraft } from '../../packages/shared/project-entry';
import demo from '../../packages/shared/review.json';

type Doc = {id:string;updated:string;version:number;data:Record<string,unknown>};
type State = {
  loggedIn:boolean; failures:number; blockedUntil:number; expires:number; password:string;
  preferences:{theme:string;accent:string;collapsed:boolean};
  sessionUser?:string; groups?:WorkspaceGroup[]; people?:Array<WorkspacePerson&{digest:string;preferences?:State['preferences']}>;
  importedProjects?:Project[];
  meetings:Meeting[]; documents:Record<string,Doc[]>;
  verifiedProjects?:string[];
  passkeys?:StoredPasskey[];
  assignmentCounters?:Record<string,number>;
  passkeyLogin?:{challenge:string;expires:number};
  passkeyRegistration?:{challenge:string;expires:number;session:number};
};
const identity={id:'reviewer',name:'Reviewer Demo',email:'reviewer@shockwave.test',nik:'REVIEW01',role:'MANAGER_PMO',demo:false};
const base:State={loggedIn:false,failures:0,blockedUntil:0,expires:0,password:demo.passwordDigest,
  preferences:{theme:'system',accent:'shockwave',collapsed:false},meetings:demo.meetings as Meeting[],documents:{}};
const database=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('shockwave-review',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('review');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
async function read(){
  const db=await database;
  return new Promise<State>((resolve,reject)=>{
    const request=db.transaction('review').objectStore('review').get('state');
    request.onsuccess=()=>resolve(request.result??structuredClone(base));
    request.onerror=()=>reject(request.error);
  });
}
async function persist(state:State){
  const db=await database;
  return new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction('review','readwrite');
    transaction.objectStore('review').put(state,'state');
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error);
  });
}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message:string,status:number)=>json({message},status);
const active=(state:State)=>state.loggedIn&&state.expires>Date.now();
const hash=async(password:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('shockwave-review:v1:'+password))),b=>b.toString(16).padStart(2,'0')).join('');
const shockwaveProject:Project={
  id:'P009',number:9,verification:true,latestText:'',priorText:'',
  detail:{name:'Shockwave PMO',customer:'Internal SDD',pm:'',sales:'',period:'',value:'',billing:'',resourceCount:'',notes:'Pengembangan aplikasi Shockwave PMO.'},
};
function userGroup(state:State,person?:WorkspacePerson){
  return person?(state.groups??[]).find(group=>group.id===person.groupId):administratorGroup;
}
function publicUser(state:State){
  if(!active(state))return null;
  if(!state.sessionUser||state.sessionUser===identity.id)return {...identity,menus:administratorGroup.menus,workspaceAdmin:true};
  const person=state.people?.find(row=>row.id===state.sessionUser);
  const group=person&&userGroup(state,person);
  return person&&group?{id:person.id,name:person.name,email:person.email,nik:'',role:group.edit?'MANAGER_PMO':'VIEWER',demo:false,menus:group.menus,workspaceAdmin:false}:null;
}
function routeMenu(path:string):WorkspaceMenu|undefined {
  if(path==='projects/export.xlsx'||path==='projects/import'||path.startsWith('projects/'))return 'projects';
  if(/^meetings(?:\/|$)/.test(path))return 'meetings';
  if(/^assistant(?:\/|$)/.test(path))return 'assistant';
  const doc=/^documents\/(operations|logbook|assignment|risk|mom)(?:\/|$)/.exec(path)?.[1];
  return doc==='logbook'?'operations':doc as WorkspaceMenu|undefined;
}
function currentProjects(state:State){
  const all=new Map<string,Project>(demo.projects.map(project=>[project.id,project]));
  if(!demo.projects.some(project=>normalizedProjectName(project.detail.name)===normalizedProjectName(shockwaveProject.detail.name)))all.set(shockwaveProject.id,shockwaveProject);
  for(const project of state.importedProjects??[])all.set(project.id,project);
  return [...all.values()];
}
function updateDraftProjects(state:State,projects:Project[]){
  for(const meeting of state.meetings){
    if(meeting.status!=='draft')continue;
    for(const project of projects){
      const existing=meeting.projects.find(row=>row.id===project.id);
      if(existing){existing.detail=project.detail;existing.verification=project.verification}
      else meeting.projects.push({id:project.id,number:project.number,detail:project.detail,verification:project.verification,review:structuredClone(blankReview),previousText:''});
    }
    meeting.version++;
  }
}
function projectSource(state:State) {
  return currentProjects(state).map(p=>state.verifiedProjects?.includes(p.id)?{...p,verification:false}:p);
}
function catalogFor(state:State){
  return projectCatalog([...currentProjects(state),...(demo.projects as Project[])]);
}
function projectRow(project:Project):ProjectRow {
  return {...project,entrySource:project.entrySource??(project.importedRevenue?'excel':undefined),...projectMetrics(project)};
}
function rows(state:State,query:URLSearchParams){
  const q=(query.get('q')||'').toLowerCase().trim();
  const requestedPillar=query.get('pillar');
  const pillar=requestedPillar?resolvePillar(requestedPillar)?.label:undefined;
  return projectSource(state).map(project=>projectRow(project)).filter(p=>
    [p.id,p.detail.name,p.detail.customer,p.detail.pm,p.pillar,p.sub].join(' ').toLowerCase().includes(q)&&
    (!query.get('status')||query.get('status')===p.status)&&(!requestedPillar||pillar===p.pillar)&&
    (query.get('hasRevenue')!=='true'||p.reported)&&(query.get('verification')!=='true'||p.verification));
}

async function handle(request:Request,url:URL){
  const path=url.pathname.slice('/api/v1/'.length),method=request.method;
  const state=await read();
  if(path==='auth/me') return json({user:publicUser(state),demoEnabled:false,resetAvailable:false,googleAvailable:false,passkeyAvailable:!state.sessionUser||state.sessionUser===identity.id});
  if(method!=='GET'&&request.headers.get('X-Shockwave-Request')!=='1')return fail('Permintaan ditolak.',403);
  const body=method==='GET'?null:await request.json().catch(()=>null) as any;
  if(path==='auth/login'&&method==='POST'){
    if(state.blockedUntil>Date.now())return fail('Terlalu banyak percobaan. Coba kembali dalam 15 menit.',429);
    const email=String(body?.id).trim().toLowerCase();
    const owner=email===identity.email;
    const candidate=state.people?.find(row=>row.email===email);
    const digest=candidate?await hash(candidate.id+':'+String(body?.password)):await hash(String(body?.password));
    if(!(owner&&digest===state.password||candidate&&digest===candidate.digest&&userGroup(state,candidate))){
      if(++state.failures>=5){state.failures=0;state.blockedUntil=Date.now()+15*60_000}
      await persist(state);return fail('Email atau kata sandi tidak cocok.',401);
    }
    state.loggedIn=true;state.sessionUser=owner?identity.id:candidate!.id;
    state.failures=0;state.blockedUntil=0;state.expires=Date.now()+8*3600_000;
    delete state.passkeyLogin;delete state.passkeyRegistration;
    await persist(state);return json({user:publicUser(state),passkeyAvailable:owner});
  }
  if(path==='auth/logout'&&method==='POST'){state.loggedIn=false;delete state.sessionUser;state.expires=0;delete state.passkeyRegistration;delete state.passkeyLogin;await persist(state);return json({ok:true})}
  if(path==='auth/passkeys/login/options'&&method==='POST'){
    if(state.blockedUntil>Date.now())return fail('Terlalu banyak percobaan. Coba kembali dalam 15 menit.',429);
    if(!state.passkeys?.length)return fail('Daftarkan passkey dari Pengaturan setelah masuk dengan email dan kata sandi.',400);
    const options=await passkeyAuthenticationOptions(url.origin);
    state.passkeyLogin={challenge:options.challenge,expires:Date.now()+120_000};
    await persist(state);
    return json(options);
  }
  if(path==='auth/passkeys/login/verify'&&method==='POST'){
    if(state.blockedUntil>Date.now())return fail('Terlalu banyak percobaan. Coba kembali dalam 15 menit.',429);
    const flow=state.passkeyLogin;
    delete state.passkeyLogin;
    await persist(state);
    if(!flow||flow.expires<=Date.now())return fail('Sesi passkey kedaluwarsa. Silakan coba lagi.',400);
    const credential=state.passkeys?.find(key=>key.id===body?.id);
    if(!credential)return fail('Passkey tidak ditemukan di preview pada browser ini.',400);
    try{credential.counter=await validatePasskeyAuthentication(url.origin,flow.challenge,body,credential,identity.id)}
    catch{return fail('Passkey gagal diverifikasi. Silakan coba lagi.',400)}
    state.loggedIn=true;state.sessionUser=identity.id;state.failures=0;state.blockedUntil=0;state.expires=Date.now()+8*3600_000;
    delete state.passkeyRegistration;
    await persist(state);
    return json({user:publicUser(state)});
  }
  const user=publicUser(state);
  if(!user)return fail('Sesi berakhir. Silakan masuk kembali.',401);
  const person=state.people?.find(row=>row.id===user.id);
  const menu=routeMenu(path);
  const meetingVerification=/^projects\/P\d+\/verify$/.test(path)&&user.menus.includes('meetings');
  if(menu&&!user.menus.includes(menu)&&!meetingVerification){
    if(path==='meetings'&&method==='GET')return json([]);
    return fail('Grup Anda tidak memiliki akses ke menu ini.',403);
  }
  if(menu&&method!=='GET'&&menu!=='assistant'&&user.role==='VIEWER')return fail('Grup Anda hanya memiliki akses lihat.',403);
  if(path.startsWith('auth/passkeys')&&!user.workspaceAdmin)return fail('Passkey pada preview tersedia untuk akun reviewer.',403);
  if(path==='workspace'&&method==='GET'){
    if(!user.workspaceAdmin)return fail('Pengaturan ruang kerja hanya untuk administrator.',403);
    return json({
      groups:[administratorGroup,...(state.groups??[])],
      people:[{id:identity.id,name:identity.name,email:identity.email,groupId:administratorGroup.id},...(state.people??[]).map(({id,name,email,groupId})=>({id,name,email,groupId}))],
    });
  }
  if(path==='workspace/groups'&&method==='POST'||/^workspace\/groups\/[\w-]+$/.test(path)&&method==='PUT'){
    if(!user.workspaceAdmin)return fail('Pengaturan grup hanya untuk administrator.',403);
    const input=groupSchema.safeParse(body);
    if(!input.success)return fail('Isi nama dan pilih minimal satu menu.',400);
    const groups=state.groups??[];
    const id=method==='POST'?crypto.randomUUID():path.split('/').at(-1)!;
    if(method==='PUT'&&!groups.some(group=>group.id===id))return fail('Grup tidak ditemukan.',404);
    if([administratorGroup,...groups].some(group=>group.id!==id&&normalizedProjectName(group.name)===normalizedProjectName(input.data.name)))return fail('Nama grup sudah digunakan.',409);
    const group={id,...input.data};
    state.groups=method==='POST'?[...groups,group]:groups.map(old=>old.id===id?group:old);
    await persist(state);return json(group,method==='POST'?201:200);
  }
  if(path==='workspace/users'&&method==='POST'){
    if(!user.workspaceAdmin)return fail('Pengaturan pengguna hanya untuk administrator.',403);
    const input=newPersonSchema.safeParse(body);
    if(!input.success)return fail('Isi nama, email, grup, dan kata sandi minimal 12 karakter.',400);
    const {name,email,password,groupId}=input.data;
    if(!(state.groups??[]).some(group=>group.id===groupId))return fail('Pilih grup yang tersedia.',400);
    if(email===identity.email||state.people?.some(row=>row.email===email))return fail('Email sudah digunakan.',409);
    const id=crypto.randomUUID();
    state.people=[...(state.people??[]),{id,name,email,groupId,preferences:{...base.preferences},digest:await hash(id+':'+password)}];
    await persist(state);return json({id,name,email,groupId},201);
  }
  if(/^workspace\/users\/[\w-]+$/.test(path)&&method==='PATCH'){
    if(!user.workspaceAdmin)return fail('Pengaturan pengguna hanya untuk administrator.',403);
    const candidate=state.people?.find(row=>row.id===path.split('/').at(-1));
    if(!candidate)return fail('Pengguna tidak ditemukan.',404);
    const input=assignGroupSchema.safeParse(body);
    if(!input.success||!(state.groups??[]).some(group=>group.id===input.data.groupId))return fail('Pilih grup yang tersedia.',400);
    candidate.groupId=input.data.groupId;
    await persist(state);return json({ok:true});
  }
  if(path==='projects/catalog'&&method==='GET')return json(catalogFor(state));
  if(path==='projects/import'&&method==='POST'){
    if(!user.workspaceAdmin)return fail('Impor proyek hanya untuk administrator.',403);
    const input=projectImportRows.safeParse(body?.projects);
    if(!input.success)return fail('Data proyek tidak sesuai templat Excel.',400);
    const existing=currentProjects(state);
    const catalog=catalogFor(state);
    const now=new Date().toISOString();
    let last=Math.max(...existing.map(row=>row.number),0);
    const added:Project[]=[];
    for(const {row,draft,plan,actual} of input.data){
      const result=validateProjectDraft(draft,catalog);
      if(!result.fields)return fail('Baris '+row+': '+Object.values(result.errors).join(' '),400);
      if(duplicateProjectName(result.fields.detail.name,existing)||duplicateProjectName(result.fields.detail.name,added))
        return fail('Baris '+row+': kemungkinan duplikat '+result.fields.detail.name+'. Tidak ada proyek yang ditambahkan.',409);
      const number=++last;
      added.push({...result.fields,id:'P'+String(number).padStart(3,'0'),number,latestText:'',priorText:'',
        entrySource:'excel',createdAt:now,updatedAt:now,importedRevenue:{plan,actual}});
    }
    state.importedProjects=[...(state.importedProjects??[]),...added];
    updateDraftProjects(state,added);
    await persist(state);
    return json({count:added.length},201);
  }
  if(path==='auth/passkeys'&&method==='GET'){
    return json((state.passkeys??[]).map(({id,label,createdAt})=>({id,label,createdAt})));
  }
  if(path==='auth/passkeys/register/options'&&method==='POST'){
    if(await hash(String(body?.password))!==state.password)return fail('Kata sandi saat ini tidak cocok.',400);
    if((state.passkeys?.length??0)>=10)return fail('Maksimal 10 passkey per akun.',400);
    const options=await passkeyRegistrationOptions(url.origin,identity,state.passkeys??[]);
    state.passkeyRegistration={challenge:options.challenge,expires:Date.now()+120_000,session:state.expires};
    await persist(state);
    return json(options);
  }
  if(path==='auth/passkeys/register/verify'&&method==='POST'){
    const flow=state.passkeyRegistration;
    delete state.passkeyRegistration;
    await persist(state);
    if(!flow||flow.expires<=Date.now()||flow.session!==state.expires)return fail('Sesi pendaftaran kedaluwarsa. Silakan coba lagi.',400);
    const keys=state.passkeys??[];
    if(keys.length>=10)return fail('Maksimal 10 passkey per akun.',400);
    try{
      const credential=await validatePasskeyRegistration(url.origin,flow.challenge,body,keys.length);
      if(keys.some(key=>key.id===credential.id))return fail('Passkey ini sudah terdaftar.',400);
      state.passkeys=[...keys,credential];
      await persist(state);
      return json({ok:true});
    }catch{return fail('Passkey gagal diverifikasi. Coba daftarkan lagi.',400)}
  }
  if(path.startsWith('auth/passkeys/')&&method==='DELETE'){
    if(await hash(String(body?.password))!==state.password)return fail('Kata sandi saat ini tidak cocok.',400);
    const id=path.slice('auth/passkeys/'.length);
    const keys=state.passkeys??[];
    if(!keys.some(key=>key.id===id))return fail('Passkey tidak ditemukan.',404);
    state.passkeys=keys.filter(key=>key.id!==id);
    await persist(state);
    return json({ok:true});
  }
  if(path==='auth/security')return json({mfa:false,sessions:[{id:'current',current:true,created:state.expires-8*3600_000,seen:Date.now()}]});
  if(path==='auth/password'&&method==='PATCH'){
    if(await hash((person?person.id+':':'')+String(body?.old))!==(person?.digest??state.password))return fail('Kata sandi saat ini tidak cocok.',400);
    if(typeof body?.password!=='string'||body.password.length<12)return fail('Gunakan minimal 12 karakter.',400);
    if(person)person.digest=await hash(person.id+':'+body.password);else state.password=await hash(body.password);await persist(state);return json({ok:true});
  }
  if(path==='auth/mfa/setup')return fail('Pengaturan MFA tersedia pada aplikasi server.',403);
  if(path==='me/preferences'){
    if(method==='PUT'){
      const preferences={theme:body.theme,accent:body.accent,collapsed:Boolean(body.collapsed)};
      if(person)person.preferences=preferences;else state.preferences=preferences;
      await persist(state);
    }
    return json(person?person.preferences??{...base.preferences,accent:'violet'}:state.preferences);
  }
  if(path==='projects'&&method==='GET'){
    const projects=rows(state,url.searchParams);
    if(user.menus.includes('projects'))return json(projects);
    if(!user.menus.some(menu=>['meetings','operations','risk','assignment','bast'].includes(menu)))return json([]);
    return json(projects.map(({id,number,pillar,detail})=>({
      id,number,pillar,detail:{name:detail.name,customer:detail.customer,pm:detail.pm},
    })));
  }
  const projectRoute=/^projects\/(P\d+)$/.exec(path);
  if(path==='projects'&&method==='POST'||projectRoute&&method==='PATCH'){
    if(!user.menus.includes('projects')||user.role==='VIEWER')return fail('Grup Anda tidak dapat mengubah proyek.',403);
    const existing=currentProjects(state);
    const id=projectRoute?.[1];
    const previous=id?projectSource(state).find(row=>row.id===id):undefined;
    if(id&&!previous)return fail('Proyek tidak ditemukan.',404);
    const input=validateProjectDraft(body,catalogFor(state),previous);
    if(!input.fields)return fail(Object.values(input.errors).join(' '),400);
    if(duplicateProjectName(input.fields.detail.name,existing,id))return fail('Nama proyek sudah digunakan.',409);
    const number=previous?.number??(Math.max(...existing.map(row=>row.number),0)+1);
    const now=new Date().toISOString();
    const project:Project={id:id??'P'+String(number).padStart(3,'0'),number,latestText:'',priorText:'',
      ...previous,...input.fields,entrySource:previous?previous.entrySource:'manual',createdAt:previous?previous.createdAt:now,updatedAt:now};
    state.importedProjects=[...(state.importedProjects??[]).filter(row=>row.id!==project.id),project];
    if(project.verification)state.verifiedProjects=(state.verifiedProjects??[]).filter(value=>value!==project.id);
    updateDraftProjects(state,[project]);
    await persist(state);return json(projectRow(project),previous?200:201);
  }
  const verify=/^projects\/([^/]+)\/verify$/.exec(path);
  if(verify&&method==='POST'){
    const id=decodeURIComponent(verify[1]);
    if(!currentProjects(state).some(project=>project.id===id))return fail('Proyek tidak ditemukan.',404);
    state.verifiedProjects=[...new Set([...(state.verifiedProjects??[]),id])];
    for(const meeting of state.meetings){
      if(meeting.status!=='draft')continue;
      const project=meeting.projects.find(p=>p.id===id&&p.verification);
      if(project){project.verification=false;meeting.version++}
    }
    await persist(state);
    return json({ok:true});
  }
  if(path==='projects/export.xlsx'){
    const workbook=new ExcelJS.Workbook();
    const sheet=workbook.addWorksheet('Daftar Proyek',{views:[{state:'frozen',ySplit:1}]});
    sheet.addRow(['No','ID','Nama proyek','Pelanggan','PM','Periode','Pilar','Prognosa (Rp)','Realisasi (Rp)','Status',
      'Sales','Tanggal mulai','Tanggal akhir','Nilai kontrak (Rp)','Penagihan','Jumlah sumber daya','Catatan SPK/PKS','Asal data']);
    sheet.getRow(1).font={bold:true};
    sheet.columns.forEach((column,i)=>{column.width=i===2?52:22; if([7,8,13].includes(i))column.numFmt='"Rp" #,##0.##'});
    for(const p of rows(state,url.searchParams).sort((a,b)=>pillars.indexOf(a.pillar)-pillars.indexOf(b.pillar))){
      const dates=p.contractDates??parseContractDates(p.detail.period);
      sheet.addRow([p.number,p.id,p.detail.name,p.detail.customer,p.detail.pm,p.detail.period,p.pillar,p.planAvailable?p.plan:null,
        p.actualAvailable?p.actual:null,p.status,p.detail.sales,dates?.[0],dates?.[1],contractAmount(p.detail.value)??(p.detail.value||null),
        p.detail.billing,p.detail.resourceCount,p.detail.notes,p.entrySource==='manual'?'Manual':p.entrySource==='excel'?'Excel':null]);
    }
    return new Response(await workbook.xlsx.writeBuffer(),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Proyek-Shockwave.xlsx"'}});
  }
  if(path==='meetings'){
    if(method==='GET')return json([...state.meetings].sort((a,b)=>b.date.localeCompare(a.date)));
    if(method==='POST'){
      const result=meetingCreateSchema.safeParse(body);
      if(!result.success)return fail('Lengkapi tanggal dan judul rapat.',400);
      const input=result.data;
      if(state.meetings.some(row=>row.date===input.date))return fail('Sudah ada rapat pada tanggal ini.',409);
      const previous=state.meetings.filter(row=>row.date<input.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
      const meeting=newMeeting(projectSource(state),{...input,id:'M-'+crypto.randomUUID()},previous);
      state.meetings.push(meeting);
      await persist(state);
      return json(meeting,201);
    }
  }
  let route=/^meetings\/([^/]+)(?:\/(validate|finalize|projects\/([^/]+)))?$/.exec(path);
  if(route){
    const [,meetingId,action,projectId]=route;
    const meeting=state.meetings.find(row=>row.id===meetingId);
    if(!meeting)return fail('Rapat tidak ditemukan.',404);
    if(action==='validate'&&method==='GET')return json({...meetingReadiness(meeting),problems:meetingChecks(meeting)});
    if(meeting.status==='final')return fail('Rapat sudah final dan terkunci.',409);
    if(meeting.version!==body?.version)return fail('Rapat telah diubah pengguna lain.',409);
    if(!action&&method==='DELETE'){
      if(state.meetings.length<=1||state.meetings.some(row=>row.previousId===meeting.id))return fail('Rapat masih dibutuhkan sebagai referensi.',409);
      state.meetings=state.meetings.filter(row=>row.id!==meeting.id);
      await persist(state);
      return json({ok:true});
    }
    if(!action&&method==='PATCH'){
      const result=meetingUpdateSchema.safeParse(body);
      if(!result.success)return fail('Lengkapi informasi rapat.',400);
      try{validateMeetingDate(state.meetings,meeting,result.data.date)}catch(error){return fail((error as Error).message,409)}
      Object.assign(meeting,{...result.data,date:result.data.date??meeting.date});
    }else if(projectId&&method==='PATCH'){
      const project=meeting.projects.find(row=>row.id===projectId);
      if(!project)return fail('Proyek tidak ditemukan dalam rapat.',404);
      const result=reviewSchema.safeParse(body.review);
      if(!result.success||!['updated','none'].includes(result.data.status))return fail('Isian tinjauan tidak valid.',400);
      project.review=result.data.status==='none'?unchangedReview(project,project.review):{...result.data,sourceText:undefined};
    }else if(action==='finalize'&&method==='POST'){
      if(meetingChecks(meeting).length)return fail('Lengkapi tinjauan sebelum finalisasi.',409);
      meeting.status='final';
    }else return fail('Tindakan tidak tersedia.',405);
    meeting.version++;
    await persist(state);
    return json(meeting);
  }
  const logbookRoute=/^documents\/logbook\/([\w-]+)$/.exec(path);
  if(logbookRoute){
    const id=logbookRoute[1];
    const scope=logbookScope(id);
    if(!scope||!currentProjects(state).some(project=>project.id===scope.projectId))return fail('Proyek atau minggu tidak ditemukan.',404);
    const books=state.documents.logbook??[];
    const old=books.find(doc=>doc.id===id);
    if(method==='GET')return json(old??{id,version:0,updated:'',data:{...scope,entries:[]}});
    if(method!=='PUT')return fail('Tindakan tidak tersedia.',405);
    if((old?.version??0)!==body?.version)return fail('Dokumen telah diubah. Muat ulang versi terbaru.',409);
    const data=logbookSchema.safeParse(body?.data);
    if(!data.success||data.data.projectId!==scope.projectId||data.data.week!==scope.week)return fail('Periksa isian Log Book. Total lampiran maksimal 16 MB per minggu.',400);
    const doc={id,data:data.data,version:body.version+1,updated:new Date().toISOString()};
    state.documents.logbook=[doc,...books.filter(book=>book.id!==id)];
    await persist(state);
    return json(doc);
  }
  route=/^documents\/(operations|assignment|risk|mom)(?:\/([\w-]+))?$/.exec(path);
  if(route){
    const [,kind,id]=route;
    const entries=state.documents[kind]||[];
    if(method==='GET'){
      if(kind==='operations'&&id){
        if(!currentProjects(state).some(project=>project.id===id))return fail('Proyek tidak ditemukan.',404);
        return json(entries.find(doc=>doc.id===id)??null);
      }
      return json(entries);
    }
    if(!id)return fail('Dokumen tidak ditemukan.',404);
    const old=entries.find(doc=>doc.id===id);
    if(method==='DELETE'){
      if(!old)return fail('Dokumen tidak ditemukan.',404);
      if(kind==='assignment'&&(old.data.fields as Record<string,string>)?.issued==='true')return fail('Surat yang telah diterbitkan disimpan sebagai arsip.',409);
      state.documents[kind]=entries.filter(doc=>doc.id!==id);await persist(state);return json({ok:true});
    }
    if(method==='PUT'){
      if((old?.version??0)!==body?.version)return fail('Dokumen telah diubah. Muat ulang versi terbaru.',409);
      if(kind==='risk'&&body?.data?.projectId&&!currentProjects(state).some(p=>p.id===body.data.projectId))return fail('Pilih proyek untuk menyimpan risiko.',400);
      if(!body?.data||typeof body.data!=='object')return fail('Dokumen tidak valid.',400);
      if(kind==='assignment'){
        if(!body.data.fields||typeof body.data.fields!=='object'||Object.values(body.data.fields).some(value=>typeof value!=='string'))return fail('Isian surat tidak valid.',400);
        try{
          prepareAssignment(body.data.fields,body.publish===true,old?.data.fields as Record<string,string>|undefined,year=>{
            const counters=state.assignmentCounters??{};
            const count=(counters[year]??0)+1;state.assignmentCounters={...counters,[year]:count};return count;
          });
        }catch(error){return fail((error as Error).message,400)}
      }
      const doc={id,data:body.data,version:body.version+1,updated:new Date().toISOString()};
      state.documents[kind]=[doc,...entries.filter(x=>x.id!==id)];await persist(state);return json(doc);
    }
  }
  if(path==='assistant/status')return json({gateway:false,proposalPrompts:[]});
  if(path==='assistant/chat'&&method==='POST'){
    const result=assistantQuestionSchema.safeParse(body);
    if(!result.success)return fail('Pertanyaan atau lampiran tidak valid.',400);
    const {message,attachments}=result.data;
    const projectAccess=user.menus.includes('projects');
    const meetingAccess=user.menus.includes('meetings');
    const operationAccess=user.menus.includes('operations');
    if(attachments.length)return json(referenceAnswer(message,attachments,[],[])??{text:'Tanyakan isi lampiran atau ketik “ringkas lampiran”.'});
    const mom=sampleMomReply(message);
    if(mom)return user.menus.includes('mom')?json(mom):fail('Grup Anda tidak memiliki akses ke Notulen.',403);
    const query=/^cari proyek:\s*(.+)/i.exec(message);
    if(query){if(!projectAccess)return fail('Grup Anda tidak memiliki akses ke Proyek.',403);const found=rows(state,new URLSearchParams({q:query[1]}));return json({text:found.length?'Hasil pencarian proyek.':'Tidak ada proyek yang cocok.',projects:found.map(p=>p.id)})}
    if(/^ekspor proyek$/i.test(message))return projectAccess?json({text:'Unduh daftar proyek dalam format Excel.',export:true}):fail('Grup Anda tidak memiliki akses ke Proyek.',403);
    const report=assistantReportReply(message,rows(state,new URLSearchParams()));
    if(report){
      if(report.revenueExport&&!projectAccess|| (report.weeklyExport||report.reportChoices)&&!operationAccess)return fail('Grup Anda tidak memiliki akses ke sumber laporan ini.',403);
      return json(report);
    }
    return json(referenceAnswer(message,[],projectAccess?projectSource(state):[],meetingAccess?state.meetings:[])??{text:'Buka Contoh prompt untuk melihat tindakan yang tersedia di preview ini.'});
  }
  return fail('Aksi ini tersedia pada aplikasi server atau memerlukan peran pengelola.',403);
}
const scope=self as any;
scope.addEventListener('install', (event:any)=>event.waitUntil(scope.skipWaiting()));
scope.addEventListener('activate',(event:any)=>event.waitUntil(scope.clients.claim()));
let queue:Promise<unknown>=Promise.resolve();
scope.addEventListener('fetch',(event:any)=>{
  const request=event.request as Request;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith('/api/v1/'))return;
  const response=queue.then(()=>handle(request,url)).catch(()=>fail('Preview gagal memproses permintaan. Muat ulang halaman.',500));
  queue=response.then(()=>undefined);
  event.respondWith(response);
});
