import { useEffect, useRef, useState } from 'react';
import { memoSections, type ExecutiveMemo } from '../../../packages/shared/executive-memo';
import type { Meeting } from '../../../packages/shared/domain';
import { Button, dateLabel, ErrorBox, PendingButton, PendingStatus } from './ui';

type MemoState =
  | {status:'loading'|'empty'}
  | {status:'ready';memo:ExecutiveMemo}
  | {status:'failed';message:string;during:'open'|'generate'};

async function requestMemo(meeting:Meeting,method:'GET'|'POST',signal?:AbortSignal):Promise<MemoState> {
  const response=await fetch('/api/v1/meetings/'+encodeURIComponent(meeting.id)+'/executive-memo',{
    method,signal,cache:'no-store',
    headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json','X-Shockwave-Request':'1'}:{})},
    body:method==='POST'?JSON.stringify({version:meeting.version}):undefined,
  });
  const data=await response.json().catch(()=>null) as {memo?:ExecutiveMemo|null;message?:string}|null;
  const during=method==='POST'?'generate':'open';
  if(!response.ok)return {
    status:'failed',during,
    message:typeof data?.message==='string'?data.message:'Memo tidak dapat diakses.',
  };
  if(data?.memo===null&&method==='GET')return {status:'empty'};
  const memo=data?.memo;
  if(!memo||memo.mode!=='prototype'||memo.meetingId!==meeting.id||memo.sourceVersion!==meeting.version){
    return {status:'failed',message:'Memo tidak sesuai dengan versi arsip rapat. Muat ulang status.',during:'open'};
  }
  return {status:'ready',memo};
}

export function useExecutiveMemo(meeting:Meeting) {
  const [state,setState]=useState<MemoState>({status:'loading'});
  const [sending,setSending]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const working=useRef(false);
  const lifetime=useRef<AbortController>();
  const {id,version,status}=meeting;
  useEffect(()=>{
    if(status!=='final')return;
    const controller=new AbortController();
    lifetime.current=controller;
    setState({status:'loading'});setSending(false);
    requestMemo(meeting,'GET',controller.signal)
      .then(result=>{if(!controller.signal.aborted)setState(result)})
      .catch(()=>{if(!controller.signal.aborted)setState({status:'failed',message:'Status memo tidak dapat dimuat.',during:'open'})});
    return ()=>controller.abort();
  },[id,version,status,attempt]);

  async function generate(){
    if(status!=='final'||working.current||!(state.status==='empty'||state.status==='failed'&&state.during==='generate'))return false;
    const signal=lifetime.current?.signal;
    working.current=true;
    setSending(true);
    try {
      const [result]=await Promise.all([requestMemo(meeting,'POST',signal),new Promise<void>(resolve=>setTimeout(resolve,450))]);
      if(signal?.aborted)return false;
      setState(result);
      return result.status==='ready';
    } catch {
      if(!signal?.aborted)setState({status:'failed',message:'Hasil pembuatan memo belum dapat dipastikan. Muat ulang status.',during:'open'});
      return false;
    } finally {
      working.current=false;
      if(!signal?.aborted)setSending(false);
    }
  }

  return {state,sending,generate,refresh:()=>setAttempt(value=>value+1)};
}

export function ExecutiveMemoControl({state,sending,canGenerate,generate,refresh}:{
  state:MemoState;sending:boolean;canGenerate:boolean;generate:()=>void;refresh:()=>void;
}) {
  if(state.status==='ready')return null;
  if(state.status==='loading')return <PendingStatus message="Memeriksa memo eksekutif…"/>;
  const canSubmit=canGenerate&&!(state.status==='failed'&&state.during==='open');
  return <section className="space-top fields" aria-label="Memo eksekutif">
    {canGenerate&&<p className="muted">Prototipe · Memo diolah dari ringkasan rapat di perangkat ini.</p>}
    {state.status==='failed'&&<ErrorBox message={state.message}/>}
    {state.status==='empty'&&!canGenerate&&<p className="muted">Memo eksekutif belum dibuat.</p>}
    {canSubmit&&<PendingButton type="button" className="button primary"
      pending={sending?'Membuat memo eksekutif…':undefined} onClick={generate}>
      {state.status==='failed'?'Coba buat memo lagi':'Generate memo eksekutif'}
    </PendingButton>}
    {(state.status==='failed'&&state.during==='open')&&
      <Button type="button" className="button" onClick={refresh}>Muat ulang status memo</Button>}
  </section>;
}

export function ExecutiveMemoContents({memo,meeting}:{memo:ExecutiveMemo;meeting:Meeting}) {
  const projects=new Map(meeting.projects.map(project=>[project.id,project.detail.name]));
  const {reviewed,total,updated,unchanged,source}=memo.coverage;
  const coverage=[reviewed+' dari '+total+' proyek ditinjau',updated+' diperbarui',unchanged+' tanpa perubahan',...(source?[source+' dari arsip sumber']:[])];
  return <>
    <p className="muted">Prototipe · Diolah lokal dari ringkasan rapat</p>
    {memoSections.map(([id,label])=><section className="paper-section executive-memo-section" key={id}>
      <h3>{label}</h3>
      {id==='summary'&&<p>{coverage.join(' · ')}</p>}
      {memo[id].length?<ul>{memo[id].map((entry,index)=><li key={index}>
        <strong>{projects.get(entry.projectId)??entry.projectId}</strong> · {entry.text}
      </li>)}</ul>:<p>Tidak tercatat dalam ringkasan rapat.</p>}
    </section>)}
    <section className="paper-section">
      <h3>Tindak lanjut</h3>
      {memo.actions.length?<table className="executive-memo-actions">
        <thead><tr><th>Proyek</th><th>Tindak lanjut</th><th>PIC</th><th>Tenggat</th><th>Status</th></tr></thead>
        <tbody>{memo.actions.map(action=><tr key={action.ref}>
          <td>{projects.get(action.projectId)??action.projectId}</td><td>{action.text}</td><td>{action.pic||'—'}</td>
          <td>{/^\d{4}-\d{2}-\d{2}$/.test(action.due)&&Number.isFinite(Date.parse(action.due))?dateLabel(action.due):action.due||'—'}</td>
          <td>{action.status}</td>
        </tr>)}</tbody>
      </table>:<p>Tidak tercatat dalam memo.</p>}
    </section>
  </>;
}
