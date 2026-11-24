import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {DATASET,ACTORS,PROJECTS,localToday,day,rp,operations,risks,assignments,mom,textPdf,documentLines} from './demo-data.mjs';

if(process.stdin.isTTY)process.stdin.setRawMode(true);
const input=readline.createInterface({input:process.stdin,terminal:false});
const settings=JSON.parse(await new Promise((ok,fail)=>{input.once('line',ok);input.once('close',()=>fail(Error('Credentials must be supplied through stdin.')));}));
input.close();process.stdin.pause();
const origins=settings.origins||['http://localhost:3000','http://localhost:8080'];
for(const origin of origins)if(!['http://localhost:3000','http://localhost:8080'].includes(origin))throw Error('Only the two local PMO runtimes are supported.');
if(process.platform!=='win32')throw Error('This local fixture installer uses Windows DPAPI.');
const root=process.env.PMO_DEMO_DIR||join(process.env.LOCALAPPDATA,'ShockwavePMO','demo-data',DATASET);
await mkdir(root,{recursive:true});
async function run(command,args,stdin,cwd){const child=spawn(command,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.stdin.end(stdin||'');await new Promise((ok,fail)=>{child.on('error',fail);child.on('close',code=>code===0?ok():fail(Error((err||out).slice(-1800))));});return out.trim();}
async function protectedText(value,decrypt=false){return run('pwsh.exe',['-NoProfile','-NonInteractive','-Command',decrypt?"$v=[Console]::In.ReadToEnd();$s=ConvertTo-SecureString $v;[Net.NetworkCredential]::new('',$s).Password":"$v=[Console]::In.ReadToEnd();ConvertTo-SecureString $v -AsPlainText -Force | ConvertFrom-SecureString"],value);}
async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function saveJson(path,data){await writeFile(path+'.tmp',JSON.stringify(data,null,2),{mode:0o600});await rename(path+'.tmp',path);}
const metaPath=join(root,'dataset.json'),meta=await readJson(metaPath,{dataset:DATASET,today:localToday(),created_at:new Date().toISOString()});
await saveJson(metaPath,meta);const today=meta.today;
const secretPath=join(root,'accounts.dpapi');let secrets;
try{secrets=JSON.parse(await protectedText((await readFile(secretPath,'utf8')).trim(),true));}catch(e){if(e.code!=='ENOENT')throw e;secrets={};}
async function saveSecrets(){await writeFile(secretPath,await protectedText(JSON.stringify(secrets)),{mode:0o600});}
const password=()=>randomBytes(15).toString('base64url')+'!Aa1';

class Api{
 constructor(base,cookie,user){this.base=base;this.cookie=cookie;this.user=user;}
 async call(path,method='GET',body){const response=await fetch(this.base+'/api'+path,{method,headers:{Origin:this.base,Cookie:this.cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const value=await response.json().catch(()=>({message:'Invalid API response'}));if(!response.ok)throw Object.assign(Error(`${method} ${path}: ${response.status} ${value.message||'Request failed'}`),{status:response.status});return value;}
 async upload(projectId,name,bytes,mime='application/pdf',previous){const response=await fetch(`${this.base}/api/projects/${projectId}/documents${previous?'?root_id='+previous:''}`,{method:'POST',headers:{Origin:this.base,Cookie:this.cookie,'Content-Type':mime,'X-File-Name':encodeURIComponent(name)},body:bytes,signal:AbortSignal.timeout(30000)});const value=await response.json();if(!response.ok)throw Error(`Upload ${name}: ${response.status} ${value.message}`);return value;}
 async logout(){await this.call('/auth/logout','POST').catch(()=>{});}
}
async function login(base,email,pw){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:pw}),signal:AbortSignal.timeout(10000)});const value=await response.json();if(!response.ok)throw Object.assign(Error(`Login ${base}: ${response.status} ${value.message||'failed'}`),{status:response.status});return new Api(base,response.headers.get('set-cookie').split(';')[0],value.user);}

const owners=[];
try{
 for(const base of origins){const owner=await login(base,settings.email,settings.password);if(owner.user.role!=='admin'||owner.user.must_change_password)throw Error('The supplied account must be an administrator with its password already set.');owners.push(owner);console.log(`Authentication ready: ${base}`);}
 settings.password='';
 const fixtures=join(root,'fixtures');await mkdir(fixtures,{recursive:true});
 await saveJson(join(fixtures,'settings.json'),{today});
 const generator=fileURLToPath(new URL('./create-demo-fixtures.py',import.meta.url));
 await run('docker',['run','--rm','--user','0:0','--mount',`type=bind,source=${generator},target=/app/create-demo-fixtures.py,readonly`,'--mount',`type=bind,source=${fixtures},target=/fixtures`,'--entrypoint','python','shockwave-ocr:local','/app/create-demo-fixtures.py']);
 const photo='data:image/png;base64,'+(await readFile(join(fixtures,'demo-meeting.png'))).toString('base64');
 const signature='data:image/png;base64,'+(await readFile(join(fixtures,'demo-signature.png'))).toString('base64');
 for(const owner of owners){await seed(owner,fixtures,photo,signature);}
 console.log(`Demo data is ready. Guide and manifests: ${root}`);
}finally{await Promise.all(owners.map(owner=>owner.logout()));}

async function seed(owner,fixtures,photo,signature){
 const base=owner.base,port=new URL(base).port,folder=join(root,port);await mkdir(folder,{recursive:true});
 const stateFile=join(folder,'state.json'),state=await readJson(stateFile,{dataset:DATASET,origin:base,owner_id:owner.user.id,today,resources:{}});
 if(state.owner_id!==owner.user.id||state.dataset!==DATASET)throw Error('Existing dataset belongs to a different fixture owner.');
 const persist=()=>saveJson(stateFile,state);
 if(state.complete){
  const visible=(await owner.call('/projects')).projects;
  const archived=(await owner.call('/admin/archives')).projects;
  const present=new Set([...visible,...archived].map(p=>p.id));
  if(PROJECTS.every(p=>present.has(state.resources['project:'+p.key]?.id))){console.log(`[${port}] Dataset already ready; existing demo changes were preserved.`);return;}
  throw Error('Completed dataset has missing projects. Inspect the manifest before making a new dataset.');
 }
 const once=async(key,create)=>{if(Object.hasOwn(state.resources,key))return state.resources[key];const value=await create();state.resources[key]=value??true;await persist();return state.resources[key];};
 const ids=(key,create)=>once('ids:'+key,create);
 const clients={};
 try{
  const users=(await owner.call('/admin/users')).users;
  for(const[key,def]of Object.entries(ACTORS)){
   if(!secrets[key]){if(users.some(u=>u.email===def.email))throw Error(`Demo account ${def.email} already exists without this fixture manifest; no password was changed.`);secrets[key]={...def,password:password(),temporary_password:password(),initialized:{}};await saveSecrets();}
   const secret=secrets[key];
   const user=await once('user:'+key,async()=>{const existing=users.find(u=>u.email===def.email);if(existing){if(existing.name!==def.name)throw Error('Demo email collision.');return existing;}return owner.call('/admin/users','POST',{email:def.email,name:def.name,role:def.role,active:true,password:secret.temporary_password});});
   if(def.capacity)await once('capacity:'+key,()=>owner.call(`/admin/users/${user.id}/capacity`,'PATCH',{capacity:def.capacity}));
   if(def.firstLogin)continue;
   if(!secret.initialized[base]){
    let temporary;
    try{temporary=await login(base,def.email,secret.temporary_password);}catch(e){if(e.status!==401)throw e;temporary=await login(base,def.email,secret.password);}
    if(temporary.user.must_change_password)await temporary.call('/auth/password','POST',{current_password:secret.temporary_password,password:secret.password});else await temporary.logout();
    secret.initialized[base]=true;await saveSecrets();
   }
   clients[key]=await login(base,def.email,secret.password);
  }
  console.log(`[${port}] Demo roles ready.`);
  const existing=(await owner.call('/projects')).projects;
  const projects={};
  for(const def of PROJECTS){
   const p=await once('project:'+def.key,async()=>{if(existing.some(p=>p.code===def.code))throw Error(`Project ${def.code} already exists outside this manifest; no data was overwritten.`);return clients[def.manager].call('/projects','POST',{code:def.code,name:def.name,customer:def.customer,description:`[DUMMY ${DATASET}] ${def.scenario} Bukan proyek atau transaksi nyata.`,status:def.status,start_date:day(today,def.start),end_date:day(today,def.end)});});
   projects[def.key]={...def,id:p.id,client:clients[def.manager]};
   await once('metadata:'+def.key,()=>pClient(def).call(`/projects/${p.id}/metadata`,'PATCH',{pillar:def.pillar,sub_pillar:def.sub,revenue_forecast:def.contract,revenue_actual:0}));
   for(const role of ['pm1','pm2','pm3','viewer'])if(role!==def.manager)await once(`member:${def.key}:${role}`,()=>owner.call(`/projects/${p.id}/members`,'POST',{user_id:state.resources['user:'+role].id}));
   const ops=await once('ops:'+def.key,async()=>{const existing=await pClient(def).call(`/projects/${p.id}/modules/operations`);if(existing.version)return existing.data;const value=operations(def,today);return(await pClient(def).call(`/projects/${p.id}/modules/operations`,'PUT',{version:0,data:value})).data;});
   projects[def.key].ops=ops;
   for(const[kind,value]of[['risks',risks(def,today)],['assignments',assignments(def,today)],['mom',mom(def,today,photo,signature)]])await once(`module:${def.key}:${kind}`,async()=>{const current=await pClient(def).call(`/projects/${p.id}/modules/${kind}`);if(current.version)return{version:current.version};return pClient(def).call(`/projects/${p.id}/modules/${kind}`,'PUT',{version:0,data:value});});
   if(def.key!=='app')await once('contract:'+def.key,()=>pClient(def).call(`/projects/${p.id}/contract`,'PUT',{contract_number:`PKS/DEMO/${def.code}/${today.slice(0,4)}`,contract_value:def.contract}));
  }
  function pClient(def){return clients[def.manager];}
  console.log(`[${port}] Eight projects, WBS, reports, risks, MOM and assignments ready.`);

  async function doc(project,key,kind,{extra=[],verify=true,apply,bytes,mime='application/pdf',previous,name,expectFailure=false}={}){
   if(state.resources['doc-checked:'+key])return state.resources['doc-checked:'+key];
   const file=name||`DEMO-${project.code}-${key}.${mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'pdf'}`;
   const uploaded=await once('doc:'+key,()=>project.client.upload(project.id,file,bytes||textPdf(documentLines(project,today,kind,extra)),mime,previous));
   let d=await owner.call(`/documents/${uploaded.id}`);
   for(let tick=0;['queued','processing'].includes(d.status)&&tick<180;tick++){await new Promise(r=>setTimeout(r,2000));d=await owner.call(`/documents/${uploaded.id}`);}
   if(expectFailure){if(d.status!=='failed')throw Error(`Intentional invalid fixture ${file} did not reach failed state.`);return d;}
   if(d.status==='failed')throw Error(`OCR failed on synthetic document ${file}. Check the worker logs.`);
   if(!['needs_review','verified'].includes(d.status))throw Error(`OCR timeout for ${file}; resume the seed after the worker becomes ready.`);
   if(verify&&d.status!=='verified'){
    const fields=Object.fromEntries(Object.entries(d.extracted_data?.fields||{}).map(([k,v])=>[k,v.value]));
    if(!fields.document_number&&!fields.contract_number&&!fields.invoice_number)throw Error(`No document reference extracted from ${file}.`);
    await project.client.call(`/documents/${d.id}/verify`,'PUT',{revision:d.revision,category:kind,fields,notes:'[DEMO] Fixture sintetis dibandingkan dengan teks original oleh installer data uji; bukan pengesahan dokumen bisnis.',apply:apply||{}});
    d=await owner.call(`/documents/${d.id}`);
   }
   await once('doc-checked:'+key,()=>({id:d.id,status:d.status,category:d.category,version:d.version_number}));
   console.log(`[${port}] ${file}: ${d.status}`);return d;
  }
  async function bill(project,key,input){return once('bill:'+key,()=>project.client.call(`/projects/${project.id}/milestones`,'POST',input));}
  function billBody(row,patch={}){return{name:row.name,percentage:Number(row.percentage),amount:Number(row.amount),due_date:row.due_date?.slice(0,10)||null,wbs_task_id:row.wbs_task_id||null,requires_bast:row.requires_bast,notes:row.notes||'',sort_order:row.sort_order||0,bast_document_id:row.bast_document_id||null,invoice_number:row.invoice_number||'',invoice_date:row.invoice_date?.slice(0,10)||null,invoice_document_id:row.invoice_document_id||null,paid_amount:Number(row.paid_amount),paid_date:row.paid_date?.slice(0,10)||null,...patch};}
  async function editBill(project,key,id,patch){return once('bill-edit:'+key,async()=>{const row=(await owner.call(`/projects/${project.id}/finance`)).milestones.find(m=>m.id===id);return project.client.call(`/milestones/${id}`,'PUT',billBody(row,patch));});}
  async function decide(id,actor,decision='approved',note='[DEMO] Sesuai fixture dan skenario pengujian.'){
   const current=await actor.call(`/approvals/${id}`);if(current.status!=='pending')return current;
   return actor.call(`/approvals/${id}/decision`,'POST',{decision,note});
  }
  async function approval(key,project,body,{requester=project.client,finish=false,reject=false,advance=false}={}){
   const a=await once('approval:'+key,()=>requester.call('/approvals','POST',{project_id:project.id,...body}));
   if(advance||finish||reject){await once('approval-decision:'+key,async()=>{let current=await owner.call(`/approvals/${a.id}`);if(current.status!=='pending')return current;if(current.current_step===1){const manager=clients[project.manager];await decide(a.id,manager);current=await owner.call(`/approvals/${a.id}`);}if(finish||reject)return decide(a.id,owner,reject?'rejected':'approved',reject?'[DEMO] Revisi rincian biaya dan bukti pendukung sebelum pengajuan ulang.':'[DEMO] Disetujui untuk simulasi.');return current;});}
   return a;
  }

  const app=projects.app;
  const contract=await doc(app,'app-pks','pks',{extra:['Termin 1: 20% (Rp 240.000.000) setelah BAST analisis','Termin 2: 50% (Rp 600.000.000) setelah BAST implementasi','Termin 3: 30% (Rp 360.000.000) setelah BAST akhir'],apply:{contract:true,milestones:true}});
  await doc(app,'app-spk','spk');
  const terms=(await owner.call(`/projects/${app.id}/finance`)).milestones.sort((a,b)=>a.sort_order-b.sort_order);
  if(terms.length!==3)throw Error('Verified PKS did not create exactly three payment terms.');
  for(let i=0;i<3;i++)await editBill(app,'app-date-'+i,terms[i].id,{due_date:day(today,i===0?-7:i===1?21:56),wbs_task_id:i===0?app.ops.phases[0].tasks[1].id:null});
  for(let i=0;i<2;i++){
   const b=await doc(app,'app-bast-'+i,'bast',{extra:[`Keterangan: BAST termin ${i+1} - simulasi`],apply:{milestone_id:terms[i].id}});
   await doc(app,'app-invoice-'+i,'invoice',{extra:[`Total Tagihan: ${rp(Number(terms[i].amount))}`],apply:{milestone_id:terms[i].id}});
   await editBill(app,'app-paid-'+i,terms[i].id,{paid_amount:i===0?Number(terms[i].amount):100000000,paid_date:day(today,-2)});
   await approval('app-bast-'+i,app,{kind:'document',document_id:b.id},{finish:i===0});
  }
  await doc(app,'app-pks-version-2','pks',{verify:false,previous:contract.id,extra:['Addendum versi 2 - masih menunggu verifikasi.']});
  const baselineApp=await approval('app-baseline',app,{kind:'baseline'},{requester:clients.pm2,finish:true});
  await approval('app-report',app,{kind:'weekly_report',week:Number(Object.keys(app.ops.reports).at(-1))},{requester:clients.pm2,finish:true});

  const late=projects.late;
  await bill(late,'late-1',{name:'[DEMO] Termin instalasi - BAST terlambat',percentage:50,amount:425000000,due_date:day(today,-14),wbs_task_id:late.ops.phases[1].tasks[0].id,requires_bast:true,sort_order:1});
  await bill(late,'late-2',{name:'[DEMO] Termin serah terima',percentage:50,amount:425000000,due_date:day(today,-3),requires_bast:true,sort_order:2});
  await doc(late,'late-spk-review','spk',{verify:false});
  await doc(late,'late-report','report');
  await doc(late,'intentionally-broken-pdf','bast',{verify:false,bytes:Buffer.from('%PDF-1.4\nDATA DUMMY - INTENTIONALLY BROKEN PDF\n'),name:'DEMO-CONTOH-PDF-RUSAK.pdf',expectFailure:true});
  await approval('late-report-rejected',late,{kind:'weekly_report',week:Number(Object.keys(late.ops.reports).at(-1))},{reject:true});

  const network=projects.network;
  await bill(network,'network-1',{name:'[DEMO] Termin implementasi jaringan',percentage:50,amount:300000000,due_date:day(today,7),wbs_task_id:network.ops.phases[1].tasks[0].id,requires_bast:true,sort_order:1});
  const netBast=await doc(network,'network-bast','bast');
  await approval('network-document-pending',network,{kind:'document',document_id:netBast.id});
  await doc(network,'network-pks-review','pks',{verify:false,extra:['Termin 1: 50% setelah BAST tahap 1','Termin 2: 50% setelah BAST akhir']});

  const security=projects.security;
  await doc(security,'security-mom','mom');
  for(const[file,mime]of[['demo-bast-scan.png','image/png'],['demo-bast-scan.pdf','application/pdf'],['demo-bast-scan.jpg','image/jpeg']])await doc(security,'security-'+file,'bast',{verify:false,bytes:await readFile(join(fixtures,file)),mime,name:'DEMO-'+file});

  const review=projects.review;
  await bill(review,'review-final',{name:'[DEMO] Termin final portal',percentage:100,amount:review.contract,due_date:day(today,49),wbs_task_id:review.ops.phases[2].tasks[1].id,requires_bast:true,sort_order:1});
  const reviewBast=await doc(review,'review-bast','bast');
  await approval('review-document',review,{kind:'document',document_id:reviewBast.id});
  await approval('review-baseline-step1',review,{kind:'baseline'},{requester:clients.pm2});
  await approval('review-report-step2',review,{kind:'weekly_report',week:Number(Object.keys(review.ops.reports).at(-1))},{requester:clients.pm2,advance:true});

  for(const key of ['closed','closing']){
   const p=projects[key],term=await bill(p,key+'-final',{name:'[DEMO] Termin pelunasan',percentage:100,amount:p.contract,due_date:day(today,-7),requires_bast:true,sort_order:1});
   const b=await doc(p,key+'-bast','bast',{apply:{milestone_id:term.id}});
   await doc(p,key+'-invoice','invoice',{extra:[`Total Tagihan: ${rp(p.contract)}`],apply:{milestone_id:term.id}});
   await editBill(p,key+'-paid',term.id,{paid_amount:p.contract,paid_date:day(today,-1)});
   await doc(p,key+'-final-report','report',{extra:['Dokumentasi akhir, as-built dan manual operasional - simulasi.']});
   await approval(key+'-bast',p,{kind:'document',document_id:b.id},{finish:true});
  }

  // Change requests: applied, rejected, draft, and pending.
  async function cr(key,p,body,{finish=false,reject=false,draft=false}={}){
   const record=await once('cr:'+key,()=>p.client.call(`/projects/${p.id}/change-requests`,'POST',body));
   if(draft)return record;
   const request=await once('cr-submit:'+key,()=>p.client.call(`/change-requests/${record.id}/submit`,'POST'));
   if(finish||reject)await once('cr-decide:'+key,()=>decide(request.id,owner,reject?'rejected':'approved',reject?'[DEMO] Anggaran belum dilengkapi rincian pendukung.':'[DEMO] Perubahan simulasi disetujui.'));
   return record;
  }
  await once('network-current-schedule',async()=>{const current=await network.client.call(`/projects/${network.id}/modules/operations`);const value=structuredClone(current.data);value.phases[2].tasks[0].duration=2;value.phases[2].tasks[1].start=7;return network.client.call(`/projects/${network.id}/modules/operations`,'PUT',{version:current.version,data:value});});
  await cr('network-approved',network,{title:'[DEMO] Tambahan waktu uji failover',type:'timeline',reason:'Pelanggan fiktif meminta tambahan skenario failover.',impact:'Jadwal bertambah 14 hari; baseline baru disimpan.',changes:{new_end_date:day(today,42),rebaseline:true}},{finish:true});
  await cr('late-rejected',late,{title:'[DEMO] Pengajuan tambahan biaya',type:'cost',reason:'Perlu tambahan dukungan selama akses server tertunda.',changes:{new_contract_value:950000000}},{reject:true});
  await cr('security-draft',security,{title:'[DEMO] Perubahan ruang lingkup hardening',type:'scope',reason:'Masih menyusun daftar kebutuhan tambahan pelanggan fiktif.',description:'Draft untuk latihan pengajuan change request.'},{draft:true});
  await cr('review-pending',review,{title:'[DEMO] Perubahan target portal',type:'timeline',reason:'Menunggu persetujuan tambahan waktu pengujian pengguna.',changes:{new_end_date:day(today,77)}});

  // Final corporate meeting with tracker actions, then a draft carrying open actions forward.
  const actions=await ids('meeting-actions',()=>({done:randomUUID(),open:randomUUID(),future:randomUUID()}));
  const selected=[app,late,network,review];
  const meeting=await once('meeting:final',()=>clients.pm1.call('/meetings','POST',{title:'[DEMO] Corporate Meeting - Review Portofolio',date:day(today,-7),moderator:'PMO Demo',notulis:ACTORS.pm2.name,participants:Object.values(ACTORS).filter(a=>a.role==='pm').map(a=>a.name).join('; '),notes:'[DEMO] Rapat sintetis untuk menguji review, finalisasi dan tindak lanjut.',project_ids:selected.map(p=>p.id),previous_id:null}));
  for(const p of selected)await once('meeting-review:'+p.key,async()=>{const current=await clients.pm1.call(`/meetings/${meeting.id}`);const list=p.key==='app'?[{id:actions.done,text:'[DEMO] Kirim daftar deliverable hasil analisis',pic:ACTORS.pm1.name,due:day(today,-5),status:'not_started',side:'internal'}]:p.key==='late'?[{id:actions.open,text:'[DEMO] Konfirmasi akses server UAT pelanggan',pic:ACTORS.pm2.name,due:day(today,-3),status:'in_progress',side:'external'}]:p.key==='network'?[{id:actions.future,text:'[DEMO] Jadwalkan pengujian failover jaringan',pic:ACTORS.pm3.name,due:day(today,7),status:'not_started',side:'internal'}]:[];return clients.pm1.call(`/meetings/${meeting.id}/reviews/${p.id}`,'PUT',{version:current.version,review:{review:'updated',health:p.key==='late'?'critical':p.key==='network'?'attention':'on_track',summary:`[DEMO] ${p.scenario}`,items:[{type:p.key==='late'?'issue':'progress',text:`[DEMO] ${p.scenario}`}],actions:list}});});
  await once('meeting-finalized',async()=>{const current=await clients.pm1.call(`/meetings/${meeting.id}`);if(current.status==='final')return true;return clients.pm1.call(`/meetings/${meeting.id}/finalize`,'POST',{version:current.version});});
  await once('meeting-done-action',()=>clients.pm1.call(`/action-items/${actions.done}`,'PATCH',{status:'done',evidence:'[DEMO] Daftar deliverable telah dikirim pada simulasi dan dibandingkan dengan checklist.'}));
  const next=await once('meeting:draft',()=>clients.pm1.call('/meetings','POST',{title:'[DEMO] Corporate Meeting - Tindak Lanjut',date:today,moderator:'PMO Demo',notulis:ACTORS.pm2.name,participants:'PMO dan PM Demo',notes:'[DEMO] Tindakan terbuka dibawa dari rapat final sebelumnya.',project_ids:selected.map(p=>p.id),previous_id:meeting.id}));
  const nextDetail=await owner.call(`/meetings/${next.id}`);
  if(JSON.stringify(nextDetail).includes(actions.done))throw Error('Completed tracker action was carried forward.');
  if(!JSON.stringify(nextDetail).includes(actions.open))throw Error('Open tracker action was not carried forward.');
  const manual=await once('action:manual',()=>clients.pm2.call('/action-items','POST',{project_id:late.id,text:'[DEMO] Susun ulang jadwal setelah akses server tersedia',pic:ACTORS.pm1.name,due:day(today,5)}));

  // Closure with one approved case and one ready for the real PMO account to approve.
  for(const key of ['closed','closing']){
   const p=projects[key];
   await once('closure-saved:'+key,async()=>{const {closure}=await p.client.call(`/projects/${p.id}/closure`);if(closure.version)return closure;const lessons=[{id:randomUUID(),category:'stakeholder',title:'[DEMO] Minta akses server sejak kickoff',insight:'Pada simulasi, akses terlambat menghambat jadwal pengujian.',recommendation:'Masukkan akses dan PIC pelanggan ke checklist kickoff.',tags:'demo,akses,stakeholder'},{id:randomUUID(),category:'technical',title:'[DEMO] Latihan cutover sebelum go-live',insight:'Simulasi cutover membantu tim menemukan urutan pekerjaan yang belum lengkap.',recommendation:'Gunakan runbook dan rollback plan yang direview bersama.',tags:'demo,cutover,runbook'}];return p.client.call(`/projects/${p.id}/closure`,'PUT',{version:0,checklist:closure.checklist.map(i=>({...i,done:true,note:'[DEMO] Diselesaikan dalam fixture sintetis.'})),handover:{recipient:'Tim Operasional Pelanggan Fiktif',date:day(today,-1),notes:'[DEMO] Manual, akun dan dokumentasi diserahterimakan dalam simulasi.'},lessons,summary:`[DEMO] Seluruh pekerjaan ${p.code} selesai, dokumen diverifikasi dan pembayaran lunas.`});});
   const request=await once('closure-request:'+key,()=>p.client.call(`/projects/${p.id}/closure/submit`,'POST'));
   if(key==='closed')await once('closure-approved:'+key,()=>decide(request.id,owner));
  }
  await doc(projects.archive,'archive-report','report');
  await once('project-archived',()=>projects.archive.client.call(`/projects/${projects.archive.id}`,'DELETE'));

  // Historical fixture timestamps are limited to manifest-owned projects.
  await once('historical-dates',async()=>{
   const code=`import 'dotenv/config';import pg from 'pg';let text='';for await(const c of process.stdin)text+=c;const v=JSON.parse(text),p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const rows=(await p.query('SELECT id,code,description FROM projects WHERE id=ANY($1::uuid[])',[v.ids])).rows;if(rows.length!==v.ids.length||rows.some(r=>!r.code.startsWith('DEMO-')||!r.description.includes(v.dataset)))throw Error('Fixture ownership check failed');await p.query("UPDATE project_modules SET updated_at=now()-interval '21 days' WHERE project_id=$1 AND kind='operations'",[v.late]);await p.query("UPDATE approvals SET requested_at=now()-interval '9 days' WHERE id=ANY($1::uuid[]) AND project_id=ANY($2::uuid[]) AND status='pending'",[v.approvals,v.ids]);console.log('Fixture timestamps updated.');}finally{await p.end();}`;
   // Run inside the backend so the database credential never enters arguments.
   const backend=port==='8080'?'shockwave-local-backend-1':null;
   const payload=JSON.stringify({dataset:DATASET,ids:Object.values(projects).map(p=>p.id),late:late.id,approvals:[state.resources['approval:review-report-step2'].id]});
   if(backend)return run('docker',['exec','-i',backend,'node','--input-type=module','-e',code],payload);
   return run(process.execPath,['--input-type=module','-e',code],payload,join(process.env.TEMP,'shockwave-pmo-validation','backend'));
  });
  const teams=port==='8080'?JSON.parse(await run('docker',['exec','shockwave-local-backend-1','node','-e',"console.log(JSON.stringify({configured:!!process.env.TEAMS_WEBHOOK_URL}))"])): {configured:!!process.env.TEAMS_WEBHOOK_URL||/^[ \t]*TEAMS_WEBHOOK_URL=[^\r\n]+/m.test(await readFile(join(process.env.TEMP,'shockwave-pmo-validation','backend','.env'),'utf8'))};
  if(!teams.configured)await once('early-warning',()=>owner.call('/admin/early-warning/run','POST'));

  const health=await owner.call('/portfolio/health'),finance=await owner.call(`/projects/${app.id}/finance`),approvals=await owner.call('/approvals?scope=inbox'),tracker=await owner.call('/action-items?status=all'),knowledge=await owner.call('/knowledge?q=DEMO'),archive=await owner.call('/admin/archives');
  const demoIds=new Set(Object.values(projects).map(p=>p.id));
  const summary={dataset:DATASET,origin:base,today,projects:PROJECTS.map(p=>({code:p.code,name:p.name,id:projects[p.key].id,scenario:p.scenario,rag:health.projects.find(h=>h.id===projects[p.key].id)?.rag||'archived'})),documents:Object.entries(state.resources).filter(([key])=>key.startsWith('doc:')).length,approvals_pending:approvals.approvals.filter(a=>demoIds.has(a.project_id)).length,action_items:tracker.items.filter(a=>demoIds.has(a.project_id)).length,lessons:knowledge.lessons.filter(l=>demoIds.has(l.project_id)).length,app_finance:finance.summary,archived:archive.projects.some(p=>p.id===projects.archive.id),external_teams_triggered:false,checked_at:new Date().toISOString()};
  if(!summary.archived||!summary.approvals_pending||!summary.lessons||summary.app_finance.paid!==340000000)throw Error('Dataset final consistency check failed.');
  state.complete=true;state.summary=summary;await persist();await saveJson(join(folder,'summary.json'),summary);console.log(`[${port}] READY: ${summary.projects.length} projects, ${summary.documents} documents, ${summary.approvals_pending} pending approvals.`);
 }finally{await Promise.all(Object.values(clients).map(client=>client.logout()));}
}
