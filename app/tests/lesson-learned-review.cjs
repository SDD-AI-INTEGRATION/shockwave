// Run after npm run build. Exercise the actual Preview worker with synthetic state.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const { randomUUID, webcrypto }=require('node:crypto');
const { buildSync }=require('esbuild');
const origin='https://shockwave.example.test';
const handlers=new Map();
const {meetings}=JSON.parse(fs.readFileSync('packages/shared/review.json','utf8'));
let failWrite=false;
let snapshot={loggedIn:true,expires:Date.now()+3600000,sessionUser:'reviewer',
  preferences:{theme:'light',accent:'shockwave',collapsed:false},meetings,documents:{}};
const database={
  transaction(){
    const transaction={objectStore:()=>({
      get(){const request={result:structuredClone(snapshot)};queueMicrotask(()=>request.onsuccess());return request},
      put(value){
        if(failWrite){failWrite=false;queueMicrotask(()=>transaction.onerror());return}
        snapshot=structuredClone(value);queueMicrotask(()=>transaction.oncomplete());
      },
    })};
    return transaction;
  },
};
const indexedDB={open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request}};
vm.runInNewContext(fs.readFileSync('dist/review-api.js','utf8'),{
  self:{location:new URL(origin),addEventListener:(type,listener)=>handlers.set(type,listener)},
  indexedDB,structuredClone,Response,Request,URL,URLSearchParams,TextEncoder,TextDecoder,atob,navigator,crypto:webcrypto,setTimeout,clearTimeout,
});
const domainModule={exports:{}};
vm.runInNewContext(buildSync({entryPoints:['packages/shared/lesson-learned.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,
  {module:domainModule,exports:domainModule.exports,crypto:webcrypto,Date,Intl});
const {lessonSeed,lessonCounts,lessonToday,lessonDateValid,moveLessonEntry,moveLessonQuestion}=domainModule.exports;
const path='documents/lesson-learned';
async function api(route,method='GET',body,expected=200){
  const request=new Request(origin+'/api/v1/'+route,{
    method,headers:{'X-Shockwave-Request':'1','Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const response=await new Promise(resolve=>handlers.get('fetch')({request,respondWith:resolve}));
  const result=await response.json();
  assert.equal(response.status,expected,route+': '+(result.message??''));
  return result;
}
const record=(id,code=200)=>api(path+'/'+id,'GET',undefined,code);
const put=(id,body,code)=>api(path+'/'+id,'PUT',body,code);
const write=(data,expectedVersion,status='DRAFT')=>({data,expectedVersion,status,requestId:randomUUID()});
function role(menus,edit){
  const groupId=randomUUID();
  snapshot.groups=[{id:groupId,name:'Fixture',menus,edit}];
  snapshot.people=[{id:'fixture',name:'Akun Fixture',email:'fixture@example.test',groupId}];
  snapshot.sessionUser='fixture';
}

(async()=>{
  const directory=await api('workspace');
  assert.ok(directory.people.find(person=>person.id==='reviewer').builtin);
  const personInput={name:'Pengguna uji',email:'pmofixture@example.test',password:'fixture-pass-0123',groupId:'workspace-admin'};
  await api('workspace/users','POST',{...personInput,groupId:randomUUID()},400);
  const person=await api('workspace/users','POST',personInput,201);
  assert.equal(person.groupId,'workspace-admin');
  await api('auth/logout','POST');
  await api('auth/login','POST',{id:person.email,password:personInput.password});
  const account=(await api('auth/me')).user;
  assert.equal(account.id,person.id);
  assert.equal(account.role,'MANAGER_PMO');
  assert.equal(account.workspaceAdmin,false);
  assert.ok(account.menus.includes('lesson-learned'));
  await api('workspace','GET',undefined,403);
  await api('workspace/users','POST',{...personInput,email:'rejected@example.test'},403);
  snapshot.sessionUser='reviewer';
  const archivedLogo='data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8NcD/2Vj6Vj6Vj94L/4VfG5CwoAA';
  const assignment='documents/assignment/'+randomUUID();
  const letter={fields:{pm:'PM uji',projectName:'Proyek uji',customer:'Pelanggan uji',classification:'Small',date:'2026-11-26'},logo:''};
  await api('me/document-branding','PATCH',{scope:'global',logo:archivedLogo});
  const draftLetter=await api(assignment,'PUT',{version:0,data:letter},200);
  assert.equal(draftLetter.data.fields.projectName,'Proyek uji');
  const issuedLetter=await api(assignment,'PUT',{version:1,publish:true,data:letter},200);
  assert.equal(issuedLetter.data.logo,archivedLogo);
  await api('me/document-branding','PATCH',{scope:'global',logo:''});
  const letters=await api('documents/assignment');
  assert.equal(letters.find(item=>item.id===issuedLetter.id).data.logo,archivedLogo);
  await api('me/document-branding','PATCH',{scope:'assignment',logo:'data:image/png;base64,UklGRg=='},400);
  assert.equal((await api('documents/assignment')).find(item=>item.id===issuedLetter.id).data.logo,archivedLogo);
  console.log('PASS: assignment draft, issued logo retained, workspace reset, invalid logo rejected.');
  const {projects,records}=await api(path);
  assert.equal(records.length,0);
  const project=projects.find(project=>project.pm);
  assert.ok(projects.length>1&&project);
  assert.ok(projects.some(value=>!value.pm));
  const master=JSON.stringify(await api('projects'));
  const original=structuredClone(lessonSeed());
  const data={projectId:project.id,projectName:'Proyek Override',preparedByName:'Penyusun Berbeda',projectManagerName:'PM Snapshot',
    documentDate:'2024-02-29',description:'Alfa Ω\n\n<script>fixture</script>\n=1+1',categories:original};
  assert.deepEqual(original.map(category=>category.items.length),[5,4,4,4]);
  assert.equal(original[3].items[1].prompt,'Produk di-deliverd dengan jadual dan budget yang berkembang');
  assert.equal(lessonCounts(original).unanswered,17);
  assert.equal(lessonDateValid('2026-02-29'),false);
  assert.equal(lessonToday(new Date('2026-11-26T17:05:00.000Z')),'2026-11-27');
  assert.equal(lessonCounts([]).progress,0);
  const id=randomUUID(),other=randomUUID();
  await put(id,write({...data,projectId:'forbidden'},0),403);
  await put(id,write({...data,documentDate:'2026-11-31'},0),422);
  await put(id,write(data,0,'FINAL'),422);
  const first=await put(id,write(data,0),201);
  assert.equal(first.createdBy,'reviewer');
  assert.equal(first.data.preparedByName,'Penyusun Berbeda');
  assert.equal(first.data.documentDate,'2024-02-29');
  assert.equal(first.data.categories[0].items[0].answer,null);
  const empty=await put(other,write({...data,categories:[]},0),201);
  assert.deepEqual((await record(other)).data.categories,[]);
  await put(other,write(empty.data,1,'FINAL'),422);
  assert.equal((await api(path)).records.length,2);
  const renamed={...original[0],name:'Rencana Ω'};
  const nextGroup={id:randomUUID(),name:'Kategori Baru',items:[]};
  let categories=moveLessonEntry([renamed,original[1],original[3],nextGroup],3,0);
  const moved=categories[1].items[0];
  moved.answer='NA';
  categories=structuredClone(moveLessonQuestion(categories,renamed.id,nextGroup.id,moved.id));
  assert.deepEqual(categories[0].items,[{...moved,answer:'NA'}]);
  assert.ok(!categories[1].items.some(item=>item.id===moved.id));
  assert.equal(lessonCounts(categories).NA,1);
  categories[1].items=moveLessonEntry(categories[1].items,0,2);
  categories[1].items.pop();
  const updated={...data,categories};
  await put(id,write({...data,categories:[{...nextGroup,name:'  '}]},1),422);
  await put(id,write({...data,categories:[{...nextGroup,items:[{...moved,prompt:''}]}]},1),422);
  await put(id,write({...data,categories:[{...nextGroup,items:[moved,moved]}]},1),422);
  await put(id,write({...data,categories:[{...nextGroup,items:[{...moved,categoryId:randomUUID()}]}]},1),422);
  const save=write(updated,1);
  failWrite=true;
  await put(id,save,500);
  assert.equal((await record(id)).version,1);
  const second=await put(id,save,200);
  assert.deepEqual((await record(id)).data,updated);
  assert.deepEqual(await put(id,save,200),second);
  await put(id,{...save,data:{...updated,description:'different'}},409);
  await put(id,write(data,1),409);
  const finalData={...updated,categories:categories.map(category=>({...category,
    items:category.items.map((item,i)=>({...item,answer:i%2===0?'NA':'NO'}))}))};
  const finalRequest=write(finalData,2,'FINAL');
  const [final,retry]=await Promise.all([put(id,finalRequest,200),put(id,finalRequest,200)]);
  assert.deepEqual(final,retry);
  assert.equal(final.finalizedBy,'reviewer');assert.equal(final.version,3);
  assert.equal(final.formCode,'SDD-FM-PMO-01-03');assert.equal(final.logo,'/brand/sdd.png');
  assert.equal((await api(path)).records.filter(row=>row.status==='FINAL').length,1);
  await put(id,write(data,3),409);
  await api(path+'/'+id,'DELETE',{},405);
  assert.deepEqual(await record(id),final);
  assert.equal(JSON.stringify(await api('projects')),master);
  assert.deepEqual((await record(other)).data.categories,[]);
  assert.deepEqual(snapshot.meetings,meetings);

  role(['projects'],true);
  await api(path,'GET',undefined,403);await record(id,403);await put(other,write(data,1),403);
  role(['projects','lesson-learned'],false);
  await record(id);await put(other,write(data,1),403);
  role(['lesson-learned'],true);
  assert.equal((await api(path)).projects.length,0);await put(other,write(data,1),403);
  role(['projects','lesson-learned'],true);
  const edit=await put(other,write({...data,description:'Emendasi'},1),200);
  assert.equal(edit.updatedBy,'fixture');assert.equal(edit.createdBy,'reviewer');
  snapshot.groups[0].menus=['projects'];
  await record(id,403);
  snapshot.loggedIn=false;
  await record(id,401);
  console.log('PASS: Preview API authorization/revocation, project scope, version conflict, duplicate final retry, write failure, immutable archive and independent drafts.');
  console.log('PASS: seed, dynamic IDs/order/move, invalid/empty checks, date/WIB, audit actor and existing data regression.');
})().catch(error=>{console.error(error);process.exitCode=1});
