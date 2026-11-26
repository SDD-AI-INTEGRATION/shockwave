import { NavIcon } from './nav-icon';
import { ShellBack } from './shell-back';
import { SettingsSectionHeading } from './settings-section';
import { TextInput, Select } from './form-controls';
import { WorkspaceSettings } from './workspace-settings';
import { Moon, Plus, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleNames, roles } from '../../../packages/shared/domain';
import { canUsePasskeys, loginWithPasskey, PasskeySettings } from './passkeys';
import { Button, api, ConfirmDialog, FieldLabel, DataTable, dateLabel, Dialog, ErrorBox, Heading, PendingButton, PendingStatus, Pill, type Appearance, type User } from './ui';

type MfaChallenge={mfa:true;token:string;setupKey:string|null};
type Security={mfa:boolean;sessions:{id:string;created:number;seen:number;current:boolean}[]};

function MfaForm({challenge,done,cancel,remember=false}: {challenge:MfaChallenge;done:(user:User)=>void;cancel:()=>void;remember?:boolean}){
  const [code,setCode]=useState('');
  const [asBackup,setAsBackup]=useState(false);
  const [trust,setTrust]=useState(remember);
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  const [error,setError]=useState('');
  const [backup,setBackup]=useState<{user:User;backupCodes:string[]}|null>(null);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{
      const result=await api<{user:User;backupCodes:string[]}>('/auth/mfa','POST',{token:challenge.token,code,trust});
      if(result.backupCodes.length)setBackup(result);else done(result.user);
    }catch(e){setError((e as Error).message)}finally{working.current=false;setBusy(false)}
  }
  if(backup)return <div className="fields"><h2>Simpan kode cadangan</h2><p className="muted">Simpan kode di tempat aman. Setiap kode berlaku satu kali.</p><div className="recovery-codes">{backup.backupCodes.map(code=><code key={code}>{code}</code>)}</div><Button type="button" className="button primary" onClick={()=>done(backup.user)}>Lanjutkan</Button></div>;
  return <form className="fields mfa-form" onSubmit={submit}>
    <small className="muted">Langkah 2 dari 2</small>
    <h2>{challenge.setupKey?'Aktifkan verifikasi dua langkah':'Kode verifikasi'}</h2>
    <p className="muted">{asBackup?'Pakai salah satu kode cadangan Anda.':'Masukkan 6 digit dari aplikasi autentikator.'}</p>
    {challenge.setupKey&&<><p className="muted">Tambahkan kunci ini ke aplikasi autentikator.</p><code className="setup-key">{challenge.setupKey}</code></>}
    <label htmlFor="mfa-code" className={asBackup?'':'otp-field'}>
      {asBackup?'Kode cadangan':<span className="visually-hidden">Kode 6 digit</span>}
      {!asBackup&&<span className="otp-slots" aria-hidden="true">{Array.from({length:6},(_,index)=><span className={index===Math.min(code.length,5)?'current':''} key={index}>{code[index]}</span>)}</span>}
      <TextInput id="mfa-code" name="code" placeholder={asBackup?'12 karakter kode cadangan':'123456'} autoFocus autoComplete="one-time-code" minLength={asBackup?12:6} maxLength={asBackup?12:6} inputMode={asBackup?'text':'numeric'} value={code} onChange={e=>setCode(asBackup?e.target.value.replace(/[^0-9a-f]/gi,''):e.target.value.replace(/[^0-9]/g,''))} required />
    </label>
    <label className="check"><input type="checkbox" checked={trust} onChange={e=>setTrust(e.target.checked)}/> Percayai perangkat ini selama 30 hari</label>
    {error&&<ErrorBox message={error}/>}
    <PendingStatus hidden message={busy?'Memverifikasi kode…':undefined}/><PendingButton className="button primary" pending={busy?'Memverifikasi kode…':undefined}>Verifikasi</PendingButton>
    {!challenge.setupKey&&<button type="button" className="subtle-button" disabled={busy} onClick={()=>{setAsBackup(!asBackup);setCode('')}}>{asBackup?'Pakai kode autentikator':'Pakai kode cadangan'}</button>}
    <button type="button" className="subtle-button" disabled={busy} onClick={cancel}>Kembali</button>
  </form>;
}

export function Login({demo,loggedIn,startupError,resetAvailable,googleAvailable,passkeyAvailable}: {demo:boolean;loggedIn:(user:User)=>void;startupError:string;resetAvailable:boolean;googleAvailable:boolean;passkeyAvailable:boolean}) {
  const [show,setShow]=useState(false);
  const [caps,setCaps]=useState(false);
  const [remember,setRemember]=useState(false);
  const [pending,setPending]=useState<'login'|'reset'|'passkey'|'google'|'demo'|null>(null);
  const working=useRef(false);
  const [passkeyPhase,setPasskeyPhase]=useState<'device'|'verify'>();
  const [error,setError]=useState(startupError);
  const [challenge,setChallenge]=useState<MfaChallenge|null>(null);
  const [mode,setMode]=useState(location.hash.startsWith('#reset/')?'reset':'login');
  const [notice,setNotice]=useState('');
  const [feedback,setFeedback]=useState<{action:'recovery'|'google'|'passkey';message:string}|null>(null);
  const busy=pending!==null;

  useEffect(()=>{
    const url=new URL(location.href);
    const result=url.searchParams.get('google');
    if(!result)return;
    url.searchParams.delete('google');
    history.replaceState(null,'',url);
    if(result==='verify'&&googleAvailable){
      working.current=true;setPending('google');
      api<MfaChallenge>('/auth/google/finish','POST').then(setChallenge)
        .catch(e=>setFeedback({action:'google',message:e.message})).finally(()=>{working.current=false;setPending(null)});
    }else if(result==='error'){
      setFeedback({action:'google',message:'Gagal masuk dengan Google. Gunakan email Google yang terdaftar di Shockwave PMO.'});
    }
  },[googleAvailable]);

  function clearFeedback() {
    setError('');
    setNotice('');
    setFeedback(null);
  }
  function switchMode(next:string) {
    clearFeedback();
    setMode(next);
    if(next==='login') location.hash='login';
  }
  function showFeedback(action:'recovery'|'google'|'passkey',message:string) {
    clearFeedback();
    setFeedback({action,message});
  }
  async function reset(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(working.current)return;
    working.current=true;setPending('reset');
    clearFeedback();
    const values=Object.fromEntries(new FormData(event.currentTarget));
    try{
      if(mode==='reset'){
        if(values.password!==values.confirm)throw new Error('Kedua kata sandi harus sama.');
        await api('/auth/reset','POST',{password:values.password,token:location.hash.split('/')[1]});
        location.hash='login';
        setNotice('Kata sandi diperbarui. Masuk dengan kata sandi baru.');
      }else{
        await api('/auth/forgot','POST',values);
        setNotice('Jika akun terdaftar, tautan akan dikirim ke email Anda.');
      }
      setMode('login');
    }catch(e){setError((e as Error).message)}finally{working.current=false;setPending(null)}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(working.current)return;
    const data=new FormData(event.currentTarget);
    working.current=true;
    setPending('login');
    clearFeedback();
    try {
      const result=await api<{user:User}|MfaChallenge>('/auth/login','POST',Object.fromEntries(data));
      if('mfa' in result)setChallenge(result);else loggedIn(result.user);
    } catch(e){setError((e as Error).message)}finally{working.current=false;setPending(null)}
  }
  async function usePasskey() {
    if(working.current)return;
    if(!passkeyAvailable){
      showFeedback('passkey','Passkey tidak tersedia untuk sesi ini.');
      return;
    }
    if(!canUsePasskeys()){
      showFeedback('passkey','Passkey memerlukan browser yang mendukung WebAuthn dan koneksi aman.');
      return;
    }
    working.current=true;setPasskeyPhase(undefined);setPending('passkey');
    clearFeedback();
    try{
      const result=await loginWithPasskey<{user:User}|MfaChallenge>(setPasskeyPhase);
      if('mfa' in result)setChallenge(result);else loggedIn(result.user);
    }catch(e){setFeedback({action:'passkey',message:(e as Error).message})}finally{working.current=false;setPending(null)}
  }
  async function openDemo() {
    if(working.current)return;
    working.current=true;setPending('demo');
    clearFeedback();
    try {loggedIn((await api<{user:User}>('/auth/demo','POST')).user)}
    catch(e){setError((e as Error).message)}finally{working.current=false;setPending(null)}
  }

  const status = pending==='login'?'Sedang masuk…':pending==='reset'
    ?(mode==='reset'?'Menyimpan kata sandi…':'Mengirim tautan…'):pending==='passkey'
    ?(passkeyPhase==='device'?'Menunggu konfirmasi perangkat…':passkeyPhase==='verify'?'Memverifikasi passkey…':'Menyiapkan passkey…')
    :pending==='google'?'Memverifikasi Google…':pending==='demo'?'Memuat ruang kerja demo…':undefined;

  const googleLabel = <>
    <img className="login-google-icon" src="/brand/google-g.png" width={200} height={204} alt=""/>
    {pending==='google'?'Memverifikasi Google…':'Masuk dengan Google'}
  </>;

  return <main className="login-screen">
    <section className="login-brand">
      <img src="/brand/shockwave-dark.png" width={360} height={131} alt="Shockwave"/>
      <p>Project Management Office</p>
    </section>
    <section className="login-form-pane" aria-label="Autentikasi">
      <PendingStatus hidden message={status}/>
      {challenge?<div className="login-form"><MfaForm challenge={challenge} done={loggedIn} cancel={()=>setChallenge(null)} remember={remember}/></div>:
      mode!=='login'?<form className="login-form fields" onSubmit={reset}>
        <h1>{mode==='reset'?'Buat kata sandi baru':'Lupa kata sandi'}</h1>
        {mode==='reset'?<>
          <p className="muted">Tautan ini berlaku 30 menit dan hanya sekali pakai.</p>
          <label><FieldLabel label="Kata sandi baru" required/><TextInput autoFocus type="password" required minLength={12} name="password" autoComplete="new-password" placeholder="Minimal 12 karakter"/><small className="muted">Minimal 12 karakter.</small></label>
          <label><FieldLabel label="Ulangi" required/><TextInput type="password" required minLength={12} name="confirm" autoComplete="new-password" placeholder="Minimal 12 karakter"/></label>
        </>:<label><FieldLabel label="Email" required/><TextInput autoFocus name="id" type="email" placeholder="nama@example.com" autoComplete="email" required/></label>}
        {error&&<ErrorBox message={error}/>}
        <PendingButton className="button primary" pending={pending==='reset'?status:undefined}>{mode==='reset'?'Simpan kata sandi':'Kirim tautan'}</PendingButton>
        {mode==='reset'&&<p className="login-footnote">Semua perangkat lain akan dikeluarkan.</p>}
        <Button type="button" className="button" disabled={busy} onClick={()=>switchMode('login')}>Kembali</Button>
      </form>:
      <form className="fields login-form" onSubmit={submit}>
        <header><h1>Masuk</h1><p className="muted">Gunakan akun Anda untuk melanjutkan.</p></header>
        {notice&&<p role="status" className="notice-box">{notice}</p>}
        <label htmlFor="login-id"><FieldLabel label="Email" required/><TextInput id="login-id" type="email" required name="id" autoComplete="username" placeholder="nama@perusahaan.com"/></label>
        <div className="field">
          <label htmlFor="login-password"><FieldLabel label="Kata sandi" required/></label>
          <div className="password-input">
            <TextInput id="login-password" name="password" autoComplete="current-password" placeholder="Masukkan kata sandi Anda" type={show?'text':'password'} required onKeyDown={e=>setCaps(e.getModifierState('CapsLock'))} onKeyUp={e=>setCaps(e.getModifierState('CapsLock'))} onBlur={()=>setCaps(false)}/>
            <button type="button" className="password-toggle" onClick={()=>setShow(!show)} aria-controls="login-password" aria-label={show?'Sembunyikan kata sandi':'Tampilkan kata sandi'}>
              <span className={show?'password-eye is-visible':'password-eye'} aria-hidden="true"/>
            </button>
          </div>
          {caps&&<small className="amber-text" role="status">Caps Lock menyala.</small>}
        </div>
        <button type="button" className="login-link" disabled={busy} onClick={()=>resetAvailable?switchMode('forgot'):showFeedback('recovery','Reset kata sandi belum tersedia di Preview karena layanan email belum dikonfigurasi.')}>Lupa kata sandi?</button>
        {feedback?.action==='recovery'&&<ErrorBox message={feedback.message}/>}
        <label className="check login-remember">
          <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>
          Ingat perangkat ini selama 30 hari untuk MFA
        </label>
        {error&&<ErrorBox message={error}/>}
        <PendingButton className="button primary" disabled={busy&&pending!=='login'} pending={pending==='login'?status:undefined}>Masuk</PendingButton>
        <div className="login-divider" aria-hidden="true"><span>atau</span></div>
        <div className="login-alternatives">
          {googleAvailable
            ?<a className="button" href="/api/v1/auth/google/start" aria-disabled={busy||undefined} tabIndex={busy?-1:undefined} onClick={e=>{if(busy)e.preventDefault()}}>{googleLabel}</a>
            :<Button type="button" className="button" disabled={busy} onClick={()=>showFeedback('google','Google Sign-In belum dikonfigurasi di Preview.')}>{googleLabel}</Button>}
          {feedback?.action==='google'&&<ErrorBox message={feedback.message}/>}
          <PendingButton type="button" className="button" disabled={busy&&pending!=='passkey'} pending={pending==='passkey'?status:undefined} onClick={usePasskey}>
            <span className="login-passkey-icon" aria-hidden="true"/>
            Masuk dengan Passkey
          </PendingButton>
          {feedback?.action==='passkey'&&<ErrorBox message={feedback.message}/>}
        </div>
        {demo&&<Button type="button" className="button" disabled={busy} onClick={openDemo}>{pending==='demo'?'Memproses…':'Buka ruang kerja demo'}</Button>}
      </form>}
    </section>
  </main>;
}

const accents=[['shockwave','Biru Shockwave','#1e31ae'],['violet','Ungu Shockwave','#6b4ce6'],['teal','Toska','#138e82'],['green','Hijau','#16915f'],['orange','Oranye','#be6218'],['red','Merah','#bf4444'],['graphite','Grafit','#545e78']];
const themes=[['system','Ikuti perangkat'],['light','Terang'],['dark','Gelap']] as const;

function SettingsCategory({icon,title,description,onOpen}:{icon:string;title:string;description:string;onOpen:()=>void}){
  return <Button type="button" className="button settings-card" onClick={onOpen}>
    <span className="settings-icon"><NavIcon name={icon}/></span>
    <span><strong>{title}</strong><small>{description}</small></span>
    <i className="settings-chevron" aria-hidden="true"/>
  </Button>;
}

function SettingsProfile({user}:{user:User}){
  const initials=user.name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]).join('').toLocaleUpperCase('id-ID');
  return <section className="panel padded">
    <SettingsSectionHeading topic="profile"/>
    <div className="settings-profile-content">
      <div className="settings-profile">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <div><strong>{user.name}</strong><span>{roleNames[user.role]}</span></div>
      </div>
      <dl className="detail-grid settings-profile-details">
        <div><dt>Email</dt><dd>{user.email||'—'}</dd></div>
        {user.nik&&<div><dt>NIK</dt><dd>{user.nik}</dd></div>}
      </dl>
    </div>
  </section>;
}

function SettingsAppearance({appearance,changeAppearance}:{appearance:Appearance;changeAppearance:(value:Appearance)=>void}){
  return <section className="panel padded">
    <SettingsSectionHeading topic="appearance" description="Sesuaikan tema dan warna aksen aplikasi."/>
    <div className="settings-preferences">
      <div className="settings-preference">
        <h4 id="settings-theme-label">Tema</h4>
        <div className="theme-options" role="group" aria-labelledby="settings-theme-label">
          {themes.map(([id,label])=><Button type="button" key={id} className="button theme-option" aria-pressed={appearance.theme===id} onClick={()=>changeAppearance({...appearance,theme:id})}>
            {id==='system'?<NavIcon name="sessions"/>:id==='light'?<Sun size={17} aria-hidden="true"/>:<Moon size={17} aria-hidden="true"/>}
            <span>{label}</span><i className="settings-checkmark" aria-hidden="true"/>
          </Button>)}
        </div>
      </div>
      <div className="settings-preference">
        <h4 id="settings-accent-label">Warna aksen</h4>
        <div className="accent-options" role="group" aria-labelledby="settings-accent-label">
          {accents.map(([id,label,color])=><Button key={id} type="button" className="button" aria-pressed={appearance.accent===id} onClick={()=>changeAppearance({...appearance,accent:id})}>
            <i className="settings-swatch" style={{backgroundColor:color}} aria-hidden="true"/>{label}<i className="settings-checkmark" aria-hidden="true"/>
          </Button>)}
        </div>
      </div>
    </div>
  </section>;
}

export function Account({user,appearance,changeAppearance,notify,passkeyAvailable}: {user:User;passkeyAvailable:boolean;appearance:Appearance;changeAppearance:(value:Appearance)=>void;notify:(text:string)=>void}) {
  const [category,setCategory]=useState<'personal'|'workspace'>();
  const settingsHeading=useRef<HTMLHeadingElement>(null);
  function openCategory(next?:'personal'|'workspace'){
    window.scrollTo(0,0);
    setCategory(next);
    requestAnimationFrame(()=>settingsHeading.current?.focus({preventScroll:true}));
  }
  const [password,setPassword]=useState(false);
  const [security,setSecurity]=useState<Security|null>(null);
  const [challenge,setChallenge]=useState<MfaChallenge|null>(null);
  const loadSecurity=()=>api<Security>('/auth/security').then(setSecurity);
  useEffect(()=>{if(!user.demo)loadSecurity().catch(e=>notify(e.message))},[user.id,notify]);
  async function startSetup(){try{setChallenge(await api<MfaChallenge>('/auth/mfa/setup','POST'))}catch(e){notify((e as Error).message)}}
  async function revoke(id:string){try{await api('/auth/sessions/'+id,'DELETE');await loadSecurity();notify('Sesi dicabut.')}catch(e){notify((e as Error).message)}}

  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function updatePassword(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    try{await api('/auth/password','PATCH',Object.fromEntries(new FormData(e.currentTarget)));setPassword(false);notify('Kata sandi diperbarui.')}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const showPasskey=passkeyAvailable&&!user.demo;
  return <><Heading title="Pengaturan" description={!category?"Kelola preferensi akun dan ruang kerja.":undefined} actions={category&&<ShellBack label="Kembali ke kategori pengaturan" onClick={()=>openCategory()}/>}/>
    <h2 className="settings-category-heading" ref={settingsHeading} tabIndex={-1}>
      {category==='workspace'?'Administrasi workspace':category==='personal'?'Personal':'Kategori pengaturan'}
    </h2>
    {!category?<div className="settings-categories">
      <SettingsCategory icon="profile" title="Personal" description="Lihat profil akun, sesuaikan tampilan aplikasi, dan kelola keamanan serta sesi masuk." onOpen={()=>openCategory('personal')}/>
      {user.workspaceAdmin&&<SettingsCategory icon="admin" title="Administrasi workspace" description="Kelola pengguna dan hak akses grup, serta lihat identitas yang digunakan pada dokumen workspace." onOpen={()=>openCategory('workspace')}/>}
    </div>:category==='workspace'&&user.workspaceAdmin?<WorkspaceSettings notify={notify}/>:<div className="settings-sections">
      <SettingsProfile user={user}/>
      <SettingsAppearance appearance={appearance} changeAppearance={changeAppearance}/>
      <section className="panel padded">
        <SettingsSectionHeading topic="security" description="Kelola kata sandi dan verifikasi akun."/>
        {security&&<p>Verifikasi dua langkah <Pill tone={security.mfa?'green':'amber'}>{security.mfa?'Aktif':'Belum aktif'}</Pill></p>}
        {user.demo?<p className="muted">Pengaturan keamanan tersedia setelah masuk dengan akun.</p>:<div className="heading-actions settings-actions">
          {security&&!security.mfa&&<Button type="button" className="button" onClick={startSetup}><NavIcon name="passkey"/> Aktifkan MFA</Button>}
          <Button type="button" className="button" onClick={()=>{setError('');setPassword(true)}}><NavIcon name="security"/> Ganti kata sandi</Button>
        </div>}
      </section>
      <section className="panel padded">
        <SettingsSectionHeading topic="sessions" description="Lihat sesi masuk akun yang tersedia."/>
        {security?security.sessions.map(session=><div className="settings-session-row" key={session.id}>
          <span>{dateLabel(new Date(session.created).toISOString(),'short')} · {new Date(session.created).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span>
          {session.current?<Pill tone="green">Sesi ini</Pill>:<Button className="button" onClick={()=>revoke(session.id)}>Cabut sesi</Button>}
        </div>):<p className="muted" role="status">Informasi sesi belum tersedia.</p>}
      </section>
      {showPasskey&&<PasskeySettings notify={notify}/>}
    </div>}{challenge&&<Dialog title="Atur MFA" close={()=>setChallenge(null)}><div className="dialog-content"><MfaForm challenge={challenge} done={()=>{setChallenge(null);void loadSecurity();notify('MFA diaktifkan.')}} cancel={()=>setChallenge(null)}/></div></Dialog>}{password&&<Dialog title="Ganti kata sandi" restoreFocus close={()=>setPassword(false)}><form onSubmit={updatePassword}><div className="dialog-content fields"><label><FieldLabel label="Kata sandi saat ini" required/><TextInput required name="old" type="password" placeholder="Kata sandi yang digunakan sekarang" autoComplete="current-password"/></label><label><FieldLabel label="Kata sandi baru" required/><TextInput required minLength={12} name="password" type="password" autoComplete="new-password" placeholder="Minimal 12 karakter"/></label>{error&&<ErrorBox message={error}/>}</div><div className="dialog-actions"><Button className="button primary" disabled={busy}>Simpan kata sandi</Button></div></form></Dialog>}</>;
}

type Log = {id:number;actor:string;action:string;subject:string;time:string};
export function Admin({notify,user}: {notify:(text:string)=>void;user:User}) {
  const [people,setPeople]=useState<(User&{mfa?:boolean})[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [error,setError]=useState('');
  const [adding,setAdding]=useState(false);
  const [busy,setBusy]=useState(false);
  const [locked,setLocked]=useState(false);
  const [resetAccount,setResetAccount]=useState<User>();
  async function refresh(){const [users,activity]=await Promise.all([api<(User&{mfa?:boolean})[]>('/users'),api<Log[]>('/audit-logs')]);setPeople(users);setLogs(activity)}
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
  async function patch(id:string,values:unknown){setError('');try{await api('/users/'+id,'PATCH',values);await refresh();notify('Akun diperbarui.')}catch(e){setError((e as Error).message)}}
  async function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    try{await api('/users','POST',Object.fromEntries(new FormData(e.currentTarget)));await refresh();notify('Pengguna ditambahkan.');setAdding(false)}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <><Heading title="Pengguna & audit" description="Kelola akses dan tinjau aktivitas ruang kerja." actions={<Button className="button primary" onClick={()=>{setError('');setAdding(true)}}><Plus size={17}/> Tambah pengguna</Button>}/>{error&&!adding&&<ErrorBox message={error}/>}<section className="panel"><div className="table-heading spaced"><h2>Pengguna</h2><button className={'chip '+(locked?'filter-selected':'')} onClick={()=>setLocked(!locked)}>Terkunci</button></div><DataTable rows={people.filter(p=>!locked||p.locked)} rowKey={p=>p.id} columns={[
    {id:'name',label:'Nama',sort:p=>p.name,render:p=><><strong>{p.name}</strong><br/><small>{p.email}</small></>},
    {id:'role',label:'Peran',sort:p=>p.role,render:p=>p.id===user.id||p.demo?roleNames[p.role]:<Select aria-label={'Peran '+p.name} value={p.role} onChange={e=>patch(p.id,{role:e.target.value})}>{roles.map(r=><option value={r} key={r}>{roleNames[r]}</option>)}</Select>},
    {id:'state',label:'Status',render:p=><Pill dot tone={p.locked?'amber':p.disabled?'neutral':'green'}>{p.locked?'Terkunci':p.disabled?'Nonaktif':'Aktif'}</Pill>},
    {id:'mfa',label:'MFA',render:p=><Pill tone={p.mfa?'green':'neutral'}>{p.mfa?'Aktif':'Belum aktif'}</Pill>},
    {id:'action',label:'Tindakan',render:p=>p.id!==user.id&&!p.demo&&<div className="heading-actions">{p.locked&&<Button className="button" onClick={()=>patch(p.id,{unlock:true})}>Buka kunci</Button>}<Button className="button" onClick={()=>patch(p.id,{disabled:!p.disabled})}>{p.disabled?'Aktifkan':'Nonaktifkan'}</Button>{p.mfa&&<Button className="button" onClick={()=>setResetAccount(p)}>Reset MFA</Button>}</div>},
  ]}/></section><section className="panel space-top"><div className="table-heading spaced"><h2>Log aktivitas</h2></div><DataTable rows={logs} rowKey={log=>String(log.id)} columns={[
    {id:'time',label:'Waktu',sort:l=>l.time,render:l=>dateLabel(l.time,'short')+' · '+new Date(l.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})},
    {id:'actor',label:'Pengguna',sort:l=>l.actor,render:l=>l.actor},{id:'action',label:'Aktivitas',sort:l=>l.action,render:l=>l.action},{id:'about',label:'Objek',render:l=>l.subject},
  ]} empty="Belum ada aktivitas."/></section>
  {resetAccount&&<ConfirmDialog title="Reset MFA" object={resetAccount.name}
    consequence="Konfigurasi MFA direset dan seluruh sesi pengguna ini dicabut." confirmLabel="Reset MFA"
    onCancel={()=>setResetAccount(undefined)} onConfirm={()=>{void patch(resetAccount.id,{resetMfa:true});setResetAccount(undefined)}}/>}
  {adding&&<Dialog title="Tambah pengguna" close={()=>setAdding(false)}><form onSubmit={add}><div className="dialog-content fields"><label><FieldLabel label="Nama" required/><TextInput name="name" placeholder="Rani Pratama" required/></label><label><FieldLabel label="Email" required/><TextInput name="email" type="email" placeholder="rani@example.com" required/></label><label><FieldLabel label="NIK" required/><TextInput name="nik" placeholder="20260014" required/></label><label>Peran<Select name="role" defaultValue="VIEWER">{roles.map(r=><option value={r} key={r}>{roleNames[r]}</option>)}</Select></label><label><FieldLabel label="Kata sandi awal" required/><TextInput type="password" name="password" minLength={12} placeholder="Minimal 12 karakter" required/></label>{error&&<ErrorBox message={error}/>}</div><div className="dialog-actions"><Button className="button primary" disabled={busy}>Buat pengguna</Button></div></form></Dialog>}</>;
}
