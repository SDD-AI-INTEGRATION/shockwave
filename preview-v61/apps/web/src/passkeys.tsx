import { NavIcon } from './nav-icon';
import { SettingsSectionHeading } from './settings-section';
import { TextInput } from './form-controls';
import { Fingerprint, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  browserSupportsWebAuthn, startAuthentication, startRegistration,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { Button, api, FieldLabel, dateLabel, Dialog, ErrorBox } from './ui';

type Passkey={id:string;label:string;createdAt:string};

export const canUsePasskeys=()=>isSecureContext&&browserSupportsWebAuthn();

function passkeyError(error:unknown) {
  if(error instanceof Error&&['NotAllowedError','AbortError','ERROR_CEREMONY_ABORTED'].includes(error.name)){
    return 'Verifikasi passkey dibatalkan atau tidak selesai.';
  }
  return error instanceof Error?error.message:'Passkey tidak dapat digunakan.';
}

export async function loginWithPasskey<T>(onPhase:(phase:'device'|'verify')=>void){
  try{
    const optionsJSON=await api<PublicKeyCredentialRequestOptionsJSON>('/auth/passkeys/login/options','POST');
    onPhase('device');
    const response=await startAuthentication({optionsJSON});
    onPhase('verify');
    return await api<T>('/auth/passkeys/login/verify','POST',response);
  }catch(error){
    throw new Error(passkeyError(error));
  }
}

export function PasskeySettings({notify}: {notify:(message:string)=>void}) {
  const [keys,setKeys]=useState<Passkey[]>([]);
  const [loadError,setLoadError]=useState('');
  const [action,setAction]=useState<'register'|Passkey|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const supported=canUsePasskeys();

  useEffect(()=>{
    api<Passkey[]>('/auth/passkeys').then(setKeys).catch(error=>setLoadError(error.message));
  },[]);

  function open(next:'register'|Passkey){
    setError('');
    setAction(next);
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!action||busy)return;
    const password=String(new FormData(event.currentTarget).get('password')||'');
    const adding=action==='register';
    setBusy(true);setError('');
    try{
      if(adding){
        const optionsJSON=await api<PublicKeyCredentialCreationOptionsJSON>('/auth/passkeys/register/options','POST',{password});
        const response=await startRegistration({optionsJSON});
        await api('/auth/passkeys/register/verify','POST',response);
      }else{
        await api('/auth/passkeys/'+encodeURIComponent(action.id),'DELETE',{password});
      }
    }catch(error){
      setError(passkeyError(error));setBusy(false);return;
    }
    setBusy(false);
    setAction(null);
    notify(adding?'Passkey berhasil ditambahkan.':'Passkey dihapus.');
    try{setKeys(await api<Passkey[]>('/auth/passkeys'));setLoadError('')}
    catch(error){setLoadError(passkeyError(error))}
  }

  return <section className="panel padded">
    <SettingsSectionHeading topic="passkey" description="Gunakan Face ID, sidik jari, atau PIN perangkat untuk masuk. Pendaftaran Preview berlaku di browser ini."/>
    {loadError&&<ErrorBox message={loadError}/>}
    {keys.map(key=><div className="history-row" key={key.id}><span><Fingerprint size={16}/> {key.label}<small className="block muted">{dateLabel(key.createdAt,'short')}</small></span><button className="icon-button danger-text" type="button" aria-label={'Hapus '+key.label} onClick={()=>open(key)}><NavIcon name="trash"/></button></div>)}
    <Button className="button space-top" type="button" disabled={!supported} onClick={()=>open('register')}><Plus size={16}/> Tambah passkey</Button>
    {!supported&&<p className="muted">Browser ini tidak mendukung pendaftaran passkey.</p>}
    {action&&<Dialog title={action==='register'?'Daftarkan passkey':'Hapus passkey'} close={()=>{if(!busy)setAction(null)}}>
      <form onSubmit={submit}>
        <div className="dialog-content fields">
          <p className="muted">{action==='register'?'Konfirmasi kata sandi, lalu ikuti petunjuk perangkat untuk membuat passkey.':'Konfirmasi kata sandi untuk mencabut akses dengan passkey ini.'}</p>
          <label><FieldLabel label="Kata sandi saat ini" required/><TextInput autoFocus type="password" name="password" placeholder="Kata sandi yang digunakan sekarang" autoComplete="current-password" required maxLength={512}/></label>
          {error&&<ErrorBox message={error}/>}
        </div>
        <div className="dialog-actions">
          <Button className="button" type="button" onClick={()=>setAction(null)} disabled={busy}>Batal</Button>
          <Button className={'button '+(action==='register'?'primary':'destructive')} disabled={busy}>{!busy&&action!=='register'&&<NavIcon name="trash"/>}{busy?'Memverifikasi…':action==='register'?'Daftarkan passkey':'Hapus passkey'}</Button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
