import { Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { workspaceMenus, type WorkspaceGroup, type WorkspaceMenu, type WorkspacePerson } from '../../../packages/shared/workspace-admin';
import { api, Dialog, Empty, ErrorBox, Pill } from './ui';

type Directory={groups:WorkspaceGroup[];people:WorkspacePerson[]};
type Tab='people'|'groups';
const tabs:readonly [Tab,string][]=[['people','Pengguna'],['groups','Grup & hak akses']];
const blankGroup={name:'',menus:[] as WorkspaceMenu[],edit:false};

export function WorkspaceSettings({notify}:{notify:(message:string)=>void}){
  const [tab,setTab]=useState<Tab>('people');
  const [directory,setDirectory]=useState<Directory>();
  const [openUser,setOpenUser]=useState(false);
  const [editGroup,setEditGroup]=useState<WorkspaceGroup|null>();
  const [group,setGroup]=useState(blankGroup);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const groups=directory?.groups.filter(item=>!item.builtin)??[];

  async function refresh(){setDirectory(await api<Directory>('/workspace'))}
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('');
    try{await action()}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  function startGroup(value:WorkspaceGroup|null){
    setError('');setEditGroup(value);setGroup(value?{name:value.name,menus:value.menus,edit:value.edit}:blankGroup);
  }
  function saveGroup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    void run(async()=>{
      await api('/workspace/groups'+(editGroup?'/'+editGroup.id:''),editGroup?'PUT':'POST',group);
      await refresh();setEditGroup(undefined);notify('Hak akses grup disimpan.');
    });
  }
  function addUser(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    void run(async()=>{await api('/workspace/users','POST',fields);await refresh();setOpenUser(false);notify('Pengguna ditambahkan.')});
  }
  return <section className="panel padded workspace-settings">
    <h2>Pengaturan ruang kerja</h2>
    <div className="ops-tabs workspace-tabs"><div>{tabs.map(([id,label])=><button key={id} className={tab===id?'selected':''} aria-pressed={tab===id}
      onClick={()=>{setTab(id);setError('')}}>{label}</button>)}</div></div>
    {error&&!openUser&&editGroup===undefined&&<ErrorBox message={error}/>}
    {tab==='people'&&<>
      <div className="split workspace-heading"><h3>Pengguna</h3><button className="button primary" disabled={busy||!groups.length} onClick={()=>{setError('');setOpenUser(true)}}><UserPlus size={15}/> Tambah pengguna</button></div>
      {!groups.length&&<p className="muted">Buat grup untuk menetapkan menu pengguna baru.</p>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nama dan email</th><th>Grup</th></tr></thead><tbody>
        {(directory?.people??[]).map(person=><tr key={person.id}><td><strong>{person.name}</strong><br/>{person.email}</td><td>
          {groups.some(item=>item.id===person.groupId)?<select disabled={busy} aria-label={'Grup '+person.name} value={person.groupId} onChange={event=>{
            const groupId=event.target.value;
            void run(async()=>{await api('/workspace/users/'+person.id,'PATCH',{groupId});await refresh();notify('Grup pengguna diperbarui.')});
          }}>{groups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>:<Pill tone="violet">Administrator PMO</Pill>}
        </td></tr>)}
      </tbody></table></div>
    </>}
    {tab==='groups'&&<>
      <div className="split workspace-heading"><h3>Grup & hak akses menu</h3><button className="button primary" disabled={busy} onClick={()=>startGroup(null)}><Plus size={15}/> Tambah grup</button></div>
      {!directory?.groups.length?<Empty>Memuat grup…</Empty>:<div className="workspace-groups">
        {directory.groups.map(item=><div className="history-row" key={item.id}><div><strong>{item.name}</strong><small className="block muted">{item.menus.map(id=>workspaceMenus.find(([key])=>key===id)?.[1]).join(' · ')}</small><Pill tone={item.edit?'violet':'neutral'}>{item.edit?'Lihat dan ubah':'Lihat'}</Pill></div>
          {!item.builtin&&<button className="button" disabled={busy} onClick={()=>startGroup(item)}><ShieldCheck size={15}/> Atur hak akses</button>}
        </div>)}
      </div>}
    </>}
    {openUser&&<Dialog title="Tambah pengguna" close={()=>{if(!busy)setOpenUser(false)}}><form onSubmit={addUser}>
      <div className="dialog-content fields"><label>Nama<input required name="name" maxLength={100}/></label><label>Email<input required name="email" type="email"/></label>
        <label>Grup<select name="groupId" required defaultValue=""><option value="" disabled>Pilih grup</option>{groups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Kata sandi awal<input required minLength={12} maxLength={128} type="password" name="password" autoComplete="new-password"/></label>
        {error&&<ErrorBox message={error}/>}</div>
      <div className="dialog-actions"><button type="submit" className="button primary" disabled={busy}>Simpan pengguna</button></div>
    </form></Dialog>}
    {editGroup!==undefined&&<Dialog title={editGroup?'Atur hak akses grup':'Tambah grup'} close={()=>{if(!busy)setEditGroup(undefined)}}><form onSubmit={saveGroup}>
      <div className="dialog-content fields"><label>Nama grup<input required maxLength={80} value={group.name} onChange={e=>setGroup({...group,name:e.target.value})}/></label>
        <fieldset className="workspace-permissions"><legend>Menu yang dapat dibuka</legend>{workspaceMenus.map(([id,label])=><label className="check" key={id}>
          <input type="checkbox" checked={group.menus.includes(id)} onChange={event=>setGroup({...group,menus:event.target.checked?[...group.menus,id]:group.menus.filter(key=>key!==id)})}/>{label}
        </label>)}</fieldset>
        <label className="check"><input type="checkbox" checked={group.edit} onChange={event=>setGroup({...group,edit:event.target.checked})}/> Boleh mengubah data pada menu yang dipilih</label>
        {error&&<ErrorBox message={error}/>}</div>
      <div className="dialog-actions"><button type="submit" className="button primary" disabled={busy||!group.menus.length}>Simpan grup</button></div>
    </form></Dialog>}
  </section>;
}
