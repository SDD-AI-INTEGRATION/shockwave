import { WorkspaceSettings } from './workspace-settings';
import { KeyRound, LogOut, Monitor, Moon, Plus, Shield, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleNames, roles } from '../../../packages/shared/domain';
import { canUsePasskeys, loginWithPasskey, PasskeySettings } from './passkeys';
import { api, DataTable, dateLabel, Dialog, ErrorBox, Heading, PendingButton, PendingStatus, Pill, type Appearance, type User } from './ui';

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
  if(backup)return <div className="fields"><h2>Simpan kode cadangan</h2><p className="muted">Simpan kode di tempat aman. Setiap kode berlaku satu kali.</p><div className="recovery-codes">{backup.backupCodes.map(code=><code key={code}>{code}</code>)}</div><button type="button" className="button primary" onClick={()=>done(backup.user)}>Lanjutkan</button></div>;
  return <form className="fields mfa-form" onSubmit={submit}>
    <small className="muted">Langkah 2 dari 2</small>
    <h2>{challenge.setupKey?'Aktifkan verifikasi dua langkah':'Kode verifikasi'}</h2>
    <p className="muted">{asBackup?'Pakai salah satu kode cadangan Anda.':'Masukkan 6 digit dari aplikasi autentikator.'}</p>
    {challenge.setupKey&&<><p className="muted">Tambahkan kunci ini ke aplikasi autentikator.</p><code className="setup-key">{challenge.setupKey}</code></>}
    <label htmlFor="mfa-code" className={asBackup?'':'otp-field'}>
      {asBackup?'Kode cadangan':<span className="visually-hidden">Kode 6 digit</span>}
      {!asBackup&&<span className="otp-slots" aria-hidden="true">{Array.from({length:6},(_,index)=><span className={index===Math.min(code.length,5)?'current':''} key={index}>{code[index]}</span>)}</span>}
      <input id="mfa-code" name="code" autoFocus autoComplete="one-time-code" minLength={asBackup?12:6} maxLength={asBackup?12:6} inputMode={asBackup?'text':'numeric'} value={code} onChange={e=>setCode(asBackup?e.target.value.replace(/[^0-9a-f]/gi,''):e.target.value.replace(/[^0-9]/g,''))} required />
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
          <label>Kata sandi baru<input autoFocus type="password" required minLength={12} name="password" autoComplete="new-password"/><small className="muted">Minimal 12 karakter.</small></label>
          <label>Ulangi<input type="password" required minLength={12} name="confirm" autoComplete="new-password"/></label>
        </>:<label>Email<input autoFocus name="id" type="email" autoComplete="email" required/></label>}
        {error&&<ErrorBox message={error}/>}
        <PendingButton className="button primary" pending={pending==='reset'?status:undefined}>{mode==='reset'?'Simpan kata sandi':'Kirim tautan'}</PendingButton>
        {mode==='reset'&&<p className="login-footnote">Semua perangkat lain akan dikeluarkan.</p>}
        <button type="button" className="button" disabled={busy} onClick={()=>switchMode('login')}>Kembali</button>
      </form>:
      <form className="fields login-form" onSubmit={submit}>
        <header><h1>Masuk</h1><p className="muted">Gunakan akun Anda untuk melanjutkan.</p></header>
        {notice&&<p role="status" className="notice-box">{notice}</p>}
        <label htmlFor="login-id">Email<input id="login-id" type="email" required name="id" autoComplete="username" placeholder="nama@perusahaan.com"/></label>
        <div className="field">
          <label htmlFor="login-password">Kata sandi</label>
          <div className="password-input">
            <input id="login-password" name="password" autoComplete="current-password" placeholder="Masukkan kata sandi Anda" type={show?'text':'password'} required onKeyDown={e=>setCaps(e.getModifierState('CapsLock'))} onKeyUp={e=>setCaps(e.getModifierState('CapsLock'))} onBlur={()=>setCaps(false)}/>
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
            :<button type="button" className="button" disabled={busy} onClick={()=>showFeedback('google','Google Sign-In belum dikonfigurasi di Preview.')}>{googleLabel}</button>}
          {feedback?.action==='google'&&<ErrorBox message={feedback.message}/>}
          <PendingButton type="button" className="button" disabled={busy&&pending!=='passkey'} pending={pending==='passkey'?status:undefined} onClick={usePasskey}>
            <span className="login-passkey-icon" aria-hidden="true"/>
            Masuk dengan Passkey
          </PendingButton>
          {feedback?.action==='passkey'&&<ErrorBox message={feedback.message}/>}
        </div>
        {demo&&<button type="button" className="button" disabled={busy} onClick={openDemo}>{pending==='demo'?'Memproses…':'Buka ruang kerja demo'}</button>}
      </form>}
    </section>
  </main>;
}

const accents=[['shockwave','Biru Shockwave','#1e31ae'],['violet','Ungu Shockwave','#6b4ce6'],['teal','Toska','#138e82'],['green','Hijau','#16915f'],['orange','Oranye','#be6218'],['red','Merah','#bf4444'],['graphite','Grafit','#545e78']];
export function Account({user,appearance,changeAppearance,logout,notify,passkeyAvailable}: {user:User;passkeyAvailable:boolean;appearance:Appearance;changeAppearance:(value:Appearance)=>void;logout:()=>void;notify:(text:string)=>void}) {
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
  return <><Heading title="Pengaturan" description="Kelola akun dan ruang kerja."/>{user.workspaceAdmin&&<WorkspaceSettings notify={notify}/>}<div className="account-grid">
    <section className="panel padded"><h2>Profil</h2><dl className="detail-grid"><div><dt>Nama</dt><dd>{user.name}</dd></div><div><dt>Peran</dt><dd>{roleNames[user.role]}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>NIK</dt><dd>{user.nik}</dd></div></dl></section>
    <section className="panel padded"><h2>Tampilan</h2><p className="muted">Biru Shockwave terang dipakai setiap kali halaman dibuka. Pilihan di bawah berlaku sampai halaman dimuat ulang atau Anda keluar.</p><p className="muted space-top">Tema</p><div className="theme-options">{([['system','Ikuti perangkat',Monitor],['light','Terang',Sun],['dark','Gelap',Moon]] as const).map(([id,label,Icon])=><button key={id} className={'theme-option '+(appearance.theme===id?'selected':'')} aria-pressed={appearance.theme===id} onClick={()=>changeAppearance({...appearance,theme:id})}><Icon size={18}/>{label}</button>)}</div><p className="muted">Warna aksen</p><div className="accent-options">{accents.map(([id,label,color])=><button key={id} aria-label={label} title={label} aria-pressed={appearance.accent===id} onClick={()=>changeAppearance({...appearance,accent:id})}><i aria-hidden="true" style={{background:color}}/>{label}</button>)}</div></section>
    <section className="panel padded"><h2>Keamanan</h2>{security&&<><p className="space-top">Verifikasi dua langkah <Pill tone={security.mfa?'green':'amber'}>{security.mfa?'Aktif':'Belum aktif'}</Pill></p>{!security.mfa&&<button className="button space-top" onClick={startSetup}><KeyRound size={16}/> Aktifkan MFA</button>}</>}<div className="heading-actions space-top">{!user.demo&&<button className="button" onClick={()=>{setError('');setPassword(true)}}><Shield size={16}/> Ganti kata sandi</button>}<button className={user.demo?'button':'button logout-button'} onClick={logout}><LogOut size={16}/> {user.demo?'Masuk dengan akun':'Keluar dari sesi'}</button></div></section>
    {security&&<section className="panel padded"><h2>Sesi aktif</h2>{security.sessions.map(session=><div className="history-row" key={session.id}><span>{dateLabel(new Date(session.created).toISOString(),'short')} · {new Date(session.created).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span>{session.current?<Pill tone="green">Sesi ini</Pill>:<button className="button" onClick={()=>revoke(session.id)}>Cabut sesi</button>}</div>)}</section>}
    {passkeyAvailable&&!user.demo&&<PasskeySettings notify={notify}/>}
  </div>{challenge&&<Dialog title="Atur MFA" close={()=>setChallenge(null)}><div className="dialog-content"><MfaForm challenge={challenge} done={()=>{setChallenge(null);void loadSecurity();notify('MFA diaktifkan.')}} cancel={()=>setChallenge(null)}/></div></Dialog>}{password&&<Dialog title="Ganti kata sandi" close={()=>setPassword(false)}><form onSubmit={updatePassword}><div className="dialog-content fields"><label>Kata sandi saat ini<input required name="old" type="password" autoComplete="current-password"/></label><label>Kata sandi baru<input required minLength={12} name="password" type="password" autoComplete="new-password"/></label>{error&&<ErrorBox message={error}/>}</div><div className="dialog-actions"><button className="button primary" disabled={busy}>Simpan kata sandi</button></div></form></Dialog>}</>;
}

type Log = {id:number;actor:string;action:string;subject:string;time:string};
export function Admin({notify,user}: {notify:(text:string)=>void;user:User}) {
  const [people,setPeople]=useState<(User&{mfa?:boolean})[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [error,setError]=useState('');
  const [adding,setAdding]=useState(false);
  const [busy,setBusy]=useState(false);
  const [locked,setLocked]=useState(false);
  async function refresh(){const [users,activity]=await Promise.all([api<(User&{mfa?:boolean})[]>('/users'),api<Log[]>('/audit-logs')]);setPeople(users);setLogs(activity)}
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
  async function patch(id:string,values:unknown){setError('');try{await api('/users/'+id,'PATCH',values);await refresh();notify('Akun diperbarui.')}catch(e){setError((e as Error).message)}}
  async function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    try{await api('/users','POST',Object.fromEntries(new FormData(e.currentTarget)));await refresh();notify('Pengguna ditambahkan.');setAdding(false)}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <><Heading title="Pengguna & audit" description="Kelola akses dan tinjau aktivitas ruang kerja." actions={<button className="button primary" onClick={()=>{setError('');setAdding(true)}}><Plus size={17}/> Tambah pengguna</button>}/>{error&&!adding&&<ErrorBox message={error}/>}<section className="panel"><div className="table-heading spaced"><h2>Pengguna</h2><button className={'chip '+(locked?'filter-selected':'')} onClick={()=>setLocked(!locked)}>Terkunci</button></div><DataTable rows={people.filter(p=>!locked||p.locked)} rowKey={p=>p.id} columns={[
    {id:'name',label:'Nama',sort:p=>p.name,render:p=><><strong>{p.name}</strong><br/><small>{p.email}</small></>},
    {id:'role',label:'Peran',sort:p=>p.role,render:p=>p.id===user.id||p.demo?roleNames[p.role]:<select aria-label={'Peran '+p.name} value={p.role} onChange={e=>patch(p.id,{role:e.target.value})}>{roles.map(r=><option value={r} key={r}>{roleNames[r]}</option>)}</select>},
    {id:'state',label:'Status',render:p=><Pill dot tone={p.locked?'amber':p.disabled?'neutral':'green'}>{p.locked?'Terkunci':p.disabled?'Nonaktif':'Aktif'}</Pill>},
    {id:'mfa',label:'MFA',render:p=><Pill tone={p.mfa?'green':'neutral'}>{p.mfa?'Aktif':'Belum aktif'}</Pill>},
    {id:'action',label:'Tindakan',render:p=>p.id!==user.id&&!p.demo&&<div className="heading-actions">{p.locked&&<button className="button" onClick={()=>patch(p.id,{unlock:true})}>Buka kunci</button>}<button className="button" onClick={()=>patch(p.id,{disabled:!p.disabled})}>{p.disabled?'Aktifkan':'Nonaktifkan'}</button>{p.mfa&&<button className="button" onClick={()=>{if(window.confirm('Reset MFA dan cabut sesi pengguna ini?'))void patch(p.id,{resetMfa:true})}}>Reset MFA</button>}</div>},
  ]}/></section><section className="panel space-top"><div className="table-heading spaced"><h2>Log aktivitas</h2></div><DataTable rows={logs} rowKey={log=>String(log.id)} columns={[
    {id:'time',label:'Waktu',sort:l=>l.time,render:l=>dateLabel(l.time,'short')+' · '+new Date(l.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})},
    {id:'actor',label:'Pengguna',sort:l=>l.actor,render:l=>l.actor},{id:'action',label:'Aktivitas',sort:l=>l.action,render:l=>l.action},{id:'about',label:'Objek',render:l=>l.subject},
  ]} empty="Belum ada aktivitas."/></section>
  {adding&&<Dialog title="Tambah pengguna" close={()=>setAdding(false)}><form onSubmit={add}><div className="dialog-content fields"><label>Nama<input name="name" required/></label><label>Email<input name="email" type="email" required/></label><label>NIK<input name="nik" required/></label><label>Peran<select name="role" defaultValue="VIEWER">{roles.map(r=><option value={r} key={r}>{roleNames[r]}</option>)}</select></label><label>Kata sandi awal<input type="password" name="password" minLength={12} required/></label>{error&&<ErrorBox message={error}/>}</div><div className="dialog-actions"><button className="button primary" disabled={busy}>Buat pengguna</button></div></form></Dialog>}</>;
}
