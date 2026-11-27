import { SessionDocumentLogo } from './document-branding';
import { UserSelect } from './user-select';
import { SettingsSectionHeading } from './settings-section';
import { FormField, PasswordField, TextInput, Select } from './form-controls';
import { Pencil, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { superAdminId, workspaceMenus, type WorkspaceGroup, type WorkspaceMenu, type WorkspacePerson } from '../../../packages/shared/workspace-admin';
import { api, Button, ConfirmDialog, FieldLabel, Dialog, Empty, ErrorBox, Pill } from './ui';

type Directory={groups:WorkspaceGroup[];people:WorkspacePerson[]};
const blankGroup={name:'',menus:[] as WorkspaceMenu[],edit:false};

export function WorkspaceSettings({notify,currentUserId}:{currentUserId:string;notify:(message:string)=>void}){
  const [directory,setDirectory]=useState<Directory>();
  const [openUser,setOpenUser]=useState(false);
  const [activation,setActivation]=useState<WorkspacePerson>();
  const [editGroup,setEditGroup]=useState<WorkspaceGroup|null>();
  const [group,setGroup]=useState(blankGroup);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  const [assignment,setAssignment]=useState<{id:string;groupId:string}>();
  const [pending,setPending]=useState<{title:string;object:string;consequence:string;confirmLabel:string;run:()=>Promise<void>}>();
  const userField=useId();
  const target=directory?.people.find(person=>person.id===assignment?.id);
  const groups=directory?.groups??[];

  async function refresh(){setDirectory(await api<Directory>('/workspace'))}
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
  async function run(action:()=>Promise<void>){
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{await action()}
    catch(e){setError((e as Error).message)}
    finally{working.current=false;setBusy(false)}
  }
  function startGroup(value:WorkspaceGroup|null){
    setError('');setEditGroup(value);setGroup(value?{name:value.name,menus:value.menus,edit:value.edit}:blankGroup);
  }
  function saveGroup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');
    setPending({
      title:editGroup?'Ubah hak akses grup':'Buat grup',
      object:group.name.trim(),confirmLabel:editGroup?'Simpan hak akses':'Buat grup',
      consequence:editGroup?'Hak akses baru akan berlaku untuk seluruh anggota grup ini.':'Grup baru akan tersedia saat mengatur akses pengguna.',
      run:async()=>{
        await api('/workspace/groups'+(editGroup?'/'+editGroup.id:''),editGroup?'PUT':'POST',group);
        setPending(undefined);setEditGroup(undefined);notify('Hak akses grup disimpan.');await refresh();
      },
    });
  }
  function addUser(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    const joined=groups.find(item=>item.id===fields.groupId);
    if(!joined){setError('Pilih grup yang tersedia.');return}
    setError('');
    setPending({
      title:'Buat akun pengguna',object:String(fields.name).trim(),confirmLabel:'Buat akun',
      consequence:joined.id===superAdminId?'Akun akan mendapat akses penuh, termasuk administrasi dan finalisasi dokumen.':'Pengguna dapat masuk dengan hak akses grup '+joined.name+'.',
      run:async()=>{await api('/workspace/users','POST',fields);setPending(undefined);setOpenUser(false);notify('Pengguna ditambahkan.');await refresh()},
    });
  }
  function changeGroup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    const person=directory?.people.find(item=>item.id===data.userId&&item.id===assignment?.id);
    const group=groups.find(item=>item.id===data.groupId);
    if(!person||person.pendingActivation||person.id===currentUserId||!group||person.groupId===group.id)return;
    setError('');
    setPending({
      title:'Ubah grup pengguna',object:person.name,confirmLabel:'Pindahkan pengguna',
      consequence:group.id===superAdminId?'Akun akan mendapat akses penuh, termasuk administrasi dan finalisasi dokumen.':'Hak akses pengguna akan mengikuti grup '+group.name+'.',
      run:async()=>{
        await api('/workspace/users/'+encodeURIComponent(person.id),'PATCH',{groupId:group.id});
        setPending(undefined);setAssignment(undefined);notify('Grup pengguna diperbarui.');await refresh();
      },
    });
  }
  function activate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!activation)return;
    const password=String(new FormData(event.currentTarget).get('password')??'');
    const account=activation;
    setError('');
    setPending({
      title:'Aktifkan Super Admin',object:account.email,confirmLabel:'Aktifkan akun',
      consequence:'Akun ini akan dapat masuk dan mendapat akses penuh, termasuk finalisasi dokumen dan administrasi workspace.',
      run:async()=>{
        await api('/workspace/users/'+encodeURIComponent(account.id)+'/activate','POST',{password});
        setPending(undefined);setActivation(undefined);notify('Akun Super Admin aktif.');await refresh();
      },
    });
  }
  return <div className="settings-sections settings-admin">
    {error&&!openUser&&!activation&&!assignment&&editGroup===undefined&&<ErrorBox message={error}/>}
    <section className="panel padded">
      <div className="split settings-admin-heading"><SettingsSectionHeading topic="users" description="Lihat akun dan grup pengguna di workspace."/><Button type="button" className="button primary" disabled={busy||!directory} onClick={()=>{
        setError('');setOpenUser(true);
      }}><UserPlus size={15}/> Tambah pengguna</Button></div>
      {!directory&&!error&&<p className="muted" role="status">Memuat daftar pengguna dan grup…</p>}
      {!directory&&error&&<Button type="button" className="button" onClick={()=>{setError('');refresh().catch(error=>setError(error.message))}}>Coba lagi</Button>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nama dan email</th><th>Grup</th></tr></thead><tbody>
        {(directory?.people??[]).map(person=><tr key={person.id}><td><strong>{person.name}</strong><br/>{person.email}</td><td>
          <div className="heading-actions">
          <Pill tone="violet">{directory?.groups.find(item=>item.id===person.groupId)?.name??'Tidak diketahui'}</Pill>
          {person.builtin&&<Pill>Bawaan</Pill>}
          {person.pendingActivation&&<><Pill tone="amber">Belum aktif</Pill><Button type="button" className="button" disabled={busy}
            onClick={()=>{setError('');setActivation(person)}}>Aktifkan akun</Button></>}
          {!person.builtin&&!person.pendingActivation&&person.id!==currentUserId&&groups.length>0&&<Button type="button" className="icon-button"
            disabled={busy} aria-label={'Ubah grup '+person.name} title="Ubah grup" onClick={()=>{setError('');setAssignment({id:person.id,groupId:person.groupId})}}>
            <Pencil size={16}/>
          </Button>}
          </div>
        </td></tr>)}
      </tbody></table></div>
    </section>
    <section className="panel padded">
      <div className="split settings-admin-heading"><SettingsSectionHeading topic="groups" description="Kelola akses menu dan izin setiap grup."/><Button className="button primary" disabled={busy} onClick={()=>startGroup(null)}><Plus size={15}/> Tambah grup</Button></div>
      {!directory?<Empty>{error?'Grup gagal dimuat.':'Memuat grup…'}</Empty>:<div className="workspace-groups">
        {directory.groups.map(item=><div className="history-row" key={item.id}><div><div className="heading-actions"><strong>{item.name}</strong>{item.builtin&&<Pill>Bawaan</Pill>}</div><small className="block muted">{item.menus.map(id=>workspaceMenus.find(([key])=>key===id)?.[1]).join(' · ')}</small><Pill tone={item.edit?'violet':'neutral'}>{item.id===superAdminId?'Akses penuh · Administrasi dan finalisasi':item.edit?'Lihat dan ubah':'Lihat'}</Pill></div>
          {!item.builtin&&<Button className="button" disabled={busy} onClick={()=>startGroup(item)}><ShieldCheck size={15}/> Atur hak akses</Button>}
        </div>)}
      </div>}
    </section>
    <section className="panel padded">
      <SettingsSectionHeading topic="identity" description="Perubahan berlaku di semua menu dokumen selama sesi ini. Saat masuk kembali, logo SDD digunakan."/>
      <SessionDocumentLogo scope="global"/>
    </section>
    {assignment&&directory&&<Dialog title="Ubah grup pengguna" restoreFocus close={()=>{if(!busy)setAssignment(undefined)}}>
      <form onSubmit={changeGroup}>
        <div className="dialog-content fields">
          <div className="field"><label htmlFor={userField}><FieldLabel label="Pengguna" required/></label>
            <UserSelect id={userField} name="userId" label="Pengguna" people={directory.people.filter(person=>!person.builtin&&!person.pendingActivation&&person.id!==currentUserId)}
              groups={directory.groups} value={assignment.id} required disabled={busy}
              onValue={id=>{const person=directory.people.find(item=>item.id===id);if(person)setAssignment({id,groupId:person.groupId})}}/>
          </div>
          <FormField label="Grup" required><Select name="groupId" required value={assignment.groupId}
            onChange={event=>setAssignment({...assignment,groupId:event.target.value})}>
            {!groups.some(item=>item.id===assignment.groupId)&&<option disabled value={assignment.groupId}>{directory.groups.find(item=>item.id===assignment.groupId)?.name??'Grup saat ini'}</option>}
            {groups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </Select></FormField>
          {error&&!pending&&<ErrorBox message={error}/>}
        </div>
        <div className="dialog-actions"><Button type="submit" className="button primary" disabled={!target||target.groupId===assignment.groupId||busy}>Simpan grup</Button></div>
      </form>
    </Dialog>}
    {activation&&<Dialog title="Aktifkan Super Admin" restoreFocus close={()=>{if(!busy)setActivation(undefined)}}><form onSubmit={activate}>
      <div className="dialog-content fields">
        <p><strong>{activation.name}</strong><br/>{activation.email}</p>
        <p className="muted">Akun Preview tersedia di profil browser ini.</p>
        <PasswordField label="Kata sandi awal" required minLength={12} maxLength={128} name="password" autoComplete="new-password"/>
        {error&&!pending&&<ErrorBox message={error}/>}
      </div>
      <div className="dialog-actions"><Button type="submit" className="button primary" disabled={busy}>Lanjutkan</Button></div>
    </form></Dialog>}
    {openUser&&<Dialog title="Tambah pengguna" restoreFocus close={()=>{if(!busy)setOpenUser(false)}}><form onSubmit={addUser}>
      <div className="dialog-content fields"><label><FieldLabel label="Nama" required/><TextInput required name="name" placeholder="Rani Pratama" maxLength={100}/></label><label><FieldLabel label="Email" required/><TextInput required name="email" type="email" placeholder="rani@example.com"/></label>
        <label><FieldLabel label="Grup" required/><Select name="groupId" required placeholder="Pilih grup">{groups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
        <PasswordField label="Kata sandi awal" required minLength={12} maxLength={128} name="password" placeholder="Minimal 12 karakter" autoComplete="new-password"/>
        {error&&<ErrorBox message={error}/>}</div>
      <div className="dialog-actions"><Button type="submit" className="button primary" disabled={busy}>Simpan pengguna</Button></div>
    </form></Dialog>}
    {editGroup!==undefined&&<Dialog title={editGroup?'Atur hak akses grup':'Tambah grup'} className="workspace-group-dialog" restoreFocus close={()=>{if(!busy)setEditGroup(undefined)}}><form onSubmit={saveGroup}>
      <div className="dialog-content fields"><label><FieldLabel label="Nama grup" required/><TextInput required maxLength={80} placeholder="Tim Infrastruktur" value={group.name} onChange={e=>setGroup({...group,name:e.target.value})}/></label>
        <fieldset className="workspace-permissions"><legend>Menu yang dapat dibuka</legend>{workspaceMenus.map(([id,label])=><label className="check" key={id}>
          <input type="checkbox" checked={group.menus.includes(id)} onChange={event=>setGroup({...group,menus:event.target.checked?[...group.menus,id]:group.menus.filter(key=>key!==id)})}/>{label}
        </label>)}</fieldset>
        <label className="check"><input type="checkbox" checked={group.edit} onChange={event=>setGroup({...group,edit:event.target.checked})}/> Boleh mengubah data pada menu yang dipilih</label>
        {error&&<ErrorBox message={error}/>}</div>
      <div className="dialog-actions"><Button type="submit" className="button primary" disabled={busy||!group.menus.length}>Simpan grup</Button></div>
    </form></Dialog>}
    {pending&&<ConfirmDialog title={pending.title} object={pending.object} consequence={pending.consequence}
      confirmLabel={pending.confirmLabel} pending={busy?'Menyimpan…':undefined} error={error}
      onCancel={()=>{setPending(undefined);setError('')}} onConfirm={()=>void run(pending.run)}/>}
  </div>;
}
